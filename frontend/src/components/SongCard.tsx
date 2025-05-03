import React from 'react';
import placeholderImage from 'src/assets/placeholder.png';

type SongCardProps = {
  className?: string;
  song: Song;
};

export default function SongCard({ className, song }: SongCardProps) {
  return (
    <div className={`flex items-center cursor-pointer hover:bg-[#2f2f2f] p-2 rounded-md ${className}`}>
      <div className="w-10 h-10 bg-[#3f3f3f] rounded-md mr-4 overflow-hidden">
        <img src={song.album?.image || placeholderImage} className="w-full h-full" />
      </div>
      <div className="flex flex-col justify-between py-1">
        <span className="text-white">{song.name}</span>
        <span className="text-sm text-gray-400">{song.artists.join(', ')}</span>
      </div>
    </div>
  );
}
