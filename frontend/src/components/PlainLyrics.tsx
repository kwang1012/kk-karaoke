import { useT } from 'src/i18n';

/** Words without timing: nothing to highlight or seek to, so just show them. */
export default function PlainLyrics({ text, className }: { text: string; className?: string }) {
  const t = useT();
  return (
    <div className={className}>
      <p className="mb-6 text-sm font-medium opacity-70">{t('lyrics.unsynced')}</p>
      <p className="whitespace-pre-line leading-relaxed font-bold">{text}</p>
    </div>
  );
}
