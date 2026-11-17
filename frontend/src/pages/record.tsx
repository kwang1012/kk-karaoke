import { useParams } from 'react-router-dom';
import RecordStudio from 'src/components/RecordStudio';
import AppScrollbar from 'src/components/Scrollbar';
import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { usePlayerStore } from 'src/store/player';

/** Record your part of a song, to send to a friend (Sing together, "Send a recording"). */
export default function RecordView() {
  const t = useT();
  const { trackId } = useParams();
  const song = usePlayerStore((state) => state.queue.find((track) => track.id === trackId));
  usePageTitle(t('record.title'), song);
  if (!trackId || !song) {
    return <p className="p-8 text-center text-muted-foreground">{t('record.noSong')}</p>;
  }
  const track = { id: song.id, name: song.name, artists: song.artists.map((a) => a.name), cover: song.album?.images?.[0]?.url ?? '' };
  return (
    <AppScrollbar className="h-full">
      <RecordStudio track={track} over={null} />
    </AppScrollbar>
  );
}
