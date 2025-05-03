type Song = {
  id: string;
  name: string;
  artists: string[];
  album?: {
    name: string;
    image: string | null;
  };
  [key: string]: any; // Allow additional properties
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
