// Copyright (C) 2026 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {HighPrecisionTimeSpan} from '../../base/high_precision_time_span';
import {time, Time} from '../../base/time';
import {PerfettoPlugin} from '../../public/plugin';
import {
  Selection,
  SelectionOpts,
  TrackEventSelection,
} from '../../public/selection';
import {Track} from '../../public/track';
import {Trace} from '../../public/trace';
import {TrackNode} from '../../public/workspace';

const SELECT_TIMEOUT_MS = 5000;
const TEMPORARY_NOTE_ID = '__temp__';

type TrackLookup = (uri: string) => Track | undefined;

/** Metadata for one workspace track row (for automation / debugging). */
export interface TraceUiTrackInfo {
  readonly name: string;
  readonly title: string;
  readonly uri?: string;
  readonly kind?: string;
  readonly kinds?: ReadonlyArray<string>;
  readonly type?: string;
  readonly groupName?: string;
  readonly fullPath: ReadonlyArray<string>;
  readonly isPinned: boolean;
}

export interface TraceUiSelectResult {
  readonly ok: boolean;
  readonly kind: Selection['kind'];
  readonly trackUri?: string;
  readonly eventId?: number;
  readonly reason?: string;
}

export interface TraceUiPinResult {
  readonly matched: number;
  readonly pinned: number;
  readonly tracks: ReadonlyArray<TraceUiTrackInfo>;
}

export interface TraceUiActionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface TraceUiResetResult {
  readonly unpinned: number;
  readonly removedTemporaryNote: boolean;
}

/**
 * Imperative API for browser automation (e.g. Playwright): select slices, pin
 * tracks, zoom, and annotate without relying on DOM structure.
 */
export interface TraceUiAutomationApi {
  isReady(): boolean;
  selectSlice(
    id: number,
    opts?: SelectionOpts,
  ): Promise<TraceUiSelectResult>;
  selectSqlEvent(
    table: string,
    id: number,
    opts?: SelectionOpts,
  ): Promise<TraceUiSelectResult>;
  pinTrack(pattern: string): TraceUiPinResult;
  pinTrackByName(pattern: string): TraceUiPinResult;
  pinTrackByKind(kind: string): TraceUiPinResult;
  pinTrackByUri(
    uri: string,
  ): TraceUiPinResult & {readonly track?: TraceUiTrackInfo};
  unpinAll(): {readonly unpinned: number};
  zoomTo(
    startNs: string | number | bigint,
    endNs: string | number | bigint,
  ): TraceUiActionResult;
  panTo(tsNs: string | number | bigint): TraceUiActionResult;
  mark(): Promise<TraceUiActionResult>;
  markPermanent(): TraceUiActionResult;
  addSpanNote(
    startNs: string | number | bigint,
    endNs: string | number | bigint,
    color?: string,
    text?: string,
  ): {readonly id: string};
  reset(): TraceUiResetResult;
  listTracks(): ReadonlyArray<TraceUiTrackInfo>;
}

interface ResolvedTrackEvent {
  readonly eventId: number;
  readonly trackUri: string;
}

declare global {
  interface Window {
    traceUiAutomation: TraceUiAutomationApi | undefined;
  }
}

export default class UiAutomationBridgePlugin implements PerfettoPlugin {
  static readonly id = 'dev.perfetto.UiAutomationBridge';

