import assert from 'node:assert/strict';
import test from 'node:test';
import { SpotifyFollower, songOf, type FollowNow, type Match, type SpotifyState } from './spotifyFollow.ts';

const playing = (title: string, artist = 'A'): SpotifyState => ({ running: true, status: 'playing', title, artist, duration: 200 });
const paused = (title: string, artist = 'A'): SpotifyState => ({ ...playing(title, artist), status: 'paused' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(answers: Record<string, Match<string> | Error>) {
  const log: string[] = [];
  const changes: (FollowNow<string> | null)[] = [];
  let clock = 0;
  const sleeping: (() => void)[] = [];
  const follower = new SpotifyFollower<string>({
    command: async (name) => void log.push(name),
    position: async () => 42,
    match: async (song, process) => {
      log.push(`match ${song.title}${process ? '' : ' (watch)'}`);
      const answer = answers[song.title];
      if (answer instanceof Error) throw answer;
      return answer ?? { track: null, ready: false };
    },
    sing: (track, at) => void log.push(`sing ${track}${at === undefined ? '' : ` @${at}`}`),
    togglePlayback: () => void log.push('toggle'),
    onChange: (now) => changes.push(now),
    sleep: () => new Promise<void>((resolve) => sleeping.push(() => { clock += 1000; resolve(); })),
    now: () => clock,
  });
  return {
    follower,
    log,
    changes,
    tick: (ms: number) => void (clock += ms),
    /** Lets the next pause (a wait between asking again) end. */
    step: async () => {
      sleeping.shift()?.();
      await flush();
      await flush();
    },
  };
}

test('a song with a ready karaoke version is held and sung', async () => {
  const { follower, log, changes } = setup({ One: { track: 'one', ready: true } });
  follower.start();
  follower.heard(playing('One'));
  await flush();
  assert.deepEqual(log, ['mute', 'pause', 'match One', 'sing one']);
  assert.equal(changes.at(-1)?.stage, 'singing');
  assert.equal(follower.singing, true);
});

test('a song still being prepared is played by Spotify, then taken over where Spotify has got to', async () => {
  const answers: Record<string, Match<string>> = { One: { track: 'one', ready: false } };
  const { follower, log, step } = setup(answers);
  follower.start();
  follower.heard(playing('One'));
  await flush();
  assert.deepEqual(log.slice(0, 5), ['mute', 'pause', 'match One', 'unmute', 'play']);
  answers.One = { track: 'one', ready: true };
  await step();
  assert.ok(log.includes('sing one @42.3'), log.join(', '));
  assert.equal(follower.singing, true);
});

test('a song with no karaoke version is left to Spotify', async () => {
  const { follower, log, changes } = setup({});
  follower.start();
  follower.heard(playing('Nothing'));
  await flush();
  assert.deepEqual(log, ['mute', 'pause', 'match Nothing', 'unmute', 'play']);
  assert.equal(changes.at(-1)?.stage, 'missing');
});

test('a lookup that cannot be made is not "no karaoke version", and Spotify plays meanwhile', async () => {
  const answers: Record<string, Match<string> | Error> = { One: new Error('401') };
  const { follower, log, changes, step } = setup(answers);
  follower.start();
  follower.heard(playing('One'));
  await flush();
  assert.equal(changes.some((c) => c?.stage === 'failed'), true);
  assert.equal(changes.some((c) => c?.stage === 'missing'), false);
  assert.ok(log.includes('unmute') && log.includes('play'));
  answers.One = { track: 'one', ready: true };
  await step();
  assert.ok(log.includes('sing one @42.3'), log.join(', '));
});

test('the same song reported again is not a new song, but play pressed in Spotify plays or pauses ours', async () => {
  const { follower, log, tick } = setup({ One: { track: 'one', ready: true } });
  follower.start();
  follower.heard(playing('One'));
  await flush();
  follower.heard(playing('One')); // Spotify has not paused yet
  assert.equal(log.filter((l) => l === 'match One').length, 1);
  assert.equal(log.includes('toggle'), false);
  tick(5000);
  follower.heard(playing('One')); // play pressed
  assert.equal(log.at(-1), 'toggle');
  assert.equal(log.filter((l) => l === 'match One').length, 1);
});

test('the song held paused is ignored, and a new song replaces it', async () => {
  const { follower, log } = setup({ One: { track: 'one', ready: true }, Two: { track: 'two', ready: true } });
  follower.start();
  follower.heard(playing('One'));
  await flush();
  follower.heard(paused('One'));
  follower.heard(playing('Two'));
  await flush();
  assert.ok(log.includes('sing two'));
});

test('the end of a song asks Spotify for its next one, and only while following', async () => {
  const { follower, log } = setup({});
  assert.equal(follower.advance(), false);
  follower.start();
  assert.equal(follower.advance(), true);
  assert.equal(log.at(-1), 'next');
  follower.stop();
  assert.equal(log.at(-1), 'unmute');
  assert.equal(follower.advance(), false);
});

test('a paused song is looked up and shown without being sung', async () => {
  const { follower, log, changes } = setup({ One: { track: 'one', ready: true } });
  follower.start();
  follower.heard(paused('One'));
  await flush();
  assert.equal(changes.at(-1)?.stage, 'singing');
  assert.equal(log.some((l) => l.startsWith('sing')), false);
});

test('songOf drops what Spotify does not know', () => {
  assert.equal(songOf({ running: false, status: 'stopped' }), null);
  const song = songOf({ running: true, status: 'playing', title: 'T', artist: 'A', album: '', trackNumber: 0, duration: 0 });
  assert.deepEqual([song?.album, song?.trackNumber, song?.duration], [undefined, undefined, undefined]);
});
