import { BreakpointsOptions, PaletteOptions, Theme, ThemeOptions } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface AppTheme extends Theme {
    breakpoints: BreakpointsOptions & {
      values: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        '2xl': number;
      };
    };
    palette: PaletteOptions & {
      accent: PaletteColorOptions;
      tiffany: PaletteColorOptions;
      shadow: string;
      card: {
        background: string;
        shadow: string;
      };
      footer: {
        text: string;
      };
    };
  }
  // allow configuration using `createTheme`
  interface AppThemeOptions extends ThemeOptions {
    breakpoints: BreakpointsOptions & {
      values: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        '2xl': number;
      };
    };
    palette: PaletteOptions & {
      accent: PaletteColorOptions;
      tiffany: PaletteColorOptions;
      shadow: string;
      card: {
        background: string;
        shadow: string;
      };
      footer: {
        text: string;
      };
    };
  }
  export function createTheme(options?: AppThemeOptions): AppTheme;
}
