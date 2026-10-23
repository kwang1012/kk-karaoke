import type { TranslationKey } from 'src/i18n';

export interface ChartSource {
  id: string;
  name: string;
  charts: { id: string; name: string }[];
}

const KKBOX: Record<string, TranslationKey> = {
  '297': 'chart.mandarin',
  '390': 'chart.western',
  '308': 'chart.japanese',
  '314': 'chart.korean',
  '304': 'chart.taiwanese',
};
const REGION: Record<string, TranslationKey> = {
  tw: 'chart.region.tw',
  hk: 'chart.region.hk',
  jp: 'chart.region.jp',
  kr: 'chart.region.kr',
  us: 'chart.region.us',
  global: 'chart.region.global',
};

/** What a chart is called and how it is ranked, from its id ("chart:kkbox:297", "chart:ytmusic:tw:trending"). */
export function chartLabels(source: string, id: string): { title: TranslationKey | null; subtitle: TranslationKey } {
  const parts = id.split(':');
  const key = parts[2] ?? '';
  const title = (source === 'kkbox' ? KKBOX[key] : REGION[key]) ?? null;
  const subtitle: TranslationKey =
    source === 'kkbox'
      ? 'chart.daily'
      : source === 'spotify'
        ? 'chart.daily50'
        : source === 'apple'
          ? 'chart.topSongs'
          : parts[parts.length - 1] === 'trending'
            ? 'chart.trending'
            : 'chart.top100';
  return { title, subtitle };
}

/** KKBOX has no glyph to use, so it gets a plain letter. */
export const PROVIDER_LOGO: Record<string, string | null> = {
  kkbox: null,
  spotify: '/brands/spotify.svg',
  apple: '/brands/applemusic.svg',
  ytmusic: '/brands/youtubemusic.svg',
};
export const PROVIDER_COLOR: Record<string, string> = {
  kkbox: '#4088FF',
  spotify: '#1DB954',
  apple: '#FA243C',
  ytmusic: '#FF0000',
};
