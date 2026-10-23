import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { seekSync } from '../seekSync.ts';

// Exercise the real Player effects with controlled audio, metadata and render scheduling.
function fixture(secondStatus = 'submitted', isOwner = true) {
  seekSync.clear('test-room');
  const handlers: Record<string, any> = {};
  const sent: any[] = [];
  const pitches: number[] = [];
  const prefetched: string[] = [];
  const preloaded: string[] = [];
  const settings: Record<string, any> = {
    showVideo: false, showMelody: false, outputDeviceId: '', micOn: false, micMonitor: false,
    setShowMelody(value: boolean) { settings.showMelody = value; },
  };
  const tracks = [{ id: 'a', name: 'Ready song', status: 'ready' }, { id: 'b', name: 'Next song', status: secondStatus }];
  const state: Record<string, any> = {
    queue: tracks, queueIdx: 0, syncedPlayer: null, lastSongId: null,
    loading: false, loadError: false, loadProgress: null, loadAttempt: 0,
    lyrics: [], playing: false, playRequested: false, playbackReady: true,
    duration: 0, progress: 0, enabledPitchShift: true, volume: 0.8, guideLevel: 0, semitone: 0,
  };
  let dirty = true;
  const update = (key: string, value: any) => {
    if (!Object.is(state[key], value)) { state[key] = value; dirty = true; }
  };
  for (const [name, key] of Object.entries({
    setSyncedPlayer: 'syncedPlayer', setLoading: 'loading', setLoadProgress: 'loadProgress',
    setLoadError: 'loadError', setPlaying: 'playing', setProgress: 'progress', setDuration: 'duration',
    setLyrics: 'lyrics', setCurrentLine: 'currentLine', setQueue: 'queue', setQueueIdx: 'queueIdx',
    setLastSongId: 'lastSongId', setVocalOn: 'vocalOn', setPlayRequested: 'playRequested',
    setHostShowMelody: 'hostShowMelody',
  })) state[name] = (value: any) => update(key, value);
  state.fetchRoom = async () => ({ queueIdx: 0, currentTime: 0, playing: false });
  state.seek = (time: number) => update('progress', time);
  state.playAudio = () => update('playing', true);
  const loaded: string[] = [];
  const audio = {
    isRunning: false,
    onPlaybackChange: undefined,
    loadAudio: async (track: { id: string }) => { loaded.push(track.id); return true; },
    getDuration: () => 120,
    pause() {}, stop() {}, destroy() {}, seek() {}, setSemitone() {}, setOutputDevice() { return Promise.resolve(true); }, stopMic() {}, setMicLevels() {}, preload(track: { id: string }) { preloaded.push(track.id); },
  };
  const songStatus: Record<string, string> = {};
  const refs: { current: any }[] = [];
  const effects: { deps?: any[]; cleanup?: () => void }[] = [];
  let refIndex = 0;
  let effectIndex = 0;
  let pending: (() => void)[] = [];
  const useEffect = (effect: () => any, deps: any[]) => {
    const index = effectIndex++;
    const old = effects[index];
    if (!old || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) {
      effects[index] = { deps, cleanup: old?.cleanup };
      pending.push(() => {
        effects[index].cleanup?.();
        effects[index].cleanup = effect();
      });
    }
  };
  const usePlayer = () => ({
    ...state,
    currentTrack: state.queue[state.queueIdx] ?? null,
    prevTrack: state.queue[state.queueIdx - 1] ?? null,
    nextTrack: state.queue[state.queueIdx + 1] ?? null,
  });
  const dependencies: Record<string, any> = {
    react: { useEffect, useRef: (value: any) => refs[refIndex++] ??= { current: value } },
    'react/jsx-runtime': { jsx: () => null, Fragment: 'fragment' },
    '@tanstack/react-query': { useQuery: () => ({ data: { index: 0, tracks }, refetch() {} }) },
    'src/apis/player': { fetchQueue: async () => ({}), fetchLyrics: async (id: string) => [{ time: 1, text: id }], prefetchLyrics: (id: string) => prefetched.push(id) },
    'src/hooks/queue': { useRemoteMessageQueue(type: string, handler: any) { handlers[type] = handler; } },
    'src/remotePitch': { setRemotePitch: (hz: number) => pitches.push(hz) },
    'src/seekSync': { seekSync },
    'src/shiftedPlayer': { default: class { constructor() { return audio; } } },
    'src/syncedPlayer': { default: class { constructor() { return audio; } } },
    'src/store': { useTrackStore: (select: any) => select({ songStatus }) },
    'src/store/setting': { useSettingStore: Object.assign((select: any) => select(settings), { getState: () => settings }) },
    'src/store/player': { usePlayer, usePlayerStore: { getState: () => state } },
    'src/store/playerTab': { claimPlayerTab: () => () => {} },
    'src/store/room': {
      useJam: () => ({ isOwner, isRoomOwner: true }), useActiveRoomId: () => 'test-room',
      useRoomStore: (select: any) => select({ roomId: 'test-room', fetchRoom: state.fetchRoom }),
    },
    'src/store/ws': { lastControlSentAt: 0, useWebSocketStore: (select: any) => select({ connected: false, sendMessage(message: any) { sent.push(message); } }) },
    'src/utils/api': { api: {} },
  };
  const source = readFileSync(new URL('./Player.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports: Record<string, any> = {};
  runInNewContext(outputText, {
    exports, console, Date, setInterval: () => 1, clearInterval() {},
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  const settle = async () => {
    for (let pass = 0; pass < 20; pass++) {
      if (dirty) {
        dirty = false;
        refIndex = effectIndex = 0;
        pending = [];
        exports.Player();
        for (const effect of pending) effect();
      }
      await nextTurn();
      if (!dirty) return;
    }
    assert.fail('Player effects did not settle');
  };
  return { handlers, state, audio, loaded, songStatus, settle, sent, pitches, prefetched, preloaded, settings, message: (message: any) => handlers.jam.onAddItem({ type: 'jam', roomId: 'test-room', ...message }), select: (index: number) => update('queueIdx', index) };
}

test('previous restores a ready song after next selects a song still processing', async () => {
  const f = fixture();
  await f.settle();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.lyrics[0].text, 'a');
  f.select(1);
  await f.settle();
  assert.equal(f.state.loading, true);
  assert.equal(f.state.lyrics.length, 0);
  f.select(0);
  await f.settle();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.loadError, false);
  assert.equal(f.state.lyrics[0].text, 'a');
  assert.deepEqual(f.loaded, ['a', 'a']);
});

test('repeated next and previous between ready songs both finish loading', async () => {
  const f = fixture('ready');
  await f.settle();
  for (const index of [1, 0, 1, 0]) {
    f.select(index);
    await f.settle();
    assert.equal(f.state.loading, false);
    assert.equal(f.state.lyrics[0].text, index ? 'b' : 'a');
  }
  assert.deepEqual(f.loaded, ['a', 'b', 'a', 'b', 'a']);
});

test('a late download cannot replace the song selected by previous', async () => {
  const f = fixture('ready');
  await f.settle();
  let finish!: (loaded: boolean) => void;
  const pending = new Promise<boolean>((resolve) => { finish = resolve; });
  const load = f.audio.loadAudio;
  f.audio.loadAudio = async (track) => {
    if (track.id !== 'b') return load(track);
    f.loaded.push(track.id);
    return pending;
  };
  f.select(1);
  await f.settle();
  assert.equal(f.state.loading, true);
  f.select(0);
  await f.settle();
  finish(true);
  await f.settle();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.lyrics[0].text, 'a');
});

test('a waiting song loads when processing finishes', async () => {
  const f = fixture();
  await f.settle();
  f.select(1);
  await f.settle();
  f.songStatus.b = 'ready';
  f.state.setLoadProgress(0);
  await f.settle();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.lyrics[0].text, 'b');
});


