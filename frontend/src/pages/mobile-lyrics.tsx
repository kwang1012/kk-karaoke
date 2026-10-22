import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { useLyricsColors } from 'src/hooks/lyricsColors';
import MobileLyrics from 'src/components/MobileLyrics';
import { useThemeMode } from 'src/hooks/theme';
import MobileAudioController from 'src/components/MobileAudioController';
import { usePlayer } from 'src/store/player';
import LyricsOffset from 'src/components/LyricsOffset';
import { useLyricsOffset } from 'src/hooks/lyricsOffset';
import PitchRoll from 'src/components/PitchRoll';
import SingingButtons from 'src/components/SingingButtons';
import VideoBackdrop from 'src/components/VideoBackdrop';
import { useVideoMode } from 'src/hooks/videoMode';

export default function MobileLyricsView() {
  const { currentTrack } = usePlayer();
  const t = useT();
  usePageTitle(t('nav.lyrics'), currentTrack);
  const { ahead, setAhead, approximate, videoId, disabled } = useLyricsOffset();
  const { showVideo } = useVideoMode();
  const overVideo = showVideo && !!videoId;
  const mode = useThemeMode();
  const image = currentTrack?.album?.images?.[0]?.url;

  const { lyrics: color, background: bgColor } = useLyricsColors(image, mode === 'light');
  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[1fr_auto] items-center justify-center overflow-hidden" style={{ backgroundColor: bgColor }}>
      <div className="relative h-full min-h-0">
        {videoId && <VideoBackdrop videoId={videoId} visible={overVideo} />}
        {!overVideo && (
          <div className="relative h-full">
            <MobileLyrics color={color} bgColor={bgColor} />
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-10 flex gap-2">
          <SingingButtons />
        </div>
        {!disabled && (
          <div className="absolute right-3 bottom-3 z-10">
            <LyricsOffset value={ahead} onChange={setAhead} approximate={approximate} hasVideo={!!videoId} />
          </div>
        )}
      </div>
      <div className="px-6 pb-3">
        <PitchRoll className="mb-3" />
        <MobileAudioController />
      </div>
    </div>
  );
}
