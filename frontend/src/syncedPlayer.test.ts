import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Run the real audio class with a minimal Web Audio environment; no browser or downloads.
function createPlayer() {
  class AudioContext {
    currentTime = 0;
    state = 'running';
    listeners: (() => void)[] = [];
    destination = {};
    addEventListener(_event: string, listener: () => void) { this.listeners.push(listener); }
    changeState(state: string) {
      this.state = state;
      this.listeners.forEach((listener) => listener());
    }
    resume() { return Promise.resolve(); }
    createBufferSource() {
      return { connect() { return this; }, start() {}, stop() {}, disconnect() {} };
    }
    createGain() {
      return { connect() {}, disconnect() {}, gain: { setValueAtTime() {} } };
    }
    close() {}
  }
  const source = readFileSync(new URL('./syncedPlayer.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, any> = {};
  runInNewContext(outputText, { exports, AudioContext, require: () => ({}) });
  const player = new exports.default();
  const pending = new Map<string, ReturnType<typeof deferred>>();
  // Control downloads to exercise completions in either order, using the real load/loadAudio.
  player.fetchBuffers = (track: { id: string }) => {
    const request = deferred();
    pending.set(track.id, request);
    return request.promise;
  };
  return { player, pending };
}

function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const buffers = (duration: number) => ({ vocal: { duration }, instrumental: { duration } });

test('scheduled audio is not reported as playing until its context is running', async () => {
  const { player, pending } = createPlayer();
  const loading = player.loadAudio({ id: 'song' });
  pending.get('song')!.resolve(buffers(100));
  await loading;
  const states: boolean[] = [];
  player.onPlaybackChange = (playing: boolean) => states.push(playing);
  player.context.changeState('suspended');
  player.play();
  assert.equal(player.isPlaying, true);
  assert.equal(player.isRunning, false);
  assert.equal(states.at(-1), false);
  player.context.changeState('running');
  assert.equal(player.isRunning, true);
  assert.equal(states.at(-1), true);
  player.context.changeState('suspended');
  assert.equal(player.isRunning, false);
  assert.equal(states.at(-1), false);
});

test('pausing before an audio unlock does not start playback when the context resumes', async () => {
  const { player, pending } = createPlayer();
  const loading = player.loadAudio({ id: 'song' });
  pending.get('song')!.resolve(buffers(100));
  await loading;
  player.context.changeState('suspended');
  player.play();
  player.pause();
  player.context.changeState('running');
  assert.equal(player.isRunning, false);
  assert.equal(player.isPlaying, false);
});

function createShiftedPlayer() {
  const { player, pending } = createPlayer();
  const source = readFileSync(new URL('./shiftedPlayer.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, any> = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => name === './syncedPlayer' ? { default: player.constructor } : {},
  });
  // Use the base Web Audio fixture and a controlled pitch host instead of a real worklet.
  Object.setPrototypeOf(player, exports.default.prototype);
  const hosted: number[] = [];
  const host = { load: (instrumental: { duration: number }) => hosted.push(instrumental.duration), pause() {} };
  player.host = host;
  player.hostReady = Promise.resolve(host);
  player.shiftLoadVersion = 0;
  return { player, pending, hosted };
}

test('pitch shifting hosts only the latest song when downloads finish out of order', async () => {
  const { player, pending, hosted } = createShiftedPlayer();
  const first = player.loadAudio({ id: 'first' });
  await nextTurn();
  const second = player.loadAudio({ id: 'second' });
  await nextTurn();
  pending.get('second')!.resolve(buffers(200));
  assert.equal(await second, true);
  pending.get('first')!.resolve(buffers(100));
  assert.equal(await first, false);
  assert.deepEqual(hosted, [200]);
  assert.equal(player.getDuration(), 200);
});

test('pitch shifting keeps the latest selection while the worklet starts', async () => {
  const { player, pending, hosted } = createShiftedPlayer();
  const ready = deferred();
  player.hostReady = ready.promise;
  const first = player.loadAudio({ id: 'first' });
  const second = player.loadAudio({ id: 'second' });
  ready.resolve(player.host);
  await nextTurn();
  assert.equal(pending.has('first'), false);
  assert.equal(pending.has('second'), true);
  pending.get('second')!.resolve(buffers(200));
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.deepEqual(hosted, [200]);
});

test('a song selected during a download loads instead of silently being skipped', async () => {
  const { player, pending } = createPlayer();
  const first = player.loadAudio({ id: 'first' });
  const second = player.loadAudio({ id: 'second' });
  assert.ok(pending.has('second'));
  pending.get('second')!.resolve(buffers(200));
  assert.equal(await second, true);
  assert.equal(player.getDuration(), 200);
  pending.get('first')!.resolve(buffers(100));
  assert.equal(await first, false);
  assert.equal(player.getDuration(), 200);
  assert.equal(player.isLoading, false);
});

test('an older completion cannot clear the current song loading state', async () => {
  const { player, pending } = createPlayer();
  const first = player.loadAudio({ id: 'first' });
  const second = player.loadAudio({ id: 'second' });
  pending.get('first')!.resolve(buffers(100));
  assert.equal(await first, false);
  assert.equal(player.isLoading, true);
  assert.equal(player.getDuration(), 0);
  pending.get('second')!.resolve(buffers(200));
  await second;
  assert.equal(player.isLoading, false);
  assert.equal(player.getDuration(), 200);
});

test('a failed older download cannot mark the latest song finished loading', async () => {
  const { player, pending } = createPlayer();
  const first = player.loadAudio({ id: 'first' });
  const rejected = assert.rejects(first, /download failed/);
  const second = player.loadAudio({ id: 'second' });
  pending.get('first')!.reject(new Error('download failed'));
  await rejected;
  assert.equal(player.isLoading, true);
  pending.get('second')!.resolve(buffers(200));
  await second;
  assert.equal(player.getDuration(), 200);
});

test('destroyed players ignore downloads that complete later', async () => {
  const { player, pending } = createPlayer();
  const loading = player.loadAudio({ id: 'first' });
  player.destroy();
  pending.get('first')!.resolve(buffers(100));
  assert.equal(await loading, false);
  assert.equal(player.getDuration(), 0);
});
