import { useSettingStore } from 'src/store/setting';

/** Current color scheme, for the few places that need a JS value (SVG strokes, canvas, ...). */
export const useThemeMode = () => useSettingStore((state) => state.theme);
