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
const SNAPSHOT_HIGHLIGHT_NOTE_PREFIX = '__perfbox_uiauto_highlight__';

type TrackLookup = (uri: string) => Track | undefined;

/** Metadata for one workspace track row (for automation / debugging). */
export interface UiAutoTrackInfo {
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

export interface UiAutoSelectResult {
  readonly ok: boolean;
  readonly kind: Selection['kind'];
  readonly trackUri?: string;
  readonly eventId?: number;
  readonly reason?: string;
}

export interface UiAutoPinResult {
  readonly matched: number;
  readonly pinned: number;
  readonly tracks: ReadonlyArray<UiAutoTrackInfo>;
}

export interface UiAutoActionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface UiAutoResetResult {
  readonly unpinned: number;
  readonly removedTemporaryNote: boolean;
}

export interface UiAutoSnapshotSpec {
  readonly version: number;
  readonly title?: string;
  readonly tracks?: ReadonlyArray<UiAutoSnapshotTrackSpec>;
  readonly events?: ReadonlyArray<UiAutoSnapshotEventSpec>;
  readonly viewport?: unknown;
  readonly screenshot?: unknown;
}

export interface UiAutoSnapshotTrackSpec {
  readonly key?: string;
  readonly type: string;
  readonly name?: string;
  readonly uri?: string;
  readonly trackKind?: string;
  readonly unique?: boolean;
  readonly pin?: boolean;
}

export interface UiAutoSnapshotEventSpec {
  readonly key?: string;
  readonly type: string;
  readonly event: UiAutoSnapshotEventRef;
  readonly pinOwningTrack?: boolean;
  readonly focus?: boolean;
  readonly highlight?: boolean;
}

export interface UiAutoSnapshotEventRef {
  readonly type: string;
  readonly id: number;
}

export interface UiAutoSnapshotResult {
  readonly ok: boolean;
  readonly items: ReadonlyArray<UiAutoSnapshotItemResult>;
  readonly warnings: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<UiAutoSnapshotError>;
}

export interface UiAutoSnapshotItemResult {
  readonly key?: string;
  readonly type?: string;
  readonly ok: boolean;
  readonly trackUri?: string;
  readonly eventId?: number;
  readonly matched?: number;
  readonly pinned?: number;
  readonly highlighted?: boolean;
  readonly message?: string;
}

export interface UiAutoSnapshotError {
  readonly code: string;
  readonly message: string;
  readonly key?: string;
}

/**
 * Imperative API for browser automation: select slices, pin
 * tracks, zoom, and annotate without relying on DOM structure.
 */
export interface PerfboxUiAutoApi {
  isReady(): boolean;
  applySnapshot(spec: UiAutoSnapshotSpec): Promise<UiAutoSnapshotResult>;
  selectSlice(
    id: number,
    opts?: SelectionOpts,
  ): Promise<UiAutoSelectResult>;
  selectSqlEvent(
    table: string,
    id: number,
    opts?: SelectionOpts,
  ): Promise<UiAutoSelectResult>;
  pinTrack(pattern: string): UiAutoPinResult;
  pinTrackByName(pattern: string): UiAutoPinResult;
  pinTrackByKind(kind: string): UiAutoPinResult;
  pinTrackByUri(
    uri: string,
  ): UiAutoPinResult & {readonly track?: UiAutoTrackInfo};
  unpinAll(): {readonly unpinned: number};
  zoomTo(
    startNs: string | number | bigint,
    endNs: string | number | bigint,
  ): UiAutoActionResult;
  panTo(tsNs: string | number | bigint): UiAutoActionResult;
  mark(): Promise<UiAutoActionResult>;
  markPermanent(): UiAutoActionResult;
  addSpanNote(
    startNs: string | number | bigint,
    endNs: string | number | bigint,
    color?: string,
    text?: string,
  ): {readonly id: string};
  reset(): UiAutoResetResult;
  listTracks(): ReadonlyArray<UiAutoTrackInfo>;
}

interface ResolvedTrackEvent {
  readonly eventId: number;
  readonly trackUri: string;
}

declare global {
  interface Window {
    perfboxUiAuto: PerfboxUiAutoApi | undefined;
  }
}

export default class UiAutoBridgePlugin implements PerfettoPlugin {
  static readonly id = 'dev.perfbox.UiAutoBridge';

