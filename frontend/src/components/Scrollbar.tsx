import { useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import Scrollbar from 'react-scrollbars-custom';

export default function AppScrollbar({ onScrollTop, ...props }: any) {
  const scrollbarRef = useRef<any>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [hovering, setHovering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    const el = scrollbarRef.current;
    console.log('el', el);

    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
    };

    // el.addEventListener('scroll', handleScroll, { passive: true });

    // return () => {
    //   el.removeEventListener('scroll', handleScroll);
    // };
  }, []);

  // useEffect(() => {
  //   onScrollTop(scrollTop);
  // }, [scrollTop]);

  const onMouseEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHovering(true);
  };
  const onMouseLeave = () => {
    hideTimer.current = setTimeout(() => {
      setHovering(false);
    }, 500);
  };
  return (
    <Scrollbar
      ref={scrollbarRef}
      className="h-full"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disableTracksWidthCompensation
      trackYProps={{ style: { background: 'transparent', width: 12, zIndex: 5, visibility: mobile && 'hidden' } }}
      thumbYProps={{
        style: { background: hovering ? '#a3a3a3' : 'transparent', width: 8, display: mobile && 'hidden' },
      }}
      {...props}
    />
  );
}
