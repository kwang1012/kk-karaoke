import { useMemo, useRef } from 'react';
import SongCard from './SongCard';
import { useTrackStore } from 'src/store/track';
import AppScrollbar from './Scrollbar';
import { Message } from 'src/store/ws';
import { Button } from 'src/components/ui/button';
import { Shuffle } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useRemoteMessageQueue } from 'src/hooks/queue';
import { usePlayer } from 'src/store/player';
import TrackQueue from './TrackQueue';
import QueueOrderControls from './QueueOrderControls';
import Jam from './Jam';
import { getUniqueId } from 'src/utils';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useT } from 'src/i18n';
import { canFollowSpotify } from 'src/hooks/spotifyFollow';
import { useSettingStore } from 'src/store/setting';
import { useSpotifyFollowStore } from 'src/store/spotifyFollow';

/** Always mounted (even when hidden) because it owns the websocket queue listener. */
export default function Queue({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const setSongStatus = useTrackStore((state) => state.setSongStatus);

  const { currentTrack, queue, queueIdx } = usePlayer();
  // While Spotify is followed it chooses every song: the room's own queue is not shown, only the song Spotify is on
  const following = useSettingStore((state) => state.followSpotify) && canFollowSpotify();
  const spotifyNow = useSpotifyFollowStore((state) => state.now);
  const { addToQueue, insertToQueue, getRandomTracks, rmFromQueue, clearQueue, setQueue } = usePlayer();
  const roomId = useRoomStore((state) => state.roomId);
  const activeRoomId = useActiveRoomId();
  const tracks = useMemo(() => {
    return queue.slice(queueIdx + 1).map((track, index) => ({
      index,
      ...track,
      uniqueId: getUniqueId(track),
    }));
  }, [queue, queueIdx]);

  useRemoteMessageQueue('queue', {
    onAddItem: (item: Message) => {
      if (item.data.action === 'arranged') {
        if (item.data.roomId === activeRoomId) setQueue(item.data.tracks);
      } else if (item.data.action === 'added') {
        addToQueue(item.data.track);
        requestAnimationFrame(() => {
          const viewport = scrollbarRef.current;
          if (viewport) viewport.scrollTop = viewport.scrollHeight; // scroll to bottom
        });
      } else if (item.data.action === 'updated') {
        if (item.data.status === 'ready') {
          setSongStatus(item.data.track.id, 'ready');
        }
      } else if (item.data.action === 'removed') {
        rmFromQueue(item.data.track);
      } else if (item.data.action === 'reordered') {
        const id = item.data.id;
        if (id === roomId) return; // ignore message if owner
        const oldIndex = item.data.oldIdx;
        const newIndex = item.data.newIdx;
        // the index here is already offset by queueIdx + 1, should be the same as the index in tracks
        const newItems = [...queue];
        const [element] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, element);
        setQueue(newItems);
      } else if (item.data.action === 'inserted') {
        insertToQueue(item.data.track);
      }
    },
  });

  return (
    <aside
      className={cn(
        'flex w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card max-md:hidden',
        hidden && 'hidden'
      )}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-lg font-semibold">{t('queue.title')}</h2>
        {!following && tracks.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearQueue}>
            {t('common.clear')}
          </Button>
        )}
      </div>
      <AppScrollbar className="min-h-0 flex-1 px-3 pb-4" ref={scrollbarRef}>
        <div className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('queue.nowPlaying')}</div>
        {following && spotifyNow && !spotifyNow.track ? (
          <div className="rounded-xl bg-accent/60 px-3 py-3">
            <div className="truncate text-sm font-medium">{spotifyNow.song.title}</div>
            <div className="truncate text-xs text-muted-foreground">{spotifyNow.song.artist}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t(`spotify.follow.${spotifyNow.stage}`, { title: spotifyNow.song.title })}</div>
          </div>
        ) : (
          <SongCard disableHover className="rounded-xl bg-accent/60" track={following && spotifyNow?.track ? spotifyNow.track : currentTrack} />
        )}

        <div className="mt-4">
          <Jam />
        </div>

        {following ? (
          <p className="mt-6 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('spotify.follow.upNext')}</p>
        ) : (
        <>
        <div className="mt-6 flex items-center justify-between gap-2 px-2 pb-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t(tracks.length > 0 && tracks.every((track) => track.recommended) ? 'queue.suggested' : 'queue.nextUp')}</span>
          {tracks.length > 0 && <QueueOrderControls />}
        </div>
        {tracks.length ? (
          <TrackQueue tracks={tracks} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('queue.empty')}</p>
            <Button size="sm" onClick={getRandomTracks}>
              <Shuffle /> {t('home.surprise')}
            </Button>
          </div>
        )}
        </>
        )}
      </AppScrollbar>
    </aside>
  );
}
