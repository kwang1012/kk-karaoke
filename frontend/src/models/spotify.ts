import { SongStatus } from 'src/store';
import { User } from './user';

export type Image = {
  height: number;
  width: number;
  url: string;
};
export type Artist = {
  id: string;
  name: string;
  uri: string;
  [key: string]: any; // Allow additional properties
};
export type Album = Collection & {
  id: string;
  name: string;
  albumType: string;
  totalTracks: number;
  releaseDate: string;
  images: Image[]; // Array of image objects
  artists: Artist[]; // Array of artist objects
  [key: string]: any; // Allow additional properties
};
export type Track = {
  id: string;
  name: string;
  artists: Artist[]; // Array of artist names or objects
  album?: Album;
  timeAdded: number;
  orderedBy?: User;
  status?: SongStatus;
  progress?: number;
  [key: string]: any; // Allow additional properties
  // ... any other metadata
};
export type Queue = {
  songs: Track[];
  totalDuration: number;
  // ... any other metadata
};

export type Lyrics = {
  time: number;
  text: string;
  romanized?: string;
};

export type Collection = {
  id: string;
  collaborative: boolean;
  name: string;
  description: string;
  images: Image[];
  owner: {
    displayName: string;
  };
  public: boolean;
  tracks: {
    total: number;
  };
  type: string;
  [key: string]: any; // Allow additional properties
};

export type Categories = {
  [key: string]: Collection[];
};
