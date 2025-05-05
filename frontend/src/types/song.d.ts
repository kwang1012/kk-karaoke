type Song = {
  id: string;
  name: string;
  artists: string[] | { name: string; id: string }[]; // Array of artist names or objects
  album?: {
    name: string;
    image?: string | null; // Image can be a string or an array of objects with url
    images?: { url: string }[]; // Array of image objects with url
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

type Collection = {
  id: string;
  name: string;
  description: string;
  image: string;
};

type Categories = {
  [key: string]: Playlist[];
};
