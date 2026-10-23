import { usePageTitle } from 'src/hooks/documentTitle';
import React, { useMemo, useState } from 'react';
import { api } from 'src/utils/api';
import placeholder from 'src/assets/placeholder.png';
import Carousel, { CarouselItem } from 'src/components/Carousel';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppScrollbar from 'src/components/Scrollbar';
import { Skeleton } from 'src/components/ui/skeleton';
import { Categories, Collection } from 'src/models/spotify';
import { Mic2, Search, Settings, Shuffle, UserPlus } from 'lucide-react';
import { Button, IconButton } from 'src/components/ui/button';
import SongCard from 'src/components/SongCard';
import { useTrackStore } from 'src/store';
import { usePlayerStore } from 'src/store/player';
import { useSettingStore } from 'src/store/setting';
import { useDebouncedCallback } from 'src/hooks/debounce';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
import { useJam, useRoomStore } from 'src/store/room';
import { useT, type TranslationKey } from 'src/i18n';
import { chartLabels, PROVIDER_COLOR, PROVIDER_LOGO, type ChartSource } from 'src/utils/charts';

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
            referrerPolicy="no-referrer"
            src={playlist.images?.[0]?.url || placeholder}
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

export const SECTIONS: { keyword: string; label: TranslationKey; name: TranslationKey }[] = [
  { keyword: 'chinese', label: 'home.lang.chinese', name: 'home.section.chinese' },
  { keyword: 'korean', label: 'home.lang.korean', name: 'home.section.korean' },
  { keyword: 'english', label: 'home.lang.english', name: 'home.section.english' },
  { keyword: 'japanese', label: 'home.lang.japanese', name: 'home.section.japanese' },
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
      // rethrow so react-query retries instead of caching an empty result
      console.error('Error fetching top categories:', error);
      throw error;
    });
};

const fetchCharts = async (): Promise<ChartSource[]> =>
  api.get('/charts').then(({ data }) => data.sources || []);

function ProviderMark({ source, className }: { source: string; className?: string }) {
  const logo = PROVIDER_LOGO[source];
  return logo ? (
    <img src={logo} alt="" className={cn('size-6 shrink-0', className)} />
  ) : (
    <span
      className={cn('flex size-6 shrink-0 items-center justify-center rounded-md text-sm font-extrabold text-white', className)}
      style={{ background: PROVIDER_COLOR[source] }}
    >
      K
    </span>
  );
}

export const topCategoriesQuery = { queryKey: ['categories'], queryFn: fetchTopCategories };

const greetingKey = (): TranslationKey => {
  const hour = new Date().getHours();
  if (hour < 5) return 'home.greeting.late';
  if (hour < 12) return 'home.greeting.morning';
  if (hour < 18) return 'home.greeting.afternoon';
  return 'home.greeting.evening';
};

