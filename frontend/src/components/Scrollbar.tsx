import { useMediaQuery, useTheme } from '@mui/material';
import { useRef, useState } from 'react';
import Scrollbar from 'react-scrollbars-custom';

export default function AppScrollbar(props: any) {
  const [hovering, setHovering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
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
      className="h-full"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disableTracksWidthCompensation
      trackYProps={{ style: { background: 'transparent', width: 12, zIndex: 5, visibility: mobile && 'hidden' } }}
      thumbYProps={{ style: { background: hovering ? '#a3a3a3' : 'transparent', width: 8, display: mobile && 'hidden' } }}
      {...props}
    />
  );
}
