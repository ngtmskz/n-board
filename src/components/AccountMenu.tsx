import { ChevronDown, Info, LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { currentUser, displayName, signOutUser } from '../auth';
import { appContact } from '../config';
import { useT } from '../i18n';
import { AboutDialog } from './AboutDialog';
import { Avatar } from './Avatar';
import { LanguageSwitch } from './LanguageSwitch';

/** 履歴画面の右上のアカウント表示。押すと、アカウントの情報・「このサービスについて」・ログアウト・ご意見の連絡先のメニューが開く。 */
export function AccountMenu() {
  const t = useT();
  const user = currentUser();
  const name = displayName(user);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const closeAbout = useCallback(() => setAbout(false), []);
  const ref = useRef<HTMLDivElement>(null);

  // メニューの外をクリックするか Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('account.label')}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={name} photoURL={user.photoURL} />
        <span className="account-name">{name}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu account-dropdown" role="menu">
          <div className="account-info">
            <div className="account-info-name">{name}</div>
            <div className="account-info-email">{user.email}</div>
          </div>
          <div className="menu-separator" role="separator" />
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAbout(true);
            }}
          >
            <Info size={15} />
            {t('account.about')}
          </button>
          <div className="menu-separator" role="separator" />
          <LanguageSwitch label={t('account.language')} />
          <div className="menu-separator" role="separator" />
          <button className="menu-item" role="menuitem" onClick={() => signOutUser()}>
            <LogOut size={15} />
            {t('account.logout')}
          </button>
          {appContact && (
            <>
              <div className="menu-separator" role="separator" />
              <p className="account-contact">
                {t('account.contactLead')}
                <br />
                {t('account.contact', { contact: appContact })}
              </p>
            </>
          )}
        </div>
      )}
      {about && <AboutDialog onClose={closeAbout} />}
    </div>
  );
}