  async onTraceLoad(trace: Trace): Promise<void> {
    let ready = false;

    const pinTracksByName = (pattern: string): TraceUiPinResult => {
      assertReady(ready);
      const matches = findTracksByName(trace.currentWorkspace.flatTracksOrdered, pattern);
      const pinned = pinTracks(matches);
      return {
        matched: matches.length,
        pinned: pinned.length,
        tracks: matches.map((track) => getTrackInfo(trace, track)),
      };
    };

    const bridge: TraceUiAutomationApi = {
      isReady: () => ready,

      selectSlice: (id, opts) => {
        assertReady(ready);
        return selectResolvedSqlEvent(trace, 'slice', id, opts, true);
      },

      selectSqlEvent: (table, id, opts) => {
        assertReady(ready);
        return selectResolvedSqlEvent(trace, table, id, opts);
      },

      pinTrack: (pattern) => pinTracksByName(pattern),

      pinTrackByName: (pattern) => pinTracksByName(pattern),

      pinTrackByKind: (kind) => {
        assertReady(ready);
        const matches = findTracksByKind(
          trace.currentWorkspace.flatTracksOrdered,
          kind,
          (uri) => trace.tracks.getTrack(uri),
        );
        const pinned = pinTracks(matches);
        return {
          matched: matches.length,
          pinned: pinned.length,
          tracks: matches.map((track) => getTrackInfo(trace, track)),
        };
      },

      pinTrackByUri: (uri) => {
        assertReady(ready);
        const track = trace.currentWorkspace.getTrackByUri(uri);
        if (track === undefined) {
          return {
            matched: 0,
            pinned: 0,
            tracks: [],
          };
        }
        const pinned = pinTracks([track]);
        const trackInfo = getTrackInfo(trace, track);
        return {
          matched: 1,
          pinned: pinned.length,
          tracks: [trackInfo],
          track: trackInfo,
        };
      },

      unpinAll: () => {
        assertReady(ready);
        return {
          unpinned: unpinAllTracks(trace),
        };
      },

      zoomTo: (startNs, endNs) => {
        assertReady(ready);
        const start = nsToTime(startNs);
        const end = nsToTime(endNs);
        if (start >= end) {
          throw new Error('zoomTo requires startNs < endNs');
        }
        trace.timeline.setVisibleWindow(HighPrecisionTimeSpan.fromTime(start, end));
        return {ok: true};
      },

      panTo: (tsNs) => {
        assertReady(ready);
        trace.timeline.panIntoView(nsToTime(tsNs), {align: 'center'});
        return {ok: true};
      },

      mark: async () => {
        assertReady(ready);
        const range = trace.selection.getTimeSpanOfSelection();
        if (range === undefined) {
          return {ok: false, reason: 'No selection range to mark'};
        }
        trace.notes.addSpanNote({
          start: range.start,
          end: range.end,
          id: TEMPORARY_NOTE_ID,
        });
        const selection = trace.selection.selection;
        if (selection.kind === 'track_event') {
          trace.selection.selectArea({
            start: range.start,
            end: range.end,
            trackUris: [selection.trackUri],
          });
        }
        const note = await waitForValue(
          () => trace.notes.getNote(TEMPORARY_NOTE_ID),
          (current) => current !== undefined,
        );
        return note !== undefined
          ? {ok: true}
          : {ok: false, reason: 'Timed out waiting for temporary note'};
      },

      markPermanent: () => {
        assertReady(ready);
        const range = trace.selection.getTimeSpanOfSelection();
        if (range === undefined) {
          return {ok: false, reason: 'No selection range to mark'};
        }
        trace.notes.addSpanNote({
          start: range.start,
          end: range.end,
        });
        return {ok: true};
      },

      addSpanNote: (startNs, endNs, color, text) => {
        assertReady(ready);
        const start = nsToTime(startNs);
        const end = nsToTime(endNs);
        if (start >= end) {
          throw new Error('addSpanNote requires startNs < endNs');
        }
        const id = trace.notes.addSpanNote({
          start,
          end,
          color,
          text,
        });
        return {id};
      },

      reset: () => {
        assertReady(ready);
        const unpinned = unpinAllTracks(trace);
        trace.selection.clearSelection();
        return {
          unpinned,
          removedTemporaryNote: false,
        };
      },

      listTracks: () => {
        assertReady(ready);
        return trace.currentWorkspace.flatTracksOrdered
          .filter((track) => track.uri !== undefined)
          .map((track) => getTrackInfo(trace, track));
      },
    };

    window.traceUiAutomation = bridge;
    trace.onTraceReady.addListener(() => {
      ready = true;
    });
    trace.trash.defer(() => {
      if (window.traceUiAutomation === bridge) {
        window.traceUiAutomation = undefined;
      }
    });
  }
}

export function nsToTime(raw: string | number | bigint): time {
  return Time.fromRaw(BigInt(raw));
}

export function trackNodeToInfo(
  trackNode: TrackNode,
  getTrack: TrackLookup,
): TraceUiTrackInfo {
  const track = trackNode.uri ? getTrack(trackNode.uri) : undefined;
  const kinds = trackKinds(track);
  const type = trackType(track);
  return {
    name: trackNode.name,
    title: trackNode.name,
    uri: trackNode.uri,
    kind: kinds?.[0] ?? type,
    kinds,
    type,
    groupName: trackNode.parent?.name || undefined,
    fullPath: trackNode.fullPath,
    isPinned: trackNode.isPinned,
  };
}

export function findTracksByName(
  tracks: ReadonlyArray<TrackNode>,
  pattern: string,
): TrackNode[] {
  const normalizedPattern = normalizeString(pattern);
  if (normalizedPattern === '') {
    return [];
  }
  return tracks.filter((track) => {
    if (track.uri === undefined) {
      return false;
    }
    const name = normalizeString(track.name);
    const fullPath = normalizeString(track.fullPath.join(' > '));
    return name.includes(normalizedPattern) || fullPath.includes(normalizedPattern);
  });
}

