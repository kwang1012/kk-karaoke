import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettingStore } from 'src/store/setting';

export function useTvMode() {
  const location = useLocation();
  const navigate = useNavigate();
  const enterTv = () => navigate('/tv', {
    state: { tvReturnTo: location.pathname + location.search + location.hash },
  });
  const returnTo = location.state?.tvReturnTo;
  const exitTv = useCallback(async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* Still allow leaving TV mode. */ }
    }
    useSettingStore.getState().setFullScreen(!!document.fullscreenElement);
    navigate(typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') && !/^\/tv(?:[/?#]|$)/.test(returnTo) ? returnTo : '/', { replace: true });
  }, [navigate, returnTo]);
  return { enterTv, exitTv };
}
