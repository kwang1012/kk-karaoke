import { useEffect, useState } from 'react';
import ReactGA from 'react-ga';
import { useLocation } from 'react-router-dom';

function initialiseAnalytics() {
  ReactGA.initialize(process.env.REACT_APP_ANALYTICS_ID);
}

export function usePageTracking() {
  const location = useLocation();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    initialiseAnalytics();
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      ReactGA.pageview(location.pathname);
    }
  }, [initialized, location]);
}
