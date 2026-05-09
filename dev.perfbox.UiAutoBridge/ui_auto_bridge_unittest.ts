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

import {Track} from '../../public/track';
import {TrackNode} from '../../public/workspace';
import UiAutoBridgePlugin, {
  applyEventSnapshotSpec,
  applyTrackSnapshotSpecs,
  eventRefToSqlTable,
  findTracksByKind,
  findTracksByName,
  nsToTime,
  pinTracks,
  trackNodeToInfo,
} from './index';

function mockTrack(partial: Partial<Track> & {uri?: string}): Track {
  return partial as Track;
}

describe('ui_auto_bridge', () => {
  test('plugin id uses the Perfbox namespace', () => {
    expect(UiAutoBridgePlugin.id).toBe('dev.perfbox.UiAutoBridge');
  });

  test('nsToTime parses string and bigint', () => {
    const t = nsToTime('1000');
    expect(Number(t)).toBe(1000);
    expect(Number(nsToTime(2000n))).toBe(2000);
  });

  test('findTracksByName matches name and full path case-insensitively', () => {
    const group = new TrackNode({name: 'Process'});
    const leaf = new TrackNode({name: 'RenderThread 42', uri: 'u1'});
    group.addChildLast(leaf);

    expect(findTracksByName([leaf], 'render')).toEqual([leaf]);
    expect(findTracksByName([leaf], 'process')).toEqual([leaf]);
    expect(findTracksByName([leaf], 'nomatch')).toEqual([]);
    expect(findTracksByName([leaf], '   ')).toEqual([]);
  });

  test('findTracksByKind matches tags.kinds or tags.type', () => {
    const a = new TrackNode({name: 'A', uri: 'ua'});
    const b = new TrackNode({name: 'B', uri: 'ub'});
    const tracks = [a, b];
    const getTrack = (uri: string) =>
      uri === 'ua'
        ? mockTrack({tags: {kinds: ['CounterTrack'], type: 'ignored'}})
        : mockTrack({tags: {type: 'SliceTrack'}});

    expect(findTracksByKind(tracks, 'countertrack', getTrack)).toEqual([a]);
    expect(findTracksByKind(tracks, 'slicetrack', getTrack)).toEqual([b]);
    expect(findTracksByKind(tracks, '', getTrack)).toEqual([]);
  });

  test('trackNodeToInfo exposes kind from kinds or type', () => {
    const node = new TrackNode({name: 'T', uri: 'u'});
    const parent = new TrackNode({name: 'G'});
    parent.addChildLast(node);

    expect(
      trackNodeToInfo(node, () =>
        mockTrack({tags: {kinds: ['K1', 'K2'], type: 'Ty'}}),
      ),
    ).toMatchObject({
      name: 'T',
      uri: 'u',
      kind: 'K1',
      kinds: ['K1', 'K2'],
      type: 'Ty',
      groupName: 'G',
    });

    expect(
      trackNodeToInfo(node, () => mockTrack({tags: {type: 'OnlyType'}})),
    ).toMatchObject({
      kind: 'OnlyType',
      type: 'OnlyType',
    });
  });

  test('pinTracks skips missing uri or already pinned', () => {
    const pin = jest.fn();
    const bare = new TrackNode({name: 'x'});
    const withUri = new TrackNode({name: 'y', uri: 'u'});
    withUri.pin = pin;

    const already = new TrackNode({name: 'z', uri: 'z'});
    Object.defineProperty(already, 'isPinned', {get: () => true});

    expect(pinTracks([bare, withUri, already])).toEqual([withUri]);
    expect(pin).toHaveBeenCalledTimes(1);
  });

  test('applyTrackSnapshotSpecs pins a unique track by name', () => {
    const pin = jest.fn();
    const focusedApp = new TrackNode({name: 'Focused app', uri: 'track://focused'});
    focusedApp.pin = pin;

    const result = applyTrackSnapshotSpecs(
      [focusedApp],
      [{key: 'scene', type: 'track', name: 'Focused app', unique: true}],
      () => undefined,
      (uri) => (uri === focusedApp.uri ? focusedApp : undefined),
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      expect.objectContaining({
        key: 'scene',
        type: 'track',
        ok: true,
        trackUri: 'track://focused',
        pinned: 1,
      }),
    ]);
    expect(pin).toHaveBeenCalledTimes(1);
  });

  test('applyTrackSnapshotSpecs reports non-unique track selectors', () => {
    const first = new TrackNode({name: 'RenderThread', uri: 'track://one'});
    const second = new TrackNode({name: 'RenderThread', uri: 'track://two'});

    const result = applyTrackSnapshotSpecs(
      [first, second],
      [{key: 'render', type: 'track', name: 'RenderThread', unique: true}],
      () => undefined,
      () => undefined,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TRACK_NOT_UNIQUE',
        key: 'render',
      }),
    ]);
  });

  test('eventRefToSqlTable maps slice refs', () => {
    expect(eventRefToSqlTable({type: 'slice', id: 1})).toBe('slice');
    expect(eventRefToSqlTable({type: 'thread_state', id: 2})).toBe(
      'thread_state',
    );
    expect(eventRefToSqlTable({type: 'unknown', id: 1})).toBeUndefined();
  });

  test('applyEventSnapshotSpec highlights selected events when requested', async () => {
    const track = new TrackNode({name: 'RenderThread', uri: 'track://render'});
    track.pin = jest.fn();
    const notes = new Map<string, unknown>();
    const selection: {
      selection: any;
      resolveSqlEvents: jest.Mock;
      selectTrackEvent: jest.Mock;
      scrollToSelection: jest.Mock;
      getTimeSpanOfSelection: jest.Mock;
      selectArea: jest.Mock;
    } = {
      selection: {kind: 'empty'},
      resolveSqlEvents: jest.fn(async () => [
        {trackUri: 'track://render', eventId: 7},
      ]),
      selectTrackEvent: jest.fn((trackUri: string, eventId: number) => {
        selection.selection = {kind: 'track_event', trackUri, eventId};
      }),
      scrollToSelection: jest.fn(),
      getTimeSpanOfSelection: jest.fn(() => ({
        start: nsToTime(10),
        end: nsToTime(20),
      })),
      selectArea: jest.fn(),
    };
    const trace = {
      selection,
      currentWorkspace: {
        getTrackByUri: jest.fn((uri: string) =>
          uri === 'track://render' ? track : undefined,
        ),
      },
      notes: {
        addSpanNote: jest.fn((note: {id?: string}) => {
          const id = note.id ?? 'note-id';
          notes.set(id, note);
          return id;
        }),
        getNote: jest.fn((id: string) => notes.get(id)),
      },
    } as unknown as Parameters<typeof applyEventSnapshotSpec>[0];

    const result = await applyEventSnapshotSpec(trace, {
      key: 'render-block',
      type: 'event',
      event: {type: 'slice', id: 3},
      pinOwningTrack: true,
      focus: true,
      highlight: true,
    });

    expect(result).toMatchObject({
      key: 'render-block',
      type: 'event',
      ok: true,
      trackUri: 'track://render',
      eventId: 7,
      pinned: 1,
      highlighted: true,
    });
    expect(trace.notes.addSpanNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining('__perfbox_uiauto_highlight__'),
      }),
    );
    expect(selection.selectArea).toHaveBeenCalledWith(
      expect.objectContaining({trackUris: ['track://render']}),
    );
  });
});
