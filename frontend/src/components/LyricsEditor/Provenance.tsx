import { AudioLines, Check, CircleAlert, CircleHelp, Clock, Mic, PenLine, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useT, type TranslationKey } from 'src/i18n';
import type { LyricsInfo } from './info';

function Chip({ tone, icon, children }: { tone: 'good' | 'warn' | 'muted'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5',
        tone === 'good' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        tone === 'muted' && 'text-muted-foreground'
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const SOURCES = ['ytmusic', 'lrclib', 'netease', 'whisper', 'aligned'];

/** Where the lyrics came from and how far to trust them, in a line of chips, with notes below. */
export default function Provenance({ info, dirty, untimedOnly }: { info: LyricsInfo; dirty: boolean; untimedOnly: boolean }) {
  const t = useT();
  const source = info.source && SOURCES.includes(info.source) ? t(`editor.source.${info.source}` as TranslationKey) : info.source ? t('editor.source.unknown') : null;
  const confidence = info.confidence;
  const check = info.audioCheck;
  const whisper = info.source === 'whisper';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {untimedOnly ? (
          <Chip tone="warn" icon={<Clock />}>{t('editor.confidence.unsynced')}</Chip>
        ) : confidence ? (
          <Chip tone={confidence === 'approximate' || confidence === 'unsynced' ? 'warn' : 'good'} icon={confidence === 'verified' ? <Check /> : <Sparkles />}>
            {t(`editor.confidence.${confidence}` as TranslationKey)}
          </Chip>
        ) : (
          <Chip tone="muted" icon={<CircleAlert />}>{t('editor.confidence.none')}</Chip>
        )}
        {source && <Chip tone="muted" icon={whisper ? <Mic /> : <Sparkles />}>{source}</Chip>}
        {check && check.status !== 'inconclusive' && !whisper && (
          <Chip tone={check.status === 'mismatch' ? 'warn' : 'good'} icon={check.status === 'mismatch' ? <TriangleAlert /> : <Check />}>
            {check.status === 'corrected'
              ? t('editor.audio.corrected', { offset: `${check.offsetS > 0 ? '+' : ''}${check.offsetS.toFixed(1)}` })
              : t(`editor.audio.${check.status}` as TranslationKey)}
          </Chip>
        )}
        {info.hasWords && (!info.edited || info.wordSource === 'aligned') && (
          <Chip tone="good" icon={<Sparkles />}>
            {t('editor.words', { source: info.wordSource && SOURCES.includes(info.wordSource) ? t(`editor.source.${info.wordSource}` as TranslationKey) : '' })}
          </Chip>
        )}
        {info.aligned && (
          <Chip tone="good" icon={<AudioLines />}>
            {t('editor.alignedBy', { percent: Math.round((info.aligned.score ?? 0) * 100) })}
          </Chip>
        )}
        {!!info.aligned?.guessed && (
          <Chip tone="warn" icon={<CircleHelp />}>{t('editor.guessedLines', { count: info.aligned.guessed })}</Chip>
        )}
        {info.edited && <Chip tone="muted" icon={<PenLine />}>{t('editor.editedByYou')}</Chip>}
      </div>
      {(whisper || info.notes.length > 0 || (info.hasWords && !info.edited && info.wordSource !== 'aligned' && dirty)) && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {whisper && <li>{t('editor.whisperNote')}</li>}
          {info.notes.filter((n) => !whisper || !n.startsWith('No provider')).map((n) => <li key={n}>{n}</li>)}
          {info.hasWords && !info.edited && info.wordSource !== 'aligned' && dirty && <li className="text-amber-700 dark:text-amber-400">{t('editor.wordsLost')}</li>}
        </ul>
      )}
    </div>
  );
}