test('remote seek remains optimistic through stale updates and earlier seek echoes', async () => {
  const f = fixture('ready', false);
  await f.settle();
  const first = seekSync.begin('test-room');
  const latest = seekSync.begin('test-room');
  f.state.seek(80);
  f.message({ action: 'update', data: { currentTime: 10, playing: false } });
  assert.equal(f.state.progress, 80);
  assert.equal(f.state.playing, false); // unrelated state is still authoritative
  f.message({ action: 'control', op: 'seek', data: { seekTime: 40, seekRequestId: first } });
  f.message({ action: 'update', data: { currentTime: 40, seekRequestId: first } });
  assert.equal(f.state.progress, 80);
  f.message({ action: 'update', data: { currentTime: 80, seekRequestId: latest } });
  f.message({ action: 'update', data: { currentTime: 80.2 } });
  assert.equal(f.state.progress, 80.2);
});

test('TV acknowledges a seek immediately even while paused, including seeking to zero', async () => {
  const f = fixture();
  await f.settle();
  f.message({ action: 'control', op: 'seek', data: { seekTime: 0, seekRequestId: 'seek-zero' } });
  assert.equal(f.state.progress, 0);
  const ack = f.sent.find((message) => message.data?.seekRequestId === 'seek-zero');
  assert.equal(ack?.action, 'update');
  assert.equal(ack?.force, true);
  assert.equal(ack?.data.currentTime, 0);
});