  async onTraceLoad(trace: Trace): Promise<void> {
    let ready = false;

    const pinTracksByName = (pattern: string): UiAutoPinResult => {
      assertReady(ready);
      const matches = findTracksByName(trace.currentWorkspace.flatTracksOrdered, pattern);
      const pinned = pinTracks(matches);
      return {
        matched: matches.length,
        pinned: pinned.length,
        tracks: matches.map((track) => getTrackInfo(trace, track)),
      };
    };

    const bridge: PerfboxUiAutoApi = {
      isReady: () => ready,

      applySnapshot: async (spec) => {
        assertReady(ready);
        if (spec.version !== 1) {
          return {
            ok: false,
            items: [],
            warnings: [],
            errors: [
              {
                code: 'INVALID_SPEC',
                message: `Unsupported snapshot spec version ${spec.version}`,
              },
            ],
          };
        }
        const trackResult = applyTrackSnapshotSpecs(
          trace.currentWorkspace.flatTracksOrdered,
          spec.tracks ?? [],
          (uri) => trace.tracks.getTrack(uri),
          (uri) => trace.currentWorkspace.getTrackByUri(uri),
        );
        const items = [...trackResult.items];
        const errors = [...trackResult.errors];
        for (const eventSpec of spec.events ?? []) {
          const item = await applyEventSnapshotSpec(trace, eventSpec);
          items.push(item);
          if (!item.ok) {
            errors.push(
              snapshotError(
                item.message === 'Unsupported event type'
                  ? 'INVALID_SPEC'
                  : 'EVENT_NOT_RESOLVED',
                item.message ?? 'Event was not resolved',
                item.key,
              ),
            );
          }
        }
        await nextAnimationFrame();
        return {
          ok: errors.length === 0,
          items,
          warnings: [...trackResult.warnings],
          errors,
        };
      },

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
        return markCurrentSelection(trace);
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

    window.perfboxUiAuto = bridge;
    trace.onTraceReady.addListener(() => {
      ready = true;
    });
    trace.trash.defer(() => {
      if (window.perfboxUiAuto === bridge) {
        window.perfboxUiAuto = undefined;
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
): UiAutoTrackInfo {
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

export function applyTrackSnapshotSpecs(
  tracks: ReadonlyArray<TrackNode>,
  specs: ReadonlyArray<UiAutoSnapshotTrackSpec>,
  getTrack: TrackLookup,
  getTrackByUri: (uri: string) => TrackNode | undefined,
): UiAutoSnapshotResult {
  const items: UiAutoSnapshotItemResult[] = [];
  const errors: UiAutoSnapshotError[] = [];

  for (const spec of specs) {
    const key = spec.key ?? spec.name ?? spec.uri ?? spec.trackKind;
    if (spec.type !== 'track') {
      errors.push(snapshotError('INVALID_SPEC', 'Track spec type must be "track"', key));
      continue;
    }

    const matches = resolveSnapshotTracks(tracks, spec, getTrack, getTrackByUri);
    if (matches.length === 0) {
      errors.push(snapshotError('TRACK_NOT_FOUND', 'Track selector matched no tracks', key));
      items.push({
        key,
        type: 'track',
        ok: false,
        matched: 0,
        pinned: 0,
      });
      continue;
    }
    if (spec.unique === true && matches.length !== 1) {
      errors.push(
        snapshotError(
          'TRACK_NOT_UNIQUE',
          `Track selector matched ${matches.length} tracks`,
          key,
        ),
      );
      items.push({
        key,
        type: 'track',
        ok: false,
        matched: matches.length,
        pinned: 0,
      });
      continue;
    }

    const pinned = spec.pin === false ? [] : pinTracks(matches);
    items.push({
      key,
      type: 'track',
      ok: true,
      trackUri: matches[0].uri,
      matched: matches.length,
      pinned: pinned.length,
    });
  }

  return {
    ok: errors.length === 0,
    items,
    warnings: [],
    errors,
  };
}

export function eventRefToSqlTable(
  event: UiAutoSnapshotEventRef,
): string | undefined {
  switch (event.type) {
    case 'slice':
      return 'slice';
    case 'thread_state':
      return 'thread_state';
    default:
      return undefined;
  }
}

export async function applyEventSnapshotSpec(
  trace: Trace,
  spec: UiAutoSnapshotEventSpec,
): Promise<UiAutoSnapshotItemResult> {
  const key = spec.key ?? `${spec.event.type}:${spec.event.id}`;
  if (spec.type !== 'event') {
    return {
      key,
      type: 'event',
      ok: false,
      message: 'Snapshot event spec type must be "event"',
    };
  }

  const table = eventRefToSqlTable(spec.event);
  if (table === undefined) {
    return {
      key,
      type: 'event',
      ok: false,
      eventId: spec.event.id,
      message: 'Unsupported event type',
    };
  }

  const selected = await selectResolvedSqlEvent(
    trace,
    table,
    spec.event.id,
    undefined,
    spec.focus === true,
  );
  if (!selected.ok || selected.trackUri === undefined) {
    return {
      key,
      type: 'event',
      ok: false,
      eventId: spec.event.id,
      message: selected.reason ?? 'Event was not resolved',
    };
  }

  let pinned = 0;
  if (spec.pinOwningTrack === true) {
    const track = trace.currentWorkspace.getTrackByUri(selected.trackUri);
    pinned = track === undefined ? 0 : pinTracks([track]).length;
  }

  let highlighted = false;
  if (spec.highlight === true) {
    const highlightResult = await markCurrentSelection(
      trace,
      snapshotHighlightNoteId(key),
    );
    if (!highlightResult.ok) {
      return {
        key,
        type: 'event',
        ok: false,
        trackUri: selected.trackUri,
        eventId: selected.eventId,
        pinned,
        message: highlightResult.reason ?? 'Could not highlight event',
      };
    }
    highlighted = true;
  }

  return {
    key,
    type: 'event',
    ok: true,
    trackUri: selected.trackUri,
    eventId: selected.eventId,
    pinned,
    ...(highlighted ? {highlighted: true} : {}),
  };
}

async function markCurrentSelection(
  trace: Trace,
  noteId = TEMPORARY_NOTE_ID,
): Promise<UiAutoActionResult> {
  const range = trace.selection.getTimeSpanOfSelection();
  if (range === undefined) {
    return {ok: false, reason: 'No selection range to mark'};
  }
  trace.notes.addSpanNote({
    start: range.start,
    end: range.end,
    id: noteId,
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
    () => trace.notes.getNote(noteId),
    (current) => current !== undefined,
  );
  return note !== undefined
    ? {ok: true}
    : {ok: false, reason: 'Timed out waiting for temporary note'};
}

function snapshotHighlightNoteId(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]+/g, '_');
  return `${SNAPSHOT_HIGHLIGHT_NOTE_PREFIX}${safeKey}`;
}

function getTrackInfo(trace: Trace, trackNode: TrackNode): UiAutoTrackInfo {
  return trackNodeToInfo(trackNode, (uri) => trace.tracks.getTrack(uri));
}

function resolveSnapshotTracks(
  tracks: ReadonlyArray<TrackNode>,
  spec: UiAutoSnapshotTrackSpec,
  getTrack: TrackLookup,
  getTrackByUri: (uri: string) => TrackNode | undefined,
): TrackNode[] {
  let matches = tracks.filter((track) => track.uri !== undefined);

  if (spec.uri !== undefined) {
    const track = getTrackByUri(spec.uri);
    matches = track === undefined ? [] : [track];
  }
  if (spec.name !== undefined) {
    matches = findTracksByName(matches, spec.name);
  }
  if (spec.trackKind !== undefined) {
    matches = findTracksByKind(matches, spec.trackKind, getTrack);
  }
  if (
    spec.uri === undefined &&
    spec.name === undefined &&
    spec.trackKind === undefined
  ) {
    return [];
  }
  return matches;
}

function snapshotError(
  code: string,
  message: string,
  key?: string,
): UiAutoSnapshotError {
  return {code, message, key};
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
    throw new Error('Perfbox UI auto bridge is not ready yet');
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
): UiAutoSelectResult {
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
): Promise<UiAutoSelectResult> {
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
