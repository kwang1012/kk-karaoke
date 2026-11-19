/**
 * Sings what Spotify plays (the desktop app on Windows). Spotify keeps choosing the songs; KKaraoke plays each one's
 * karaoke version in its place, with Spotify held silent and paused so nothing doubles. When the song ends, Spotify is
 * asked for its next one. A song with no karaoke version yet is started in the background and played by Spotify as
 * usual, so a song heard often turns into a karaoke one.
 *
 * This file is only the decisions: what Spotify does arrives through `heard`, and everything it causes goes out through
 * `Deps`, so it can be tested without Windows, Spotify or a player.
 */

/** What the desktop app reports about Spotify (see spotify-windows.ps1). */
export interface SpotifyState {
  running: boolean;
  status: 'playing' | 'paused' | 'stopped';
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  /** Seconds. */
  duration?: number;
  position?: number;
}

/** A song as Spotify names it. */
export interface SpotifySong {
  key: string;
  title: string;
  artist: string;
  album?: string;
  trackNumber?: number;
  duration?: number;
}

export interface Match<T> {
  track: T | null;
  ready: boolean;
}

export type FollowStage = 'matching' | 'singing' | 'preparing' | 'missing' | 'failed';

export interface FollowNow<T> {
  song: SpotifySong;
  track: T | null;
  stage: FollowStage;
}

export type SpotifyCommand = 'mute' | 'unmute' | 'pause' | 'play' | 'next';

export interface Deps<T> {
  command: (name: SpotifyCommand) => Promise<unknown>;
  /** Seconds into the song Spotify is on, or null. */
  position: () => Promise<number | null>;
  /** The recording this song is, and whether its karaoke version is ready. `process` starts preparing it when it is not. */
  match: (song: SpotifySong, process: boolean) => Promise<Match<T>>;
  /** Sing this recording now, from `at` seconds when given. */
  sing: (track: T, at?: number) => void;
  /** Play pressed in Spotify while our version of the song is on: play or pause ours. */
  togglePlayback: () => void;
  onChange: (now: FollowNow<T> | null) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/** Pauses between attempts at a lookup that could not be made: quick at first, then every minute for about ten minutes. */
export const RETRY_DELAYS_MS = [3000, 6000, 12000, 20000, 30000, 30000, 30000, ...Array(9).fill(60000)];
/** How often a song that is still being prepared is asked about, and for how long (about twenty minutes). */
export const READY_POLL_MS = 10000;
export const READY_POLL_TRIES = 120;
/** A second report of the song just begun is Spotify not having paused yet, not play pressed. */
export const SETTLE_MS = 2000;

export const songOf = (state: SpotifyState): SpotifySong | null => {
  if (!state.running || !state.title) return null;
  const artist = state.artist ?? '';
  const duration = state.duration && state.duration > 0 ? state.duration : undefined;
  const trackNumber = state.trackNumber && state.trackNumber > 0 ? state.trackNumber : undefined;
  return { key: `${state.title}\u0000${artist}`, title: state.title, artist, album: state.album || undefined, trackNumber, duration };
};

export class SpotifyFollower<T> {
  private song: SpotifySong | null = null;
  private stage: FollowStage | null = null;
  private beganAt = 0;
  /** Bumped by every new song and by stop: work that began for an earlier one sees it and gives up. */
  private generation = 0;
  private active = false;

  private deps: Deps<T>;

  constructor(deps: Deps<T>) {
    this.deps = deps;
  }

  get following() {
    return this.active;
  }

  /** Our karaoke version of Spotify's song is the one playing. */
  get singing() {
    return this.active && this.stage === 'singing';
  }

  start() {
    this.active = true;
    // Spotify is held silent for as long as this follows, so a song that arrives is never heard before it is looked up
    void this.deps.command('mute');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    this.song = null;
    this.stage = null;
    void this.deps.command('unmute');
    this.deps.onChange(null);
  }

  heard(state: SpotifyState) {
    if (!this.active) return;
    const song = songOf(state);
    if (!song) return;
    if (state.status === 'stopped') return;
    if (this.song && song.key === this.song.key) {
      // Spotify is playing the song held here: play pressed in Spotify, which means "play" or "pause" for ours
      if (state.status === 'playing' && this.stage === 'singing' && this.deps.now() - this.beganAt > SETTLE_MS) {
        void this.deps.command('pause');
        this.deps.togglePlayback();
      }
      return;
    }
    if (state.status === 'paused') {
      if (this.song) return; // ours is held paused, and the song it is on has not changed
      void this.peek(song);
      return;
    }
    void this.begin(song);
  }

