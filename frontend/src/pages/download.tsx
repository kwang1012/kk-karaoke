import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from 'src/hooks/documentTitle';
import { Button } from 'src/components/ui/button';
import Logo from 'src/components/Logo';
import { useT } from 'src/i18n';

/** Always the newest release: scripts/publish-update.sh refreshes this copy on every publish. */
export const MAC_DOWNLOAD_URL = 'https://updates.kkaraoke.app/macos/KKaraoke.dmg';

const isMac = /Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2;

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
        <Button asChild size="lg">
          <a href={MAC_DOWNLOAD_URL} download>
            <Download />
            {t('download.button')}
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">{t('download.requirements')}</p>
        {!isMac && <p className="text-sm text-muted-foreground">{t('download.notMac')}</p>}
        <div className="w-full rounded-lg bg-card p-4 text-left">
          <h2 className="mb-2 font-semibold">{t('download.installTitle')}</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('download.step1')}</li>
            <li>{t('download.step2')}</li>
            <li>{t('download.step3')}</li>
          </ol>
        </div>
        <Link to="/join" className="text-sm text-muted-foreground underline underline-offset-4">
          {t('download.openWeb')}
        </Link>
      </div>
    </div>
  );
}
