import { api } from 'src/utils/api';

/** The indicators a song is judged on, each 0..100; technique is null when the song had no long notes. */
export type Indicators = { pitch: number; precision: number; timing: number; technique: number | null };

export type SongResult = Indicators & { total: number; streakS: number; scoredS: number };

export type Singer = { id: string; name: string; avatar: string };

export type ScoredSong = { id: string; name: string; artists: string[]; cover: string };

export type Outcome = {
  newBest: boolean;
  previousBest: number | null;
  points: number;
  rank: number;
  songRank: number;
  songSingers: number;
};

export type Scope = 'all' | 'week';

export type BoardRow = {
  userId: string;
  name: string;
  avatar: string;
  rank: number;
  points: number;
  songs: number;
  streakS: number;
  best: { song: string; total: number } | null;
} & { [K in keyof Indicators]: Indicators[K] };

export type Board = { scope: string; singers: BoardRow[]; totalSingers: number; me: BoardRow | null };

export type SongBoardRow = Omit<BoardRow, 'points' | 'songs' | 'best'> & { total: number };

export type SongBoard = { songId: string; scope: string; singers: SongBoardRow[]; totalSingers: number; myRank: number | null };

export const submitScore = async (singer: Singer, song: ScoredSong, result: SongResult): Promise<Outcome> =>
  (await api.post('scores', { singer, song, result })).data;

export const fetchLeaderboard = async (scope: Scope, me?: string): Promise<Board> =>
  (await api.get('scores/leaderboard', { params: { scope, me } })).data;

export const fetchSongBoard = async (songId: string, scope: Scope, me?: string): Promise<SongBoard> =>
  (await api.get(`scores/song/${encodeURIComponent(songId)}`, { params: { scope, me } })).data;
