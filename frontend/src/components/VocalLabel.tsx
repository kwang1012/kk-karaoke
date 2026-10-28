import type { Lyrics } from 'src/models/spotify';
import { useT } from 'src/i18n';
import { singerColor, startsVocalPart } from 'src/duetLyrics';

export default function VocalLabel({ line, previous }: { line: Lyrics; previous?: Lyrics }) {
  const t = useT();
  const singer = line.singer;
  if ((!singer && line.role !== 'background') || !startsVocalPart(line, previous)) return null;
  const name = singer?.name?.replace(/^男[聲声]$/, '男').replace(/^女[聲声]$/, '女');
  const label = name || (singer?.kind === 'group' ? t('lyrics.together')
    : singer?.kind === 'person' && singer.slot > 0 ? t('lyrics.singer', { number: singer.slot }) : t('lyrics.unassigned'));
  return <span className="mb-1 block text-[length:max(0.3em,0.75rem)] font-semibold tracking-wide" style={{ color: singerColor(singer) }}>
    {line.role === 'background' ? `${label} · ${t('lyrics.background')}` : label}
  </span>;
}
