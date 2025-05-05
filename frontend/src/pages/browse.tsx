import React from 'react';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppScrollbar from 'src/components/Scrollbar';

function PlaylistCard({ playlist, onClick }: { playlist: Collection; onClick: (playlist: Collection) => void }) {
  return (
    <CarouselItem key={playlist.id} onClick={() => onClick(playlist)}>
      <img src={playlist.image || placeholder} className="w-full rounded-md" />
      <span className="text-sm text-gray-400 line-clamp-2">{playlist.name}</span>
    </CarouselItem>
  );
}

const SECTIONS = [
  {
    keyword: 'chinese',
    name: 'Top Chinese KTV Playlists',
  },
  {
    keyword: 'korean',
    name: 'Top Korean KTV Playlists',
  },
  {
    keyword: 'english',
    name: 'Top English KTV Playlists',
  },
  {
    keyword: 'japanese',
    name: 'Top Japanese KTV Playlists',
  },
];

const fetchTopCategories = async (): Promise<Categories> => {
  return api
    .get('/top-categories', {
      params: {
        keyword: SECTIONS.map((s) => s.keyword).join(','),
      },
    })
    .then(({ data }) => {
      return data['categories'] || [];
    })
    .catch((error) => {
      console.error('Error fetching top categories:', error);
      return [];
    });
};

export function MainView() {
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchTopCategories(),
  });

  const navigate = useNavigate();

  const handleOnClickPlaylist = (playlist: Collection) => {
    navigate(`/playlist/${playlist.id}`, {
      state: { collection: playlist },
    });
  };
  return (
    <AppScrollbar>
      {isLoading ? (
        <div className="p-8">Loading categories...</div>
      ) : (
        <div className="pt-6 w-full overflow-hidden">
          {SECTIONS.map((section) => {
            const playlists = categories?.[section.keyword] || [];
            return (
              <div key={section.keyword} className="mb-8">
                <h1 className="mx-8 mb-1 text-lg tracking-widest">{section.name}</h1>
                <Carousel>
                  {playlists.map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} onClick={handleOnClickPlaylist} />
                  ))}
                </Carousel>
              </div>
            );
          })}
        </div>
      )}
    </AppScrollbar>
  );
}

function BrowseView() {
  return (
    <div className="text-white overflow-hidden h-full">
      <Outlet />
    </div>
  );
}

export default BrowseView;
