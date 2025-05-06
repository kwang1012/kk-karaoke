import { CircularProgress, CircularProgressProps } from '@mui/material';
import { ReactElement, useMemo } from 'react';
import placeholderImage from 'src/assets/placeholder.png';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGears, faMusic } from '@fortawesome/free-solid-svg-icons';
import { useAudioStore } from 'src/store';
import { useWebSocketStore } from 'src/store/ws';

type SongCardProps = {
  className?: string;
  song: Song;
  dense?: boolean;
  disable?: boolean;
  onAdd?: (song: Song) => void;
};

const CircularProgressWithLabel = ({ children, ...props }: { children?: ReactElement } & CircularProgressProps) => (
  <div className="relative inline-flex">
    <CircularProgress variant="determinate" {...props} />
    <div className="top-0 left-0 bottom-0 right-0 absolute flex items-center justify-center">
      {children ? children : <span className="text-white text-xs">{props.value}%</span>}
    </div>
  </div>
);

export default function SongCard({ className, song, dense, disable, onAdd, ...props }: SongCardProps) {
  const songStatus = useAudioStore((state) => state.songStatus);
  const songProgress = useAudioStore((state) => state.songProgress);
  const status = useMemo(() => songStatus[song.id], [songStatus, song.id]);
  const progress = useMemo(() => songProgress[song.id], [songProgress, song.id]);
  const isReady = useMemo(() => !status || status === 'ready', [status]);
  const initialized = useWebSocketStore((state) => state.initialized);
  const connected = useWebSocketStore((state) => state.connected);
  const parsedSong = useMemo(() => {
    let albumImage: any;
    if (typeof song.album?.image === 'string') {
      albumImage = song.album.image;
    } else if (Array.isArray(song.album!.images) && song.album!.images!.length > 0) {
      albumImage = song.album!.images[0].url;
    } else {
      albumImage = placeholderImage; // Fallback to placeholder if no image is available
    }
    return {
      id: song.id,
      name: song.name,
      artists:
        song.artists.map((artist: any) => {
          if (typeof artist === 'string') return artist;
          return artist.name || artist; // Fallback to string if artist object is not structured
        }) || [],
      album: {
        name: song.album?.name || '',
        image: albumImage,
      },
    };
  }, [song]);

  const progressIcon = useMemo(() => {
    if (status === 'downloading_lyrics' || status === 'downloading_audio')
      return <FontAwesomeIcon width={20} widths={20} color="white" icon={faMusic} />;
    // if (status === 'downloading_audio') return <SvgIcon className="w-4 h-4" src={music} />;
    if (status === 'separating') return <FontAwesomeIcon width={20} height={20} color="white" icon={faGears} />;
    return <></>;
  }, [status]);
  return (
    <div
      onClick={() => {
        if (onAdd && initialized && connected) {
          onAdd(parsedSong);
        }
      }}
      className={[
        `flex items-center relative overflow-hidden rounded-md my-2 ${className}`,
        isReady && !disable && initialized && connected ? 'cursor-pointer hover:bg-[#2f2f2f]' : '',
        dense ? 'py-0 px-1' : 'px-2',
      ].join(' ')}
      {...props}
    >
      {!isReady && !disable && (
        <div className="absolute inset-0 bg-[#3b3b3b] opacity-70 flex items-center justify-end px-4">
          <CircularProgressWithLabel
            size={36}
            sx={{ color: 'white' }}
            variant={status === 'separating' ? 'determinate' : 'indeterminate'}
            value={progress}
          >
            {progressIcon}
          </CircularProgressWithLabel>
        </div>
      )}
      <div className="w-10 h-10 bg-[#3f3f3f] rounded-md mr-4 overflow-hidden">
        <img src={parsedSong.album.image} className="w-full h-full" />
      </div>
      <div className="flex flex-col justify-between py-1">
        <span className="text-white line-clamp-1">{song.name}</span>
        <span className="text-sm text-gray-400">{parsedSong.artists.join(', ')}</span>
      </div>
    </div>
  );
}
