import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Button } from 'src/components/ui/button';
import Logo from 'src/components/Logo';
import { useT } from 'src/i18n';

/** Always the newest release: scripts/publish-update.sh refreshes this copy on every publish. */
export const MAC_DOWNLOAD_URL = 'https://updates.kkaraoke.app/macos/KKaraoke.dmg';

export const WINDOWS_DOWNLOAD_URL = 'https://updates.kkaraoke.app/windows/KKaraoke-Setup.exe';

const isMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;
const isWindows = /Win/.test(navigator.platform);

export default function DownloadView() {
  const t = useT();
  usePageTitle(t('download.pageTitle'));
  return (
    <div className="flex min-h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Logo className="size-20" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t('download.title')}</h1>
          <p className="text-muted-foreground">{t('download.subtitle')}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild size="lg" variant={isWindows ? 'outline' : 'default'} className={isWindows ? 'order-2' : ''}>
            <a href={MAC_DOWNLOAD_URL} download>
              <Download />
              {t('download.button')}
            </a>
          </Button>
          <Button asChild size="lg" variant={isWindows ? 'default' : 'outline'}>
            <a href={WINDOWS_DOWNLOAD_URL} download>
              <Download />
              {t('download.buttonWindows')}
            </a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {isWindows ? t('download.requirementsWindows') : t('download.requirements')}
        </p>
        {!isMac && !isWindows && <p className="text-sm text-muted-foreground">{t('download.notMac')}</p>}
        <div className="w-full rounded-lg bg-card p-4 text-left">
          <h2 className="mb-2 font-semibold">{t('download.installTitle')}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{isWindows ? t('download.step1Windows') : t('download.step1')}</li>
            <li>{isWindows ? t('download.step2Windows') : t('download.step2')}</li>
            <li>{isWindows ? t('download.step3Windows') : t('download.step3')}</li>
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('download.signing')}{' '}
          <a href="https://github.com/kwang1012/kk-karaoke#code-signing-policy" className="underline underline-offset-4">
            Code signing policy
          </a>
        </p>
        <Link to="/join" className="text-sm text-muted-foreground underline underline-offset-4">
          {t('download.openWeb')}
        </Link>
      </div>
    </div>
  );
}
