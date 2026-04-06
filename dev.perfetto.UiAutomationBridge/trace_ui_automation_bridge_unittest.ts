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
import {
  findTracksByKind,
  findTracksByName,
  nsToTime,
  pinTracks,
  trackNodeToInfo,
} from './index';

function mockTrack(partial: Partial<Track> & {uri?: string}): Track {
  return partial as Track;
}

describe('trace_ui_automation_bridge', () => {
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
});
