import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPitch, hzToMidi } from './pitchDetect.ts';

function tone(hz: number, sampleRate: number, length = 2048, amplitude = 0.4): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * hz * i) / sampleRate;
    out[i] = amplitude * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
  }
  return out;
}

for (const sampleRate of [44100, 48000]) {
  for (const hz of [110, 196, 261.63, 440, 880]) {
    test(`finds ${hz} Hz at ${sampleRate} Hz sampling`, () => {
      const pitch = detectPitch(tone(hz, sampleRate), sampleRate);
      assert.ok(pitch, 'a pitch is found');
      assert.ok(Math.abs(pitch.hz - hz) / hz < 0.01, `got ${pitch.hz}`);
    });
  }
}

test('silence and faint noise have no pitch', () => {
  assert.equal(detectPitch(new Float32Array(2048), 48000), null);
  const noise = new Float32Array(2048).map(() => (Math.random() - 0.5) * 0.004);
  assert.equal(detectPitch(noise, 48000), null);
});

test('loud noise is not mistaken for a note', () => {
  const noise = new Float32Array(2048).map(() => Math.random() - 0.5);
  assert.equal(detectPitch(noise, 48000), null);
});

test('a buffer too short to hold a period has no pitch', () => {
  assert.equal(detectPitch(tone(220, 48000, 64), 48000), null);
});

test('hzToMidi maps concert pitch', () => {
  assert.equal(hzToMidi(440), 69);
  assert.equal(Math.round(hzToMidi(261.63)), 60);
  assert.ok(Math.abs(hzToMidi(466.16) - 70) < 0.01);
});
