import { Home, MicVocal, Search, X } from 'lucide-react';
import { IconButton } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Separator } from 'src/components/ui/separator';
import { cn } from 'src/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LyricsEditor from 'src/components/LyricsEditor';
import AppScrollbar from 'src/components/Scrollbar';
import { useTrackStore } from 'src/store';
import LyricsEditorPlayer from 'src/components/LyricsEditor/Player';
import { useT } from 'src/i18n';
export default function LyricsEditView() {
  const t = useT();
  const { trackId } = useParams();
  const navigate = useNavigate();
  const readyTracks = useTrackStore((state) => state.readyTracks);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [search, setSearch] = useState('');

  const uniqueTracks = useMemo(() => {
    const seen = new Set<string>();
    return Array.from(readyTracks).filter((track) => {
      const isUnique = !seen.has(track.id);
      const matchesSearch = track.name.toLowerCase().includes(search.toLowerCase());
      if (isUnique && matchesSearch) {
        seen.add(track.id);
        return true;
      }
      return false;
    });
  }, [readyTracks, search]);
  const track = uniqueTracks.find((track) => track.id === trackId) ?? {
    id: '',
    name: t('editor.noTrack'),
    artists: [],
    timeAdded: Date.now(),
  };

  useEffect(() => {
    if (!trackId && uniqueTracks.length > 0) {
      navigate(`/lyrics/edit/${uniqueTracks[0].id}`, { replace: true });
    }
  }, [trackId, uniqueTracks[0]]);
  const [progress, setProgress] = useState(0);
  return (
    <div className="grid h-full w-full grid-cols-[auto_1fr] gap-3 bg-background p-3">
      <div className="grid h-full w-[300px] grid-rows-[auto_auto_1fr] gap-2 overflow-hidden rounded-2xl border bg-card">
        <div className="p-4">
          <h1 className="font-bold text-2xl">
            <IconButton onClick={() => navigate('/')}>
              <Home className="size-6" />
            </IconButton>
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
        </div>
        <Separator />
        <AppScrollbar className="h-full">
          <ul>
            {uniqueTracks.map((track) => (
              <li ref={(el) => {
                  itemRefs.current[track.id] = el;
                }} key={track.id} className="border-b border-border">
                <button
                  className={cn(
                    'flex w-full items-center gap-4 px-4 py-2 text-left transition-colors hover:bg-accent',
                    trackId === track.id && 'bg-primary/15 text-primary hover:bg-primary/20'
                  )}
                  onClick={() => {
                    // onCancel();
                    navigate(`/lyrics/edit/${track.id}`);
                  }}
                >
                  <MicVocal className="size-6 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{track.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {track.artists.map((artist) => artist.name).join(', ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </AppScrollbar>
      </div>
      <div className="grid h-full w-full grid-rows-[1fr_auto] overflow-hidden rounded-2xl border bg-card px-10 py-5">
        <LyricsEditor track={track} progress={progress} />
        <LyricsEditorPlayer
          track={track}
          onProgress={(progress) => {
            setProgress(progress);
          }}
        />
      </div>
    </div>
  );
}
