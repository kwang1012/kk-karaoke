import { useEffect } from 'react';
import type { Track } from 'src/models/spotify';

/** Keep the tab title current, and clear page-specific titles when leaving. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'KKaraoke';
    };
  }, [title]);
}

/** A consistent title for static pages, collections, and the song currently shown. */
export function usePageTitle(page: string, subject?: string | Pick<Track, 'name' | 'artists'> | null) {
  const detail = typeof subject === 'string' ? subject : subject
    ? [subject.name, subject.artists.map((artist) => artist.name).filter(Boolean).join(', ')].filter(Boolean).join(' — ')
    : '';
  useDocumentTitle([detail, page, 'KKaraoke'].filter(Boolean).join(' - '));
}
