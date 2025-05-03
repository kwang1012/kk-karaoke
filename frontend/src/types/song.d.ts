type Song = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  // ... any other metadata
};
type Queue = {
  songs: Song[];
  totalDuration: number;
  // ... any other metadata
};

type Lyrics = {
  time: number;
  text: string;
};
