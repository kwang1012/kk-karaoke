import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettingStore } from 'src/store/setting';
import { exitFullscreen, isFullscreen } from 'src/lib/fullscreen';

export function useTvMode() {
  const location = useLocation();
  const navigate = useNavigate();
  const enterTv = () => navigate('/tv', {
    state: { tvReturnTo: location.pathname + location.search + location.hash },
  });
  const returnTo = location.state?.tvReturnTo;
  const exitTv = useCallback(async () => {
    await exitFullscreen();
    useSettingStore.getState().setFullScreen(isFullscreen());
    navigate(typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') && !/^\/tv(?:[/?#]|$)/.test(returnTo) ? returnTo : '/', { replace: true });
  }, [navigate, returnTo]);
  return { enterTv, exitTv };
}
