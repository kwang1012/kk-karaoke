import { usePageTitle } from 'src/hooks/documentTitle';
import { Home, Search, X } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Separator } from 'src/components/ui/separator';
import { cn } from 'src/lib/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LyricsEditor from 'src/components/LyricsEditor';
import ConfirmDialog from 'src/components/LyricsEditor/ConfirmDialog';
import { needsAttention, toneClass, toneOf, type LyricsStatus } from 'src/components/LyricsEditor/info';
import AppScrollbar from 'src/components/Scrollbar';
import { useTrackStore } from 'src/store';
import LyricsEditorPlayer, { type PlayerHandle } from 'src/components/LyricsEditor/Player';
import { useT } from 'src/i18n';
import { api } from 'src/utils/api';

type Filter = 'all' | 'attention';

/** Where this page lives in the admin area; the song is the last part of the path. */
const BASE = '/admin/lyrics';

export default function LyricsEditView() {
  const t = useT();
  const { trackId } = useParams();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const playerRef = useRef<PlayerHandle | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [statuses, setStatuses] = useState<Record<string, LyricsStatus>>({});
  const [dirty, setDirty] = useState(false);
  // Where the person wanted to go while edits were unsaved, until they say whether to leave.
  const [pendingTrack, setPendingTrack] = useState<string | null>(null);

  const loadStatuses = useCallback(() => {
    api
      .get('/lyrics/status')
      .then(({ data }) => setStatuses(data))
      .catch((err) => console.error('Error fetching lyrics status:', err));
  }, []);
  useEffect(loadStatuses, [loadStatuses]);

  const allTracks = useMemo(() => {
    const seen = new Set<string>();
    return Array.from(readyTracks).filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }, [readyTracks]);

  const uniqueTracks = useMemo(
    () =>
      allTracks.filter(
        (track) =>
          track.name.toLowerCase().includes(search.toLowerCase()) &&
          (filter === 'all' || needsAttention(statuses[track.id]))
      ),
    [allTracks, search, filter, statuses]
  );
  const attentionCount = useMemo(() => allTracks.filter((track) => needsAttention(statuses[track.id])).length, [allTracks, statuses]);

  // Search and filter narrow the list; they must not decide which song is open.
  const track = allTracks.find((track) => track.id === trackId) ?? {
    id: '',
    name: t('editor.noTrack'),
    artists: [],
    timeAdded: Date.now(),
  };

  usePageTitle(`${t('editor.pageTitle')} - ${t('admin.title')}`, track.id ? track : undefined);

  useEffect(() => {
    if (!trackId && uniqueTracks.length > 0) {
      navigate(`${BASE}/${uniqueTracks[0].id}`, { replace: true });
    }
  }, [trackId, uniqueTracks[0]]);

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  const open = (id: string) => {
    if (id === trackId) return;
    if (dirty) setPendingTrack(id);
    else navigate(`${BASE}/${id}`);
  };

  return (
    <div className="grid h-full w-full grid-cols-[auto_1fr] gap-3 bg-background p-3">
      <div className="grid h-full w-75 grid-rows-[auto_auto_1fr] gap-2 overflow-hidden rounded-2xl border bg-card">
        <div className="p-4">
          <h1 className="font-bold text-2xl">
            {t('nav.lyrics')}
          </h1>
          <div className="relative mt-4">
            <Search className="absolute top-1/2 left-2 size-5 -translate-y-1/2" />
            <Input
              className="h-10 px-9"
              placeholder={t('editor.searchTracks')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <IconButton
              onClick={() => setSearch('')}
              className={cn('absolute top-1/2 right-0 -translate-y-1/2', !search && 'invisible')}
            >
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="mt-3 flex items-center gap-2" role="group">
            {(['all', 'attention'] as Filter[]).map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === f ? 'border-primary bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {f === 'all' ? t('editor.filter.all') : `${t('editor.filter.attention')} · ${attentionCount}`}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{t('editor.songs', { count: uniqueTracks.length })}</span>
          </div>
        </div>
        <Separator />
        <AppScrollbar className="h-full">
          <ul>
            {uniqueTracks.map((item) => (
              <li
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                key={item.id}
                className="border-b border-border"
              >
                <button
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent',
                    trackId === item.id && 'bg-primary/15 text-primary hover:bg-primary/20'
                  )}
                  onClick={() => open(item.id)}
                >
                  <span
                    className={cn('size-2.5 shrink-0 rounded-full', toneClass[toneOf(statuses[item.id])])}
                    title={statuses[item.id]?.confidence ? t(`editor.confidence.${statuses[item.id].confidence}` as any) : t('editor.confidence.none')}
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {item.artists.map((artist) => artist.name).join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </AppScrollbar>
      </div>
      <div className="grid h-full w-full grid-rows-[1fr_auto] overflow-hidden rounded-2xl border bg-card px-10 py-5">
        <LyricsEditor
          track={track}
          progress={progress}
          playing={playing}
          playerRef={playerRef}
          onDirtyChange={setDirty}
          onChanged={loadStatuses}
        />
        <LyricsEditorPlayer ref={playerRef} track={track} onProgress={setProgress} onPlayingChange={setPlaying} />
      </div>

      <ConfirmDialog
        open={pendingTrack !== null}
        title={t('editor.leaveTitle')}
        confirmLabel={t('editor.leave')}
        cancelLabel={t('editor.stay')}
        onConfirm={() => {
          const id = pendingTrack;
          setPendingTrack(null);
          setDirty(false);
          if (id) navigate(`${BASE}/${id}`);
        }}
        onCancel={() => setPendingTrack(null)}
      >
        <p>{t('editor.leaveBody')}</p>
      </ConfirmDialog>
    </div>
  );
}
