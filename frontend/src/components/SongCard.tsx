import { CircularProgress } from '@mui/material';
import React, { useMemo } from 'react';
import placeholderImage from 'src/assets/placeholder.png';

type SongCardProps = {
  className?: string;
  song: Song;
  status?: string;
  dense?: boolean;
  disable?: boolean;
};

export default function SongCard({ className, song, dense, status, disable, ...props }: SongCardProps) {
  const isReady = useMemo(() => !status || status === 'ready', [status]);
  const artists = useMemo(
    () =>
      song.artists.map((artist) => {
        if (typeof artist === 'string') return artist;
        return artist.name || artist; // Fallback to string if artist object is not structured
      }) || [],
    [song.artists]
  );
  const image = useMemo(() => {
    if (!song.album) return placeholderImage; // Fallback to placeholder if no album is available
    if (typeof song.album?.image === 'string') {
      return song.album.image;
    }
    if (Array.isArray(song.album.images) && song.album.images?.length > 0) {
      return song.album.images[0].url;
    }
    return placeholderImage; // Fallback to placeholder if no image is available
  }, [song.album]);
  return (
    <div
      className={[
        `flex items-center relative overflow-hidden rounded-md ${className}`,
        isReady && !disable ? 'cursor-pointer hover:bg-[#2f2f2f]' : '',
        dense ? 'py-0 px-1' : 'p-2',
      ].join(' ')}
      {...props}
    >
      {!isReady && (
        <div className="absolute inset-0 bg-[#3b3b3b] opacity-70 flex items-center justify-end px-4">
          <span className="text-gray-400 text-right">Processing</span>
          <CircularProgress className="ml-2" size={12} sx={{ color: 'white' }} />
        </div>
      )}
      <div className="w-10 h-10 bg-[#3f3f3f] rounded-md mr-4 overflow-hidden">
        <img src={image} className="w-full h-full" />
      </div>
      <div className="flex flex-col justify-between py-1">
        <span className="text-white">{song.name}</span>
        <span className="text-sm text-gray-400">{artists.join(', ')}</span>
      </div>
    </div>
  );
}
