import { PaletteOptions, Theme, ThemeOptions } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface AppTheme extends Theme {
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