export function findTracksByKind(
  tracks: ReadonlyArray<TrackNode>,
  kind: string,
  getTrack: TrackLookup,
): TrackNode[] {
  const normalizedKind = normalizeString(kind);
  if (normalizedKind === '') {
    return [];
  }
  return tracks.filter((track) => {
    if (track.uri === undefined) {
      return false;
    }
    const descriptor = getTrack(track.uri);
    const kinds = trackKinds(descriptor) ?? [];
    const type = trackType(descriptor);
    return (
      kinds.some((candidate) => normalizeString(candidate) === normalizedKind) ||
      normalizeString(type ?? '') === normalizedKind
    );
  });
}

export function pinTracks(tracks: ReadonlyArray<TrackNode>): TrackNode[] {
  const pinned: TrackNode[] = [];
  for (const track of tracks) {
    if (track.uri === undefined || track.isPinned) {
      continue;
    }
    track.pin();
    pinned.push(track);
  }
  return pinned;
}

function getTrackInfo(trace: Trace, trackNode: TrackNode): TraceUiTrackInfo {
  return trackNodeToInfo(trackNode, (uri) => trace.tracks.getTrack(uri));
}

function trackKinds(track: Track | undefined): ReadonlyArray<string> | undefined {
  const kinds = track?.tags?.kinds;
  return Array.isArray(kinds) ? kinds : undefined;
}

function trackType(track: Track | undefined): string | undefined {
  return typeof track?.tags?.type === 'string' ? track.tags.type : undefined;
}

function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

function assertReady(ready: boolean): void {
  if (!ready) {
    throw new Error('trace UI automation bridge is not ready yet');
  }
}

function unpinAllTracks(trace: Trace): number {
  const pinnedTracks = [...trace.currentWorkspace.pinnedTracks];
  for (const track of pinnedTracks) {
    trace.currentWorkspace.unpinTrack(track);
  }
  return pinnedTracks.length;
}

function isTrackEventSelection(
  selection: Selection | undefined,
): selection is TrackEventSelection {
  return selection?.kind === 'track_event';
}

function matchesTrackEventSelection(
  selection: Selection | undefined,
  expected: ResolvedTrackEvent,
): selection is TrackEventSelection {
  return (
    isTrackEventSelection(selection) &&
    selection.trackUri === expected.trackUri &&
    selection.eventId === expected.eventId
  );
}

function selectionResult(
  selection: Selection | undefined,
  reason: string,
): TraceUiSelectResult {
  if (isTrackEventSelection(selection)) {
    return {
      ok: true,
      kind: selection.kind,
      trackUri: selection.trackUri,
      eventId: selection.eventId,
    };
  }

  return {
    ok: false,
    kind: selection?.kind ?? 'empty',
    reason,
  };
}

async function selectResolvedSqlEvent(
  trace: Trace,
  table: string,
  id: number,
  opts?: SelectionOpts,
  focusSelection = false,
): Promise<TraceUiSelectResult> {
  const expected = (await trace.selection.resolveSqlEvents(table, [id]))[0];
  if (expected === undefined) {
    return {
      ok: false,
      kind: trace.selection.selection.kind,
      reason: `Could not resolve ${table} row ${id}`,
    };
  }

  const shouldFocus = focusSelection && opts?.scrollToSelection !== false;
  const selectionOpts: SelectionOpts = shouldFocus
    ? {
        switchToCurrentSelectionTab: true,
        ...opts,
        // Avoid the default "pan only" behavior; we'll do a focused jump below.
        scrollToSelection: false,
      }
    : {
        scrollToSelection: true,
        switchToCurrentSelectionTab: true,
        ...opts,
      };

  trace.selection.selectTrackEvent(expected.trackUri, expected.eventId, {
    ...selectionOpts,
  });
  const selection = await waitForValue(
    () => trace.selection.selection,
    (current) => matchesTrackEventSelection(current, expected),
  );
  if (shouldFocus && matchesTrackEventSelection(selection, expected)) {
    trace.selection.scrollToSelection('focus');
    await nextAnimationFrame();
  }
  return selectionResult(selection, `Timed out waiting for ${table} selection`);
}

async function waitForValue<T>(
  currentValue: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = SELECT_TIMEOUT_MS,
): Promise<T | undefined> {
  const deadline = performance.now() + timeoutMs;
  do {
    const value = currentValue();
    if (predicate(value)) {
      return value;
    }
    await nextAnimationFrame();
  } while (performance.now() < deadline);

  return undefined;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
