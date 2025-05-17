import React, { useMemo } from 'react';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppScrollbar from 'src/components/Scrollbar';
import Skeleton from 'react-loading-skeleton';
import { Categories, Collection } from 'src/models/spotify';
import { Button, useMediaQuery } from '@mui/material';
import { useJam, useRoomStore } from 'src/store/room';

function PlaylistCard({
  playlist,
  onCardClick,
  ...props
}: {
  playlist?: Collection;
  onCardClick?: (playlist: Collection) => void;
} & React.HTMLProps<HTMLDivElement>) {
  return (
    <CarouselItem
      disable={!playlist}
      {...props}
      onClick={() => {
        if (playlist && onCardClick) {
          onCardClick(playlist);
        }
      }}
    >
      {playlist ? (
        <>
          <img src={playlist.images?.[0].url || placeholder} className="w-full rounded-md" />
          <span className="text-sm text-gray-400 line-clamp-2">{playlist.name}</span>
        </>
      ) : (
        <Skeleton className="w-full h-full rounded-md" baseColor="#1f1f1f" highlightColor="#2a2a2a" />
      )}
    </CarouselItem>
  );
}

const SECTIONS = [
  {
    keyword: 'demo',
    name: 'Demo Playlists',
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
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const { isInJam } = useJam();

  const handleOnClickPlaylist = (playlist: Collection) => {
    navigate(`/playlist/${playlist.id}`, {
      state: { collection: playlist },
    });
  };

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        collections: categories?.[section.keyword] || [],
      })),
    [categories]
  );
  return (
    <AppScrollbar className="h-full">
      {mobile && isInJam && (
        <div className="fixed w-full z-100 flex items-center justify-between bg-primary h-12 px-4">
          <span className="text-sm text-white">You are in a jam session</span>
          <Button variant="text" className="text-sm text-white bg-transparent" onClick={leaveRoom}>
            Leave
          </Button>
        </div>
      )}
      <div className={['w-full overflow-hidden', mobile && isInJam ? 'pt-16' : 'pt-6'].join(' ')}>
        {sections.map((section) => (
          <div key={section.keyword} className="mb-8">
            <h1 className="mx-4 md:mx-8 mb-1 text-lg font-bold">{section.name}</h1>
            <Carousel>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => <PlaylistCard key={index} />)
                : section.collections.map((collection) => (
                    <PlaylistCard key={collection.id} playlist={collection} onCardClick={handleOnClickPlaylist} />
                  ))}
            </Carousel>
          </div>
        ))}
      </div>
    </AppScrollbar>
  );
}

function BrowseView() {
  return (
    <div className="overflow-hidden h-full">
      <Outlet />
    </div>
  );
}

export default BrowseView;
