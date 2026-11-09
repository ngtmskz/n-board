import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { appContact, appName, guideUrl, poweredBy, showPoweredBy } from '../config';
import { useT } from '../i18n';

const CC_BY = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const APACHE = { name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' };

const CREDITS = [
  {
    what: 'about.creditStamp' as const,
    by: 'Noto Emoji (Google)',
    url: 'https://github.com/googlefonts/noto-emoji',
    licenses: [APACHE, CC_BY],
    note: 'about.creditStampNote' as const,
  },
  {
    what: 'about.creditSound' as const,
    by: 'OtoLogic',
    url: 'https://otologic.jp/',
    licenses: [CC_BY],
    note: 'about.creditSoundNote' as const,
  },
];

/** 「このサービスについて」。バージョン・使い方と連絡先・素材のクレジット・オープンソースのライセンスを出す。 */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  // Esc で閉じる。開いたら閉じるボタンにフォーカスを移す。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('.dialog-close')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" ref={ref}>
        <button className="icon-button dialog-close" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <X size={18} />
        </button>
        <h2 id="about-title">{appName}</h2>
        <p className="about-lead">{t('about.lead')}</p>
        <p className="about-version">
          {t('about.version', { version: __APP_VERSION__ })}
          {__BUILD_DATE__ ? t('about.build', { date: __BUILD_DATE__ }) : t('about.dev')}
        </p>
        <p className="about-contact">
          <a href={guideUrl} target="_blank" rel="noopener">
            {t('about.guide')}
          </a>
          {appContact && <span>{t('about.contact', { contact: appContact })}</span>}
        </p>

        <h3>{t('about.credits')}</h3>
        <ul className="about-list">
          {CREDITS.map((c) => (
            <li key={c.by}>
              {t(c.what)}:{' '}
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.by}
              </a>
              {' ('}
              {c.licenses.map((l, i) => (
                <span key={l.name}>
                  {i > 0 && ' / '}
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.name}
                  </a>
                </span>
              ))}
              {') '}
              <span className="about-note">{t(c.note)}</span>
            </li>
          ))}
        </ul>

        <h3>{t('about.oss')}</h3>
        <ul className="about-list about-oss">
          {__APP_DEPENDENCIES__.map((d) => (
            <li key={d.name}>
              <span>
                {d.name} <span className="about-note">{d.version}</span>
              </span>
              <span className="about-note">{d.license}</span>
            </li>
          ))}
        </ul>
        <p className="about-note">
          {t('about.licensesBefore')}
          <a href="/licenses.txt" target="_blank" rel="noreferrer">
            {t('about.licensesLink')}
          </a>
          {t('about.licensesAfter')}
        </p>
        {showPoweredBy && (
          <p className="about-note about-powered">
            {t('about.poweredByBefore')}
            <a href={poweredBy.url} target="_blank" rel="noreferrer">
              {poweredBy.name}
            </a>
            {t('about.poweredByAfter', { author: poweredBy.author })}
          </p>
        )}
      </div>
    </div>
  );
}
