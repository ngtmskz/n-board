import { Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { signInWithGoogle, signOutUser, useAuth } from '../auth';
import { AppIcon } from '../components/AppLogo';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { allowedDomains, appName, appTagline } from '../config';
import { useLang, useT } from '../i18n';

export function LoginPage() {
  const user = useAuth((s) => s.user);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 共有されたボードのリンクから来たか（ログインすると、そのままそのボードが開く）
  const fromSharedLink = useLocation().pathname.startsWith('/b/');

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        console.error(e);
        setError(t('login.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">
          <AppIcon size={56} />
        </div>
        <h1>{appName}</h1>
        <p className="login-tagline">{appTagline(lang)}</p>
        <p className="login-lead">{t('login.lead')}</p>
        {user ? (
          <>
            <p className="login-error">
              {t('login.notAllowed', {
                email: user.email ?? '',
                domains: allowedDomains.map((d) => `@${d}`).join(lang === 'ja' ? '、' : ', '),
              })}
            </p>
            <button className="primary-button" onClick={() => signOutUser()}>
              {t('login.otherAccount')}
            </button>
          </>
        ) : (
          <>
            {fromSharedLink && (
              <p className="login-shared">
                <LinkIcon size={16} aria-hidden="true" />
                {/* 意味の切れ目で必ず改行し、言葉の途中で折り返さないようにする（改行するので読点は付けない） */}
                <span>
                  {t('login.sharedLine1')}
                  <br />
                  {t('login.sharedLine2')}
                </span>
              </p>
            )}
            <button className="primary-button large" onClick={login} disabled={busy}>
              {t('login.google')}
            </button>
            <p className="login-note">{t('login.note')}</p>
            {error && <p className="login-error">{error}</p>}
          </>
        )}
      </div>
      {/* ログインする前でも言語を選べるようにする */}
      <LanguageSwitch />
    </div>
  );
}
