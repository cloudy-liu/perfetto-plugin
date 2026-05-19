// Copyright (C) 2026 cloudy.liu
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
      engine: {
        query: jest.fn(async () => ({
          maybeFirstRow: jest.fn(() => ({
            ts: 711802974000000n,
            dur: 6522000n,
          })),
        })),
      },
      scrollTo: jest.fn(),
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

  test('applyEventSnapshotSpec reveals focused slice using slice bounds', async () => {
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
        {trackUri: 'track://launcher-main', eventId: 137953},
      ]),
      selectTrackEvent: jest.fn((trackUri: string, eventId: number) => {
        selection.selection = {kind: 'track_event', trackUri, eventId};
      }),
      scrollToSelection: jest.fn(),
      getTimeSpanOfSelection: jest.fn(),
      selectArea: jest.fn(),
    };
    const trace = {
      engine: {
        query: jest.fn(async () => ({
          maybeFirstRow: jest.fn(() => ({
            ts: 711802603663579n,
            dur: 972240n,
          })),
        })),
      },
      scrollTo: jest.fn(),
      selection,
      currentWorkspace: {
        getTrackByUri: jest.fn(),
      },
      notes: {
        addSpanNote: jest.fn(),
        getNote: jest.fn(),
      },
    } as unknown as Parameters<typeof applyEventSnapshotSpec>[0];

    const result = await applyEventSnapshotSpec(trace, {
      key: 'launcher-doframe-137953',
      type: 'event',
      event: {type: 'slice', id: 137953},
      focus: true,
      switchToCurrentSelectionTab: false,
    });

    expect(result).toMatchObject({
      ok: true,
      trackUri: 'track://launcher-main',
      eventId: 137953,
    });
    expect(trace.engine.query).toHaveBeenCalledWith(
      expect.stringContaining('from slice'),
    );
    expect(trace.scrollTo).toHaveBeenCalledWith({
      time: {
        start: nsToTime(711802603663579n),
        end: nsToTime(711802604635819n),
        behavior: 'focus',
      },
      track: {
        uri: 'track://launcher-main',
        expandGroup: true,
      },
    });
    expect(selection.selectTrackEvent).toHaveBeenCalledWith(
      'track://launcher-main',
      137953,
      expect.objectContaining({
        scrollToSelection: false,
        switchToCurrentSelectionTab: false,
      }),
    );
    expect(selection.scrollToSelection).not.toHaveBeenCalled();
  });

  test('applyEventSnapshotSpec keeps related thread state visible for highlighted slices', async () => {
    const process = new TrackNode({name: 'com.android.launcher 4402'});
    const launcherMainThread = new TrackNode({
      name: 'ndroid.launcher 4402',
      uri: 'track://launcher-main',
    });
    const launcherThreadState = new TrackNode({
      name: 'ndroid.launcher 4402',
      uri: 'track://launcher-thread-state',
    });
    process.addChildLast(launcherMainThread);
    process.addChildLast(launcherThreadState);

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
        {trackUri: 'track://launcher-main', eventId: 137953},
      ]),
      selectTrackEvent: jest.fn((trackUri: string, eventId: number) => {
        selection.selection = {kind: 'track_event', trackUri, eventId};
      }),
      scrollToSelection: jest.fn(),
      getTimeSpanOfSelection: jest.fn(() => ({
        start: nsToTime(711802603663579n),
        end: nsToTime(711802604635819n),
      })),
      selectArea: jest.fn(),
    };
    const trace = {
      engine: {
        query: jest.fn(async () => ({
          maybeFirstRow: jest.fn(() => ({
            ts: 711802603663579n,
            dur: 972240n,
          })),
        })),
      },
      scrollTo: jest.fn(),
      selection,
      currentWorkspace: {
        getTrackByUri: jest.fn((uri: string) => {
          if (uri === 'track://launcher-main') return launcherMainThread;
          if (uri === 'track://launcher-thread-state') return launcherThreadState;
          return undefined;
        }),
      },
      tracks: {
        getTrack: jest.fn((uri: string) => {
          if (uri === 'track://launcher-thread-state') {
            return mockTrack({tags: {kinds: ['ThreadStateTrack']}});
          }
          return mockTrack({tags: {kinds: ['SliceTrack']}});
        }),
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
      key: 'launcher-doframe-137953',
      type: 'event',
      event: {type: 'slice', id: 137953},
      focus: true,
      highlight: true,
    });

    expect(result.ok).toBe(true);
    expect(trace.scrollTo).toHaveBeenNthCalledWith(1, {
      track: {
        uri: 'track://launcher-thread-state',
        expandGroup: true,
      },
    });
    expect(trace.scrollTo).toHaveBeenNthCalledWith(2, {
      time: {
        start: nsToTime(711802603663579n),
        end: nsToTime(711802604635819n),
        behavior: 'focus',
      },
      track: {
        uri: 'track://launcher-main',
        expandGroup: true,
      },
    });
    expect(selection.selectArea).toHaveBeenCalledWith(
      expect.objectContaining({
        trackUris: ['track://launcher-main', 'track://launcher-thread-state'],
      }),
    );
  });

  test('applySnapshot pins Focused app and focuses highlighted slice 168859', async () => {
    const previousBridge = window.perfboxUiAuto;
    const readyListeners: Array<() => void> = [];

    const systemServer = new TrackNode({name: 'system_server 2838'});
    const focusedApp = new TrackNode({name: 'Focused app', uri: 'track://focused-app'});
    focusedApp.pin = jest.fn();
    systemServer.addChildLast(focusedApp);

    const mmsProcess = new TrackNode({name: 'com.android.mms 24500'});
    const mmsMainThread = new TrackNode({
      name: 'com.android.mms 24500',
      uri: 'track://mms-main',
    });
    mmsMainThread.pin = jest.fn();
    mmsProcess.addChildLast(mmsMainThread);

    const tracksByUri = new Map<string, TrackNode>([
      ['track://focused-app', focusedApp],
      ['track://mms-main', mmsMainThread],
    ]);

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
      resolveSqlEvents: jest.fn(async (table: string, ids: number[]) => {
        if (table === 'slice' && ids[0] === 168859) {
          return [{trackUri: 'track://mms-main', eventId: 168859}];
        }
        return [];
      }),
      selectTrackEvent: jest.fn((trackUri: string, eventId: number) => {
        selection.selection = {kind: 'track_event', trackUri, eventId};
      }),
      scrollToSelection: jest.fn(),
      getTimeSpanOfSelection: jest.fn(() => ({
        start: nsToTime(711802974000000n),
        end: nsToTime(711802980522000n),
      })),
      selectArea: jest.fn(),
    };

    const trace = {
      currentWorkspace: {
        flatTracksOrdered: [focusedApp, mmsMainThread],
        getTrackByUri: jest.fn((uri: string) => tracksByUri.get(uri)),
      },
      tracks: {
        getTrack: jest.fn(() => undefined),
      },
      engine: {
        query: jest.fn(async () => ({
          maybeFirstRow: jest.fn(() => ({
            ts: 711802974000000n,
            dur: 6522000n,
          })),
        })),
      },
      scrollTo: jest.fn(),
      selection,
      notes: {
        addSpanNote: jest.fn((note: {id?: string}) => {
          const id = note.id ?? 'note-id';
          notes.set(id, note);
          return id;
        }),
        getNote: jest.fn((id: string) => notes.get(id)),
      },
      onTraceReady: {
        addListener: jest.fn((listener: () => void) => {
          readyListeners.push(listener);
        }),
      },
      trash: {
        defer: jest.fn(),
      },
    } as unknown as Parameters<UiAutoBridgePlugin['onTraceLoad']>[0];

    try {
      const plugin = new UiAutoBridgePlugin();
      await plugin.onTraceLoad(trace);

      expect(window.perfboxUiAuto).toBeDefined();
      expect(window.perfboxUiAuto?.isReady()).toBe(false);

      readyListeners.forEach((listener) => listener());
      expect(window.perfboxUiAuto?.isReady()).toBe(true);

      const result = await window.perfboxUiAuto!.applySnapshot({
        version: 1,
        tracks: [
          {
            key: 'focused-app',
            type: 'track',
            name: 'Focused app',
            unique: true,
            pin: true,
          },
        ],
        events: [
          {
            key: 'slice-168859',
            type: 'event',
            event: {type: 'slice', id: 168859},
            focus: true,
            highlight: true,
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.items).toEqual([
        expect.objectContaining({
          key: 'focused-app',
          type: 'track',
          ok: true,
          trackUri: 'track://focused-app',
          matched: 1,
          pinned: 1,
        }),
        expect.objectContaining({
          key: 'slice-168859',
          type: 'event',
          ok: true,
          trackUri: 'track://mms-main',
          eventId: 168859,
          highlighted: true,
        }),
      ]);
      expect(focusedApp.pin).toHaveBeenCalledTimes(1);
      expect(mmsMainThread.pin).not.toHaveBeenCalled();
      expect(selection.resolveSqlEvents).toHaveBeenCalledWith('slice', [168859]);
      expect(trace.scrollTo).toHaveBeenCalledWith({
        time: {
          start: nsToTime(711802974000000n),
          end: nsToTime(711802980522000n),
          behavior: 'focus',
        },
        track: {
          uri: 'track://mms-main',
          expandGroup: true,
        },
      });
      expect(selection.scrollToSelection).not.toHaveBeenCalled();
      expect(selection.selectArea).toHaveBeenCalledWith(
        expect.objectContaining({trackUris: ['track://mms-main']}),
      );
      expect(trace.notes.addSpanNote).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining('__perfbox_uiauto_highlight__'),
        }),
      );
    } finally {
      window.perfboxUiAuto = previousBridge;
    }
  });

  test('applySnapshot applies explicit viewport after focusing an event', async () => {
    const previousBridge = window.perfboxUiAuto;
    const readyListeners: Array<() => void> = [];

    const launcherMainThread = new TrackNode({
      name: 'com.android.launcher 4402',
      uri: 'track://launcher-main',
    });
    const notes = new Map<string, unknown>();
    let visibleWindow: unknown;
    const timeline = {
      setVisibleWindow: jest.fn((span: unknown) => {
        visibleWindow = span;
      }),
    };
    const scrollTo = jest.fn(() => {
      let remainingAnimationFrames = 6;
      const animateFocus = () => {
        timeline.setVisibleWindow('focus-animation');
        remainingAnimationFrames--;
        if (remainingAnimationFrames > 0) {
          requestAnimationFrame(animateFocus);
        }
      };
      requestAnimationFrame(animateFocus);
    });
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
        {trackUri: 'track://launcher-main', eventId: 137953},
      ]),
      selectTrackEvent: jest.fn((trackUri: string, eventId: number) => {
        selection.selection = {kind: 'track_event', trackUri, eventId};
      }),
      scrollToSelection: jest.fn(),
      getTimeSpanOfSelection: jest.fn(() => ({
        start: nsToTime(711802603663579n),
        end: nsToTime(711802604635819n),
      })),
      selectArea: jest.fn(),
    };
    const trace = {
      currentWorkspace: {
        flatTracksOrdered: [launcherMainThread],
        getTrackByUri: jest.fn((uri: string) =>
          uri === 'track://launcher-main' ? launcherMainThread : undefined,
        ),
      },
      tracks: {
        getTrack: jest.fn(() => undefined),
      },
      engine: {
        query: jest.fn(async () => ({
          maybeFirstRow: jest.fn(() => ({
            ts: 711802603663579n,
            dur: 972240n,
          })),
        })),
      },
      scrollTo,
      selection,
      notes: {
        addSpanNote: jest.fn((note: {id?: string}) => {
          const id = note.id ?? 'note-id';
          notes.set(id, note);
          return id;
        }),
        getNote: jest.fn((id: string) => notes.get(id)),
      },
      timeline,
      onTraceReady: {
        addListener: jest.fn((listener: () => void) => {
          readyListeners.push(listener);
        }),
      },
      trash: {
        defer: jest.fn(),
      },
    } as unknown as Parameters<UiAutoBridgePlugin['onTraceLoad']>[0];

    try {
      const plugin = new UiAutoBridgePlugin();
      await plugin.onTraceLoad(trace);
      readyListeners.forEach((listener) => listener());

      const result = await window.perfboxUiAuto!.applySnapshot({
        version: 1,
        events: [
          {
            key: 'launcher-doframe-137953',
            type: 'event',
            event: {type: 'slice', id: 137953},
            focus: true,
            highlight: true,
            selectArea: false,
            switchToCurrentSelectionTab: false,
          },
        ],
        viewport: {
          startNs: '711802602600000',
          endNs: '711802605700000',
        },
      });

      expect(result.ok).toBe(true);
      expect(scrollTo).toHaveBeenCalledWith({
        time: {
          start: nsToTime(711802603663579n),
          end: nsToTime(711802604635819n),
          behavior: 'focus',
        },
        track: {
          uri: 'track://launcher-main',
          expandGroup: true,
        },
      });
      expect(selection.scrollToSelection).not.toHaveBeenCalled();
      expect(selection.selectTrackEvent).toHaveBeenCalledWith(
        'track://launcher-main',
        137953,
        expect.objectContaining({switchToCurrentSelectionTab: false}),
      );
      expect(selection.selectArea).not.toHaveBeenCalled();
      expect(timeline.setVisibleWindow).toHaveBeenCalledTimes(7);
      expect(visibleWindow).not.toBe('focus-animation');
    } finally {
      window.perfboxUiAuto = previousBridge;
    }
  });
});
