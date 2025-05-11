import { AppThemeOptions } from '@mui/material';

const baseTheme: AppThemeOptions = {
  spacing: 4,
  typography: {
    fontFamily: '"Open Sans", "Helvetica", "Arial", sans-serif',
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1200,
      '2xl': 1536,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        sx: {
          backgroundColor: 'background.paper',
          '& svg': {
            pointerEvents: 'none',
          },
        },
      },
    },
  },
};

export const lightTheme: AppThemeOptions = {
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: {
      light: '#757ce8',
      main: '#CC3363',
      dark: '#bf2857',
      contrastText: 'white',
    },
    secondary: {
      light: '#ff7961',
      main: '#f44336',
      dark: '#ba000d',
    },
    success: {
      main: '#1ed760',
    },
    background: {
      default: '#f7f6f0',
      paper: 'white',
    },
    text: {
      primary: '#000000',
    },
  },
};

export const darkTheme: AppThemeOptions = {
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#CC3363',
    },
    secondary: {
      light: '#ff7961',
      main: '#f44336',
      dark: '#ba000d',
    },
    success: {
      main: '#1ed760',
    },
    background: {
      default: 'black',
      paper: '#121212',
    },
    text: {
      primary: '#ffffff',
    },
  },
};
