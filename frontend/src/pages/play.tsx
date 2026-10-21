import { usePageTitle } from 'src/hooks/documentTitle';
import { useT } from 'src/i18n';
import { useQueue } from 'src/store/player';
import { useEffect, useState } from 'react';
import { useBreakpointDown } from 'src/hooks/media';
import { DEFAULT_BG_COLOR, getAvgRGB } from 'src/utils';
import { useNavigate } from 'react-router-dom';
import MobilePlayer from 'src/components/MobilePlayer';

export default function PlayView() {
  const { currentTrack } = useQueue();
  const t = useT();
  usePageTitle(t('nav.queue'), currentTrack);
  const [color, setColor] = useState<string>(DEFAULT_BG_COLOR);
  const image = currentTrack?.album?.images?.[0]?.url;
  const mobile = useBreakpointDown('md');
  const navigate = useNavigate();

  useEffect(() => {
    if (!image) {
      setColor(DEFAULT_BG_COLOR);
      setThemeColor(DEFAULT_BG_COLOR);
      return;
    }
    getAvgRGB(image)
      .then((data) => {
        setColor(data);
        setThemeColor(data);
      })
      .catch((error) => {
        console.error('Error fetching average RGB:', error);
      });
  }, [image]);

  useEffect(() => {
    if (!mobile) navigate('/', { replace: true });
  }, [mobile]);

  function setThemeColor(color: string) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
  }
  return (
    <div
      className="grid h-full w-full grid-cols-1 grid-rows-[1fr_auto] items-center justify-center overflow-hidden py-3"
      style={{
        backgroundImage: `linear-gradient(to bottom, ${color} 84px, ${color}40, #121212)`,
      }}
    >
      <MobilePlayer color={color} />
    </div>
  );
}
