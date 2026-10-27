import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Globe, Keyboard, Mic2, Monitor, Music2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Button } from 'src/components/ui/button';
import Logo from 'src/components/Logo';
import { LANGUAGES, useLanguageStore, useT, type Language } from 'src/i18n';
import { cn } from 'src/lib/utils';

/** Always the newest release: scripts/publish-update.sh refreshes this copy on every publish. */
export const MAC_DOWNLOAD_URL = 'https://updates.kkaraoke.app/macos/KKaraoke.dmg';
export const WINDOWS_DOWNLOAD_URL = 'https://updates.kkaraoke.app/windows/KKaraoke-Setup.exe';

const isMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;
const isWindows = /Win/.test(navigator.platform);
type Platform = 'mac' | 'windows';

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  return platform === 'mac' ? (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.1 12.5c0-2 1.6-3 1.7-3.1-1-1.5-2.6-1.7-3.1-1.7-1.3-.2-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1.1 2.6-2.2.9-1.2 1.2-2.4 1.2-2.4-.1 0-2.1-.8-2.1-4ZM15 6.3c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="m3 5 8-1.1v7.3H3V5Zm9-1.2L22 2.4v8.8H12V3.8ZM3 12.2h8v7.3L3 18.4v-6.2Zm9 0h10V21l-10-1.4v-7.4Z" />
    </svg>
  );
}

export default function DownloadView() {
  const t = useT();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [platform, setPlatform] = useState<Platform>(isWindows ? 'windows' : 'mac');
  const windows = platform === 'windows';
  const recommended = windows ? isWindows : isMac;
  const steps = windows
    ? [t('download.step1Windows'), t('download.step2Windows'), t('download.step3Windows')]
    : [t('download.step1'), t('download.step2'), t('download.step3')];
  usePageTitle(t('download.pageTitle'));

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="relative isolate flex min-h-full flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[650px] bg-[radial-gradient(ellipse_at_25%_35%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_65%)]" />
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
          <Link to="/join" className="flex items-center gap-2.5 rounded-md text-lg font-bold tracking-tight">
            <Logo className="size-9" />
            KKaraoke
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Globe aria-hidden="true" className="size-4 shrink-0" />
              <select aria-label={t('download.language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="min-w-0 cursor-pointer rounded-sm bg-background py-1 text-foreground">
                {LANGUAGES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <Link to="/join" className="hidden items-center gap-2 rounded-sm text-sm font-medium transition-colors hover:text-primary sm:inline-flex">
              {t('download.openWeb')} <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-12 pt-8 sm:px-10 sm:pt-14 lg:pt-16">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-20">
            <section className="pt-2 lg:pt-7" aria-labelledby="download-heading">
              <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t('download.eyebrow')}
              </p>
              <h1 id="download-heading" className="max-w-lg text-5xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
                {t('download.headline')}<br />
                <span className="text-primary">{t('download.headlineAccent')}</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">{t('download.subtitle')}</p>

              <div aria-hidden="true" className="relative mt-10 hidden h-28 max-w-md items-center sm:flex overflow-hidden rounded-2xl border border-primary/10 bg-card/50 p-5">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--primary)_7%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_7%,transparent)_1px,transparent_1px)] bg-size-[28px_28px]" />
                <Logo className="relative size-16 shrink-0 -rotate-6 shadow-lg shadow-primary/15" />
                <div className="relative ml-7 flex flex-1 items-center gap-1.5">
                  {[22, 35, 20, 44, 58, 38, 24, 46, 64, 42, 28, 50, 34, 20, 36, 54, 30, 18, 40, 26].map((height, index) => (
                    <span key={index} className={cn('min-w-1 flex-1 rounded-full bg-primary', index > 10 ? 'opacity-20' : 'opacity-65')} style={{ height }} />
                  ))}
                </div>
              </div>
              <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground sm:mt-4">
                <Monitor aria-hidden="true" className="size-3.5" />{t('download.title')}
              </p>
            </section>

            <section className="rounded-3xl border bg-card p-6 shadow-[0_16px_60px_-24px_color-mix(in_oklab,var(--foreground)_20%,transparent)] sm:p-8" aria-labelledby="platform-heading">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                <h2 id="platform-heading" className="text-lg font-semibold">{t('download.choosePlatform')}</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{t('download.desktopApp')}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1.5" role="group" aria-label={t('download.choosePlatform')}>
                {(['mac', 'windows'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)} className={cn('flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors', platform === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/50 hover:text-foreground')}>
                    <PlatformIcon platform={value} className="size-5" />{value === 'mac' ? 'macOS' : 'Windows'}
                  </button>
                ))}
              </div>

              <div className="pb-7 pt-7" aria-live="polite" aria-atomic="true">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-semibold tracking-tight">KKaraoke <span className="font-normal text-muted-foreground">{windows ? 'Windows' : 'macOS'}</span></h3>
                  {recommended && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"><Check aria-hidden="true" className="size-3" />{t('download.forDevice')}</span>}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{windows ? t('download.requirementsWindows') : t('download.requirements')}</p>
                <Button asChild size="lg" className="mt-6 h-12 w-full rounded-xl text-sm shadow-sm">
                  <a href={windows ? WINDOWS_DOWNLOAD_URL : MAC_DOWNLOAD_URL} download>
                    <ArrowDownToLine aria-hidden="true" className="size-4" />
                    {windows ? t('download.buttonWindows') : t('download.button')}
                  </a>
                </Button>
                <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">{windows ? 'KKaraoke-Setup.exe' : 'KKaraoke.dmg'}</p>
              </div>

              <div className="border-t pt-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('download.installTitle')}</h3>
                <ol className="space-y-4">
                  {steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-3 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          </div>

          <section className="mt-14 grid gap-7 border-t pt-8 sm:grid-cols-3 sm:gap-8 lg:mt-16" aria-label={t('download.features')}>
            {[
              { Icon: Music2, title: t('download.libraryTitle'), description: t('download.libraryDescription') },
              { Icon: Mic2, title: t('download.micTitle'), description: t('download.micDescription') },
              { Icon: Keyboard, title: t('download.keysTitle'), description: t('download.keysDescription') },
            ].map(({ Icon, title, description }) => (
              <div key={title} className="flex gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card"><Icon aria-hidden="true" className="size-4 text-primary" /></div>
                <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div>
              </div>
            ))}
          </section>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl bg-muted/60 px-5 py-5 sm:flex-row sm:px-6">
            <div className="text-center sm:text-left">
              <p className="text-sm font-medium">{t('download.browserTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{!isMac && !isWindows ? t('download.notMac') : t('download.browserDescription')}</p>
            </div>
            <Button asChild variant="outline" className="shrink-0 rounded-lg"><Link to="/join">{t('download.openWeb')}<ArrowRight aria-hidden="true" className="size-4" /></Link></Button>
          </div>
        </main>

        <footer className="mx-auto w-full max-w-6xl px-6 pb-7 sm:px-10">
          <div className="flex flex-col justify-between gap-3 border-t pt-5 text-[11px] leading-relaxed text-muted-foreground sm:flex-row sm:gap-10">
            <p className="max-w-2xl">{t('download.signing')}</p>
            <a href="https://github.com/kwang1012/kk-karaoke#code-signing-policy" className="shrink-0 self-start rounded-sm underline underline-offset-4 transition-colors hover:text-foreground">{t('download.signingPolicy')} ↗</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