export function MainView() {
  const t = useT();
  usePageTitle(t('nav.browse'));
  const { data: categories, isLoading } = useQuery(topCategoriesQuery);
  const { data: chartSources } = useQuery({ queryKey: ['charts'], queryFn: fetchCharts, staleTime: 60 * 60 * 1000 });
  const [chartSource, setChartSource] = useState<string>(() => localStorage.getItem('chartSource') || 'kkbox');

  const navigate = useNavigate();
  const mobile = useBreakpointDown('md');
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const nickname = useRoomStore((state) => state.nickname);
  const { isInJam } = useJam();
  const setSettingsOpen = useSettingStore((state) => state.setSettingsOpen);
  const setInviteOpen = useSettingStore((state) => state.setInviteOpen);
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const getRandomTracks = usePlayerStore((state) => state.getRandomTracks);
  const onAdd = useDebouncedCallback(addSongToQueue, 100);
  const onInsert = useDebouncedCallback(insertSongToQueue, 100);
  const [language, setLanguage] = useState<string>('all');

  // Songs that are already processed can be sung right away, so they are the best recommendation.
  const readyList = useMemo(() => {
    const seen = new Set<string>();
    return Array.from(readyTracks)
      .filter((track) => !seen.has(track.id) && !!seen.add(track.id))
      .sort((a, b) => (b.timeAdded ?? 0) - (a.timeAdded ?? 0)) // newest first
      .slice(0, mobile ? 4 : 8);
  }, [readyTracks, mobile]);

  const handleOnClickPlaylist = (playlist: Collection) => {
    navigate(`/playlist/${playlist.id}`, {
      state: { collection: playlist },
    });
  };

  const sections = useMemo(() => {
    return SECTIONS.map((section) => ({
      ...section,
      collections: categories?.[section.keyword] || [],
    })).filter((section) => language === 'all' || section.keyword === language);
  }, [categories, language]);
  return (
    <AppScrollbar className="h-full">
      {mobile && isInJam && (
        <div className="fixed z-50 flex h-12 w-full items-center justify-between bg-primary px-4">
          <span className="text-sm text-white">{t('home.jamBanner')}</span>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/15" onClick={leaveRoom}>
            {t('common.leave')}
          </Button>
        </div>
      )}
      <div className={cn('w-full overflow-hidden pb-8', mobile && isInJam ? 'pt-14' : 'pt-4 md:pt-6')}>
        {/* Hero */}
        <div className="px-4 md:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff6aa8] to-[#b81d58] p-6 text-white shadow-lg md:p-10">
            <div className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-white/10 blur-2xl" />
            <Mic2 className="pointer-events-none absolute right-6 bottom-[-1.5rem] size-40 -rotate-12 text-white/10 md:right-14 md:size-56" />
            {mobile && (
              <div className="absolute top-3 right-3 flex">
                <IconButton
                  aria-label={t('invite.button')}
                  className="text-white hover:bg-white/15"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus className="size-5" />
                </IconButton>
                <IconButton
                  aria-label={t('nav.settings')}
                  className="text-white hover:bg-white/15"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="size-5" />
                </IconButton>
              </div>
            )}
            <p className="text-sm font-medium text-white/80">
              {nickname ? t('home.greetingNamed', { greeting: t(greetingKey()), name: nickname }) : t(greetingKey())}
            </p>
            <h1 className="mt-1 max-w-md text-3xl font-extrabold tracking-tight md:text-5xl">{t('home.title')}</h1>
            <p className="mt-2 max-w-md text-sm text-white/80">
              {t('home.subtitle')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="bg-white text-black shadow-none hover:bg-white/90" onClick={() => getRandomTracks()}>
                <Shuffle /> {t('home.surprise')}
              </Button>
              <Button
                variant="ghost"
                className="bg-white/15 text-white hover:bg-white/25 hover:text-white"
                onClick={() => navigate('/search')}
              >
                <Search /> {t('home.searchSongs')}
              </Button>
            </div>
          </div>
        </div>

        {/* Ready to sing */}
        {readyList.length > 0 && (
          <section className="mt-8 px-4 md:px-8">
            <div className="mb-2 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{t('home.ready')}</h2>
                <span className="text-xs text-muted-foreground">{t('home.readyHint')}</span>
              </div>
              <Link to="/library" className="shrink-0 text-sm font-medium text-primary hover:underline">
                {t('library.seeAll')} →
              </Link>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {readyList.map((track) => (
                <SongCard key={track.id} track={track} className="px-1" onAdd={onAdd} onInsert={onInsert} />
              ))}
            </div>
          </section>
        )}

        {/* Charts from other services */}
        {chartSources && chartSources.length > 0 && (
          <section className="mt-8 px-4 md:px-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{t('chart.title')}</h2>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {chartSources.map((source) => {
                const selected = (chartSources.some((s) => s.id === chartSource) ? chartSource : chartSources[0].id) === source.id;
                return (
                  <button
                    key={source.id}
                    onClick={() => {
                      setChartSource(source.id);
                      localStorage.setItem('chartSource', source.id);
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                      selected ? 'border-transparent bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <ProviderMark source={source.id} className="size-4 text-[10px]" />
                    {source.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(chartSources.find((s) => s.id === chartSource) ?? chartSources[0]).charts.map((chart) => {
                const sourceId = (chartSources.find((s) => s.id === chartSource) ?? chartSources[0]).id;
                const { title, subtitle } = chartLabels(sourceId, chart.id);
                return (
                  <Link
                    key={chart.id}
                    to={`/playlist/${chart.id}`}
                    state={{ collection: chart }}
                    className="flex h-[60px] items-center gap-3 rounded-xl border bg-foreground/[0.04] px-3.5 transition-colors hover:bg-foreground/[0.08]"
                  >
                    <ProviderMark source={sourceId} className="size-7" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{title ? t(title) : chart.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t(subtitle)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Language filter */}
        <div className="no-scrollbar mt-8 flex gap-2 overflow-x-auto px-4 md:px-8">
          {[{ keyword: 'all', label: 'home.filter.all' as TranslationKey }, ...SECTIONS].map(
            (option) => (
              <button
                key={option.keyword}
                onClick={() => setLanguage(option.keyword)}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  language === option.keyword
                    ? 'border-transparent bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {t(option.label)}
              </button>
            )
          )}
        </div>

        {sections.map((section) => (
          <section key={section.keyword} className="mt-6">
            <h2 className="mx-4 mb-2 text-lg font-semibold tracking-tight md:mx-8">{t(section.name)}</h2>
            <Carousel>
              {isLoading
                ? Array.from({ length: 5 }).map((_, index) => <PlaylistCard key={index} />)
                : section.collections.map((collection) => (
                    <PlaylistCard key={collection.id} playlist={collection} onCardClick={handleOnClickPlaylist} />
                  ))}
            </Carousel>
          </section>
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
