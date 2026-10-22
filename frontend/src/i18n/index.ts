import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en, type TranslationKey } from './en';
import { zhTW } from './zh-TW';

export type { TranslationKey };
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, 'zh-TW': zhTW };

const detectLanguage = (): Language => (navigator.language.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en');

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'language-storage' }
  )
);

type Params = Record<string, string | number>;

const translate = (language: Language, key: TranslationKey, params?: Params) => {
  const template = dictionaries[language][key] ?? en[key];
  return params ? template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : template;
};

/** Translate outside React (uses the current language, does not re-render). */
export const t = (key: TranslationKey, params?: Params) => translate(useLanguageStore.getState().language, key, params);

/** Translate inside components; re-renders when the language changes. */
export function useT() {
  const language = useLanguageStore((state) => state.language);
  return (key: TranslationKey, params?: Params) => translate(language, key, params);
}
