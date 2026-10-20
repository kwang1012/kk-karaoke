import { LibraryBig, Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import AppSelect from 'src/components/Select';
import SongCard from 'src/components/SongCard';
import { Button, IconButton } from 'src/components/ui/button';
import { useDebouncedCallback } from 'src/hooks/debounce';
import { useT } from 'src/i18n';
import { Track } from 'src/models/spotify';
import { useTrackStore } from 'src/store';
import { usePlayerStore } from 'src/store/player';
import { useNavigate } from 'react-router-dom';

type Sort = 'recent' | 'title' | 'artist';

const artistText = (track: Track) => track.artists.map((a) => a.name).join(', ');
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Every processed song, searchable and sortable. The list is virtualized, so thousands are fine. */
export default function LibraryView() {
  const t = useT();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const addSongToQueue = usePlayerStore((state) => state.addSongToQueue);
  const insertSongToQueue = usePlayerStore((state) => state.insertSongToQueue);
  const onAdd = useDebouncedCallback(addSongToQueue, 100);
  const onInsert = useDebouncedCallback(insertSongToQueue, 100);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    document.title = `KKaraoke - ${t('library.title')}`;
  }, [t]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return Array.from(readyTracks).filter((track) => !seen.has(track.id) && !!seen.add(track.id));
  }, [readyTracks]);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = needle
      ? all.filter((track) => `${track.name} ${artistText(track)} ${track.album?.name ?? ''}`.toLowerCase().includes(needle))
      : all.slice();
    return filtered.sort((a, b) => {
      if (sort === 'recent') return (b.timeAdded ?? 0) - (a.timeAdded ?? 0);
      if (sort === 'artist') return collator.compare(artistText(a), artistText(b)) || collator.compare(a.name, b.name);
      return collator.compare(a.name, b.name);
    });
  }, [all, deferredQuery, sort]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-6 pb-3 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('library.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {deferredQuery.trim()
                ? t('library.countFiltered', { shown: shown.length, total: all.length })
                : t('library.count', { total: all.length })}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="group flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full border bg-background px-4 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <Search className="size-4 shrink-0 text-muted-foreground group-focus-within:text-primary" />
            <input
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t('library.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('library.search')}
            />
            {query && (
              <IconButton size="small" aria-label={t('search.clear')} onClick={() => setQuery('')}>
                <X className="size-4" />
              </IconButton>
            )}
          </div>
          <AppSelect
            value={sort}
            onValueChange={(value) => setSort(value as Sort)}
            className="w-44"
            options={[
              { value: 'recent', label: t('library.sort.recent') },
              { value: 'title', label: t('library.sort.title') },
              { value: 'artist', label: t('library.sort.artist') },
            ]}
          />
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="min-h-0 flex-1">
          <Virtuoso
            style={{ height: '100%' }}
            data={shown}
            computeItemKey={(_, track) => track.id}
            increaseViewportBy={400}
            itemContent={(_, track) => (
              <div className="px-2 md:px-6">
                <SongCard track={track} className="px-2" onAdd={onAdd} onInsert={onInsert} />
              </div>
            )}
            components={{ Footer: () => <div className="h-6" /> }}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <LibraryBig className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">{all.length === 0 ? t('library.empty') : t('library.noMatch')}</p>
          {all.length === 0 ? (
            <Button size="sm" onClick={() => navigate('/search')}>
              {t('home.searchSongs')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setQuery('')}>
              {t('common.clear')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
