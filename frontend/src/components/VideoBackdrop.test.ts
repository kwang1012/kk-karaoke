import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture() {
  const clock = { progress: 0, playing: false, seeking: false, loading: true };
  const calls: string[] = [];
  const players: any[] = [];
  const slots: any[] = [];
  const effects: { deps: any[]; cleanup?: () => void }[] = [];
  let index = 0;
  let pending: (() => void)[] = [];
  const element = () => ({ className: '', appendChild() {}, remove() {} });
  const useEffect = (effect: () => any, deps: any[]) => {
    const i = index++;
    const previous = effects[i];
    if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
      effects[i] = { deps, cleanup: previous?.cleanup };
      pending.push(() => {
        effects[i].cleanup?.();
        effects[i].cleanup = effect();
      });
    }
  };
  const dependencies: Record<string, any> = {
    react: {
      useEffect,
      useRef: (initial: any) => slots[index++] ??= { current: initial },
      useState(initial: any) {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value: any) => { slots[i] = value; }];
      },
    },
    'react/jsx-runtime': { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) },
    'lucide-react': { ExternalLink: 'link-icon' },
    'src/store/player': { usePlayer: () => clock },
    'src/i18n': { useT: () => (key: string) => key },
    'src/lib/utils': { cn: (...parts: any[]) => parts.filter(Boolean).join(' ') },
  };
  const source = readFileSync(new URL('./VideoBackdrop.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports: Record<string, any> = {};
  runInNewContext(outputText, {
    exports, require: (id: string) => dependencies[id],
    document: { createElement: element, head: element() },
    window: { YT: { Player: class {
      state = -1;
      time = 0;
      options: any;
      constructor(_mount: any, options: any) { this.options = options; players.push(this); }
      mute() { calls.push('mute'); }
      playVideo() { calls.push('play'); this.state = 3; }
      pauseVideo() { calls.push('pause'); this.state = 2; }
      seekTo(time: number) { calls.push(`seek:${time}`); this.time = time; }
      getCurrentTime() { return this.time; }
      getPlayerState() { return this.state; }
      destroy() { calls.push('destroy'); }
      ready() { this.options.events.onReady({ target: this }); }
      buffered() { this.state = 1; this.options.events.onStateChange({ target: this, data: 1 }); }
    } } },
  });
  return {
    clock, calls, players,
    async render(visible = false, videoId = 'song') {
      index = 0;
      const tree = exports.default({ videoId, visible });
      slots[0].current ??= element();
      const work = pending;
      pending = [];
      work.forEach((effect) => effect());
      await Promise.resolve();
      return tree;
    },
  };
}

test('hidden video starts muted to buffer, then holds until audio plays', async () => {
  const f = fixture();
  const hidden = await f.render();
  assert.match(hidden.props.className, /opacity-0/);
  assert.doesNotMatch(hidden.props.className, /(?:^|\s)(?:invisible|hidden)(?:\s|$)/);
  const player = f.players[0];
  player.ready();
  assert.deepEqual(f.calls, ['mute', 'play']);
  await f.render();
  assert.equal(f.calls.includes('pause'), false, 'initial buffering must not be cancelled');
  player.buffered();
  assert.equal(f.calls.at(-1), 'pause');
  f.clock.loading = false;
  f.clock.playing = true;
  f.clock.progress = 12;
  await f.render();
  assert.deepEqual(f.calls.slice(-2), ['seek:12', 'play']);
  player.buffered();
  const shown = await f.render(true);
  assert.equal(f.players.length, 1, 'showing the video reuses the buffered player');
  assert.doesNotMatch(shown.props.className, /opacity-0/);
});

test('buffer completion uses the latest clock and cannot restart a replaced song', async () => {
  const f = fixture();
  await f.render();
  const old = f.players[0];
  old.ready();
  f.clock.progress = 25;
  f.clock.loading = false;
  await f.render();
  old.buffered();
  assert.deepEqual(f.calls.slice(-2), ['seek:25', 'pause']);
  await f.render(false, 'replacement');
  const count = f.calls.length;
  old.ready();
  old.buffered();
  assert.equal(f.calls.length, count);
  assert.equal(f.players.length, 2);
});
