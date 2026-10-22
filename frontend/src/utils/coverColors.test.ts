import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function colors(palette: Record<string, unknown> = {}, failure?: 'image' | 'palette') {
  const images: any[] = [];
  class Image {
    crossOrigin = '';
    referrerPolicy = '';
    onload?: () => void;
    onerror?: () => void;
    constructor() { images.push(this); }
    set src(_value: string) {
      // Cached images can complete immediately: handlers must already be installed.
      if (failure === 'image') this.onerror?.();
      else this.onload?.();
    }
  }
  class Vibrant {
    async getPalette() {
      if (failure === 'palette') throw new Error('Canvas unavailable');
      return palette;
    }
  }
  const source = readFileSync(new URL('./coverColors.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: any = {};
  runInNewContext(outputText, { exports, Image, require: () => ({ Vibrant }) });
  return { ...exports, images };
}

const gray = { rgb: [128, 128, 128], hsl: [0, 0, 0.5], hex: '#808080', population: 900 };
const accent = { rgb: [0, 0, 128], hsl: [2 / 3, 1, 0.25], hex: '#000080', population: 10 };

test('a neutral cover uses its dominant color instead of a tiny vibrant logo', async () => {
  const api = colors({ DarkVibrant: accent, Muted: gray });
  const result = await api.getLyricsRGB('cover');
  assert.equal(result.background, '#525252');
  assert.equal(api.images[0].referrerPolicy, 'no-referrer');
  assert.equal(api.images[0].crossOrigin, 'anonymous');
});

test('a colorful cover keeps its hue in both themes', async () => {
  const api = colors({ DarkVibrant: { ...accent, population: 1000 }, Muted: gray });
  const dark = await api.getLyricsRGB('cover');
  const light = await api.getLyricsRGB('cover', true);
  assert.equal(dark.background, '#000080');
  assert.equal(light.background, '#8080ff');
  assert.notEqual(dark.lyrics, light.lyrics);
});

for (const failure of ['image', 'palette'] as const) {
  test(`${failure} failure resolves to fallback colors instead of hanging`, async () => {
    const api = colors({}, failure);
    const result = await api.getLyricsRGB('broken');
    assert.equal(result.background, api.DEFAULT_BG_COLOR);
    assert.equal(result.lyrics, api.DEFAULT_COLOR);
  });
}

test('empty and synthetic-only palettes use the fallback', async () => {
  for (const palette of [{}, { DarkVibrant: { ...accent, population: 0 } }]) {
    const api = colors(palette);
    assert.equal((await api.getLyricsRGB('cover')).background, api.DEFAULT_BG_COLOR);
  }
});