  /** The song being sung ended, or Next was pressed: Spotify goes on to its next one. True when this took care of it. */
  advance(): boolean {
    if (!this.active) return false;
    void this.deps.command('next');
    return true;
  }

  private change(song: SpotifySong, track: T | null, stage: FollowStage) {
    this.stage = stage;
    this.deps.onChange({ song, track, stage });
  }

  private current(song: SpotifySong, generation: number) {
    return this.active && generation === this.generation && this.song?.key === song.key;
  }

  /** Spotify is on a song but not playing it: show it, and start preparing it so that pressing play finds it ready. */
  private async peek(song: SpotifySong) {
    const generation = ++this.generation;
    this.song = null;
    this.deps.onChange({ song, track: null, stage: 'matching' });
    const found = await this.lookUp(song, () => this.active && generation === this.generation && !this.song);
    if (found) this.deps.onChange({ song, track: found.track, stage: found.track ? (found.ready ? 'singing' : 'preparing') : 'missing' });
    else if (this.active && generation === this.generation && !this.song) this.deps.onChange({ song, track: null, stage: 'failed' });
  }

  private async begin(song: SpotifySong) {
    const generation = ++this.generation;
    this.song = song;
    this.beganAt = this.deps.now();
    this.change(song, null, 'matching');
    void this.deps.command('pause'); // already muted; paused so it does not move on by itself
    let spotifyPlays = false;
    const found = await this.lookUp(song, () => this.current(song, generation), async () => {
      // could not ask (offline, signed out): Spotify plays it meanwhile, and the lookup goes on trying
      this.change(song, null, 'failed');
      spotifyPlays = true;
      await this.letSpotifyPlay();
    });
    if (!found || !this.current(song, generation)) return;
    if (found.track && found.ready) {
      if (spotifyPlays) await this.takeOver(song, found.track, generation);
      else {
        this.change(song, found.track, 'singing');
        this.deps.sing(found.track);
      }
    } else if (found.track) {
      this.change(song, found.track, 'preparing');
      if (!spotifyPlays) await this.letSpotifyPlay();
      void this.watchReadiness(song, generation);
    } else {
      this.change(song, null, 'missing');
      if (!spotifyPlays) await this.letSpotifyPlay();
    }
  }

  /** The answer, retrying while the lookup cannot be made. Null when it never could be. */
  private async lookUp(song: SpotifySong, stillWanted: () => boolean, onFirstFailure?: () => Promise<void>): Promise<Match<T> | null> {
    for (const [attempt, delay] of [0, ...RETRY_DELAYS_MS].entries()) {
      if (delay) await this.deps.sleep(delay);
      if (!stillWanted()) return null;
      try {
        return await this.deps.match(song, true);
      } catch {
        // asked again after a pause
      }
      if (attempt === 0 && onFirstFailure) await onFirstFailure();
    }
    return null;
  }

  /** Spotify has been playing this song meanwhile: ours picks up from where it has got to. */
  private async takeOver(song: SpotifySong, track: T, generation: number) {
    const position = (await this.deps.position()) ?? 0;
    await this.deps.command('mute');
    await this.deps.command('pause');
    if (!this.current(song, generation)) return;
    this.beganAt = this.deps.now();
    this.change(song, track, 'singing');
    this.deps.sing(track, position + 0.3);
  }

  private async letSpotifyPlay() {
    await this.deps.command('unmute');
    await this.deps.command('play');
  }

  /** While Spotify plays a song that is still being prepared: when it is ready, ours takes over from where Spotify has got to. */
  private async watchReadiness(song: SpotifySong, generation: number) {
    for (let i = 0; i < READY_POLL_TRIES; i++) {
      await this.deps.sleep(READY_POLL_MS);
      if (!this.current(song, generation)) return;
      let found: Match<T>;
      try {
        found = await this.deps.match(song, false);
      } catch {
        continue;
      }
      if (!found.track || !found.ready) continue;
      if (!this.current(song, generation)) return;
      await this.takeOver(song, found.track, generation);
      return;
    }
  }
}

/** Where the rest of the app asks whether Spotify is being followed (the Next button, the end of a song). */
export const spotifyFollowRuntime: { current: { following: boolean; singing: boolean; advance: () => boolean } | null } = { current: null };