test('incoming time does not move the slider while dragging', async () => {
  const f = fixture('ready', false);
  await f.settle();
  f.state.seek(20);
  f.state.seeking = true;
  f.message({ action: 'update', data: { currentTime: 10 } });
  assert.equal(f.state.progress, 20);
  f.state.seeking = false;
  f.message({ action: 'update', data: { currentTime: 11 } });
  assert.equal(f.state.progress, 11);
});

test('what a phone in the room hears reaches the screen, but only from its own room', async () => {
  const f = fixture();
  await f.settle();
  f.message({ action: 'pitch', data: { hz: 220.5 } });
  f.message({ action: 'pitch', roomId: 'another-room', data: { hz: 330 } });
  f.message({ action: 'pitch', data: {} });
  assert.deepEqual(f.pitches, [220.5]);
});

test('a remote can show the melody on the screen that plays, and guests only note it', async () => {
  const owner = fixture();
  await owner.settle();
  owner.message({ action: 'control', op: 'setShowMelody', data: { value: true } });
  assert.equal(owner.settings.showMelody, true);
  assert.equal(owner.state.hostShowMelody, true);

  const guest = fixture('submitted', false);
  await guest.settle();
  guest.message({ action: 'control', op: 'setShowMelody', data: { value: true } });
  assert.equal(guest.settings.showMelody, false); // this device is not the one that shows it
  assert.equal(guest.state.hostShowMelody, true); // but its controls follow what the owner shows
});

test('the next song is warmed (audio and lyrics) once the current one has loaded', async () => {
  const f = fixture('ready');
  await f.settle();
  assert.deepEqual(f.loaded, ['a']);
  assert.deepEqual(f.preloaded, ['b']);
  assert.deepEqual(f.prefetched, ['b']);
});

test('a song still being processed is not warmed', async () => {
  const f = fixture('submitted');
  await f.settle();
  assert.deepEqual(f.preloaded, []);
  assert.deepEqual(f.prefetched, []);
});

test('a guest warms the lyrics of the next song but downloads no audio', async () => {
  const f = fixture('ready', false);
  await f.settle();
  assert.deepEqual(f.preloaded, []);
  assert.deepEqual(f.prefetched, ['b']);
});

test('a song that finishes processing while another plays is warmed then, not only when you skip to it', async () => {
  const f = fixture('submitted');
  await f.settle();
  assert.deepEqual(f.preloaded, []);
  f.songStatus.b = 'ready';
  f.state.setLoadProgress(0); // a render
  await f.settle();
  assert.deepEqual(f.preloaded, ['b']);
  assert.deepEqual(f.prefetched, ['b']);
  assert.deepEqual(f.loaded, ['a']); // and it did not start playing or loading as the current song
});

test('the first song into an empty queue asks for playback; later songs do not', async () => {
  const f = fixture();
  await f.settle();
  f.handlers.queue.onAddItem({ type: 'queue', data: { action: 'added', track: { id: 'c' }, autoplay: false } });
  assert.equal(f.state.playRequested, false);
  f.handlers.queue.onAddItem({ type: 'queue', data: { action: 'added', track: { id: 'c' }, autoplay: true } });
  assert.equal(f.state.playRequested, true);
});
