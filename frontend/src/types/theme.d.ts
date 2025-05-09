import { BreakpointsOptions, PaletteOptions, Theme, ThemeOptions } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface AppTheme extends Theme {
    breakpoints: BreakpointsOptions & {
      values: {
        '2xl': number;
      };
    };
  }
  // allow configuration using `createTheme`
  interface AppThemeOptions extends ThemeOptions {
    breakpoints: BreakpointsOptions & {
      values: {
        '2xl': number;
      };
    };
  }
  export function createTheme(options?: AppThemeOptions): AppTheme;
}
