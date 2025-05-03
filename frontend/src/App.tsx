import React from 'react';
import PropTypes from 'prop-types';
import 'src/styles/globals.css';
// import 'src/styles/calendar.css';
// import 'src/styles/markdown.css';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store, persistor, RootState } from 'src/store';
import { darkTheme, lightTheme } from 'src/styles/theme';
import { IconDefinition, IconName, IconPrefix, library } from '@fortawesome/fontawesome-svg-core';
// import { fab } from '@fortawesome/free-brands-svg-icons';
// import { fas } from '@fortawesome/free-solid-svg-icons';
// import { PersistGate } from 'redux-persist/integration/react';
import { createTheme } from '@mui/material/styles';
// import NProgress from 'nprogress';
// import 'nprogress/nprogress.css';
import { onBrowserThemeChange } from 'src/store/theme';
import {
  createBrowserRouter,
  Outlet,
  Router,
  Route,
  RouterProvider,
  useNavigate,
  Routes,
  BrowserRouter,
} from 'react-router-dom';
import SingingView from './pages/singing';
import IndexView from './pages';

// NProgress.configure({
//   minimum: 0.3,
//   easing: 'ease',
//   speed: 800,
//   showSpinner: false,
// });

// library.add(fab);
// library.add(fas);

const faSingStyle = {
  prefix: 'fas' as IconPrefix,
  iconName: 'sing' as IconName,
  icon: [
    512,
    512,
    [],
    'e001',
    `M488.413,118.27c0-31.606-12.309-61.323-34.659-83.671C411.664-7.493,345.498-11.175,299.184,23.53l-7.131-7.131
				L268.211,40.24l7.12,7.12c-16.405,21.844-24.698,48.595-23.458,76.141L39.935,351.283l38.815,38.815
				c-18.243,21.376-21.458,35.552-24.34,48.289c-2.975,13.143-5.545,24.493-30.822,49.771L47.429,512
				c32.17-32.171,36.257-50.232,39.865-66.169c2.247-9.924,4.128-18.212,15.358-31.83l34.416,34.416l227.782-211.94
				c1.797,0.081,3.593,0.133,5.382,0.133c25.634,0,50.338-8.262,70.754-23.594l7.124,7.124l23.841-23.841l-7.121-7.121
				C480.132,168.825,488.413,144.186,488.413,118.27z M137.911,401.577L86.773,350.44l182.909-196.581l64.81,64.811L137.911,401.577
				z M366.302,202.793l-80.745-80.745c-0.818-18.069,4.097-35.659,13.96-50.502l117.286,117.287
				C401.963,198.697,384.374,203.609,366.302,202.793z M440.649,164.995L323.369,47.714c32.839-21.755,77.634-18.184,106.543,10.725
				c15.982,15.982,24.783,37.231,24.783,59.83C454.695,135.143,449.785,151.259,440.649,164.995z`,
  ],
} as IconDefinition;

const faSingOffStyle = {
  prefix: 'fas' as IconPrefix,
  iconName: 'sing_off' as IconName,
  icon: [
    512,
    512,
    [],
    'e001',
    `M275.333,47.36c-9.892,13.171-16.809,28.133-20.491,43.971L397.031,233.52c15.834-3.686,30.791-10.614,43.958-20.503
			L275.333,47.36z
    M245.828,130.001L39.935,351.282l38.815,38.815c-18.243,21.376-21.458,35.552-24.34,48.289
    c-2.975,13.143-5.545,24.493-30.822,49.771L47.429,512c32.17-32.17,36.258-50.232,39.866-66.168
    c2.247-9.924,4.127-18.212,15.358-31.83l34.416,34.416l221.283-205.893L245.828,130.001z M213.806,302.997l-28.451-28.451
    l23.841-23.841l28.451,28.451L213.806,302.997z
    M453.753,34.598c-42.089-42.09-108.255-45.773-154.569-11.069l165.649,165.649c15.299-20.354,23.58-44.993,23.578-70.908
			C488.412,86.663,476.103,56.947,453.753,34.598z`,
  ],
} as IconDefinition;

library.add(faSingStyle);
library.add(faSingOffStyle);

function App() {
  const dispatch = useDispatch();
  React.useEffect(() => {
    // theme
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    dispatch(onBrowserThemeChange(darkThemeMq.matches));
    darkThemeMq.addEventListener('change', (e) => {
      dispatch(onBrowserThemeChange(e.matches));
    });
  }, []);

  const theme = useSelector((state: RootState) => state.theme.value);

  const Theme = theme === 'light' ? createTheme(lightTheme) : createTheme(darkTheme);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={Theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<IndexView />} />
            <Route path="/singing" element={<SingingView />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

export default App;
