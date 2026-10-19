import React, { useMemo } from 'react';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppScrollbar from 'src/components/Scrollbar';
import { Skeleton } from 'src/components/ui/skeleton';
import { Categories, Collection } from 'src/models/spotify';
import { Button } from 'src/components/ui/button';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
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
          <img
            src={playlist.images[0].url || placeholder}
            className="aspect-square w-full rounded-lg object-cover shadow-md"
          />
          <span className="mt-2 line-clamp-2 text-sm font-medium">{playlist.name}</span>
        </>
      ) : (
        <Skeleton className="aspect-square w-full rounded-lg" />
      )}
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
  const mobile = useBreakpointDown('md');
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const { isInJam } = useJam();

  const handleOnClickPlaylist = (playlist: Collection) => {
    navigate(`/playlist/${playlist.id}`, {
      state: { collection: playlist },
    });
  };

  const sections = useMemo(() => {
    return SECTIONS.map((section) => ({
      ...section,
      collections: categories?.[section.keyword] || [],
    }));
  }, [categories]);
  return (
    <AppScrollbar className="h-full">
      {mobile && isInJam && (
        <div className="fixed z-50 flex h-12 w-full items-center justify-between bg-primary px-4">
          <span className="text-sm text-white">You are in a jam session</span>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/15" onClick={leaveRoom}>
            Leave
          </Button>
        </div>
      )}
      <div className={cn('w-full overflow-hidden pb-6', mobile && isInJam ? 'pt-16' : 'pt-8')}>
        <div className="mb-8 px-4 md:px-8">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Sing something tonight</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a playlist, queue a few songs, and take the mic.</p>
        </div>
        {sections.map((section) => (
          <div key={section.keyword} className="mb-8">
            <h2 className="mx-4 mb-2 text-lg font-semibold tracking-tight md:mx-8">{section.name}</h2>
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
