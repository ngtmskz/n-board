import { Check, Copy, Link2, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentUser } from '../auth';
import { Avatar } from '../components/Avatar';
import { toast } from '../components/Toast';
import { isAllowedEmail } from '../config';
import { PRESENCE_TIMEOUT_MS } from '../constants';
import { updateSharing } from '../data/boards';
import { loadDirectory } from '../data/users';
import { useT } from '../i18n';
import { inviteTarget } from '../lib/inviteTarget';
import { MAX_BOARD_MEMBERS, type Board, type Presence, type UserProfile, type Visibility } from '../types';

/** 候補に出す人数 */
const MAX_SUGGESTIONS = 6;

/**
 * 右上の「共有」ボタンと、共有の設定のパネル。
 * 共有範囲（リンクを知っている組織のメンバー／招待した人だけ）と招待した人を、作成者だけが変えられる。
 * ほかの参加者は設定を見るだけで、リンクのコピーは誰でもできる。
 */
export function ShareButton({ board, people }: { board: Board; people: Presence[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // パネルの外をクリックするか Esc で閉じる（確認のダイアログを開いている間は閉じない）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!ref.current?.contains(target) && !target.closest('.dialog-backdrop')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.dialog-backdrop') && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="share-menu" ref={ref}>
      <button
        className="primary-button small"
        title={t('share.buttonTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t('board.share')}
      </button>
      {open && <SharePanel board={board} people={people} />}
    </div>
  );
}

function SharePanel({ board, people }: { board: Board; people: Presence[] }) {
  const t = useT();
  const me = currentUser();
  const isOwner = board.ownerUid === me.uid;
  const members = board.memberEmails ?? [];
  const [directory, setDirectory] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string[] | null>(null);

  // 招待の候補（N-Board にログインしたことがある人）。名前の表示にも使う。
  useEffect(() => {
    loadDirectory()
      .then(setDirectory)
      .catch((e) => console.error(e));
  }, []);
  const byEmail = useMemo(() => new Map(directory.map((p) => [p.email, p])), [directory]);
  const byUid = useMemo(() => new Map(directory.map((p) => [p.uid, p])), [directory]);
  const ownerEmail = byUid.get(board.ownerUid)?.email ?? (isOwner ? (me.email ?? '').toLowerCase() : '');

  const save = async (visibility: Visibility, memberEmails: string[]) => {
    try {
      await updateSharing(board.id, visibility, memberEmails);
    } catch (e) {
      console.error(e);
      toast(t('share.saveFailed'));
    }
  };

  // 「招待した人だけ」に切り替える。いま参加中で、まだ招待していない人がいれば、招待するかたずねる。
  const chooseInvited = () => {
    const now = Date.now();
    const uninvited = people
      .filter((p) => p.uid !== board.ownerUid && (!p.lastSeen || now - p.lastSeen.toMillis() < PRESENCE_TIMEOUT_MS))
      .map((p) => byUid.get(p.uid)?.email)
      .filter((e): e is string => !!e && !members.includes(e));
    if (uninvited.length === 0) save('invited', members);
    else setConfirming([...new Set(uninvited)]);
  };

  const invite = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!email) return setError(t('share.errorEmpty'));
    if (!isAllowedEmail(email)) return setError(t('share.errorDomain'));
    if (email === ownerEmail || members.includes(email)) return setError(t('share.errorAlready'));
    if (members.length >= MAX_BOARD_MEMBERS) return setError(t('share.errorLimit', { count: MAX_BOARD_MEMBERS }));
    setError('');
    setQuery('');
    save(board.visibility, [...members, email]);
  };

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return directory
      .filter((p) => p.email !== ownerEmail && !members.includes(p.email))
      .filter((p) => p.name.toLowerCase().includes(q) || p.email.includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [query, directory, members, ownerEmail]);

  const copyLink = () => {
    navigator.clipboard
      .writeText(`${location.origin}/b/${board.id}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast(t('board.copyFailed')));
  };

  const options: { value: Visibility; icon: typeof Link2; label: string; note: string }[] = [
    { value: 'link', icon: Link2, label: t('share.link'), note: t('share.linkNote') },
    { value: 'invited', icon: Lock, label: t('share.invited'), note: t('share.invitedNote') },
  ];

  return (
    <div className="share-panel" role="dialog" aria-label={t('share.title')}>
      <h3 className="share-title">{t('share.title')}</h3>

      {isOwner ? (
        <div className="share-options" role="radiogroup" aria-label={t('share.scope')}>
          {options.map(({ value, icon: Icon, label, note }) => (
            <button
              key={value}
              className={`share-option${board.visibility === value ? ' active' : ''}`}
              role="radio"
              aria-checked={board.visibility === value}
              onClick={() => {
                if (value === board.visibility) return;
                if (value === 'invited') chooseInvited();
                else save('link', members);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>
                <span className="share-option-label">{label}</span>
                <span className="share-option-note">{note}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="share-option active readonly">
          {board.visibility === 'invited' ? <Lock size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
          <span>
            <span className="share-option-label">{board.visibility === 'invited' ? t('share.invited') : t('share.link')}</span>
            <span className="share-option-note">{t('share.ownerOnly')}</span>
          </span>
        </div>
      )}

      {board.visibility === 'invited' && (
        <>
          {isOwner && (
            <div className="share-invite">
              <form
                className="share-invite-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  invite(inviteTarget(query, suggestions));
                }}
              >
                <input
                  type="text"
                  value={query}
                  placeholder={t('share.placeholder')}
                  aria-label={t('share.inviteLabel')}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setError('');
                  }}
                />
                <button type="submit" className="primary-button small">
                  {t('share.invite')}
                </button>
              </form>
              {error && <p className="share-error">{error}</p>}
              {suggestions.length > 0 && (
                <ul className="share-suggestions">
                  {suggestions.map((p) => (
                    <li key={p.uid}>
                      <button onClick={() => invite(p.email)}>
                        <Avatar name={p.name} photoURL={p.photoURL} size={24} />
                        <span className="share-person">
                          <span className="share-person-name">{p.name}</span>
                          <span className="share-person-email">{p.email}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="share-label">{t('share.membersTitle', { count: members.length + 1 })}</p>
          <ul className="share-members">
            <MemberRow
              profile={byUid.get(board.ownerUid)}
              email={ownerEmail || board.ownerName}
              fallbackName={board.ownerName}
              tag={t('share.owner')}
            />
            {members.map((email) => (
              <MemberRow
                key={email}
                profile={byEmail.get(email)}
                email={email}
                onRemove={isOwner ? () => save(board.visibility, members.filter((m) => m !== email)) : undefined}
                removeLabel={t('share.remove', { email })}
              />
            ))}
          </ul>
        </>
      )}

      <button className="share-copy" onClick={copyLink}>
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copied ? t('board.shareCopied') : t('share.copyLink')}
      </button>
      {board.visibility === 'invited' && (
        <p className="share-note">
          {t('share.linkHint')}
          {/* 招待できるのは作成者だけだと、作成者にも参加者にも分かるようにする */}
          <br />
          {t('share.inviteOwnerOnly')}
        </p>
      )}

      {confirming && (
        <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setConfirming(null)}>
          <div className="dialog share-confirm" role="alertdialog" aria-modal="true" aria-labelledby="share-confirm-title">
            <h2 id="share-confirm-title">{t('share.confirmTitle')}</h2>
            <p>{t('share.confirmBody', { count: confirming.length })}</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setConfirming(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setConfirming(null);
                  save('invited', members);
                }}
              >
                {t('share.confirmNo')}
              </button>
              <button
                className="primary-button"
                autoFocus
                onClick={() => {
                  const next = [...members, ...confirming].slice(0, MAX_BOARD_MEMBERS);
                  setConfirming(null);
                  save('invited', next);
                }}
              >
                {t('share.confirmYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  profile,
  email,
  fallbackName,
  tag,
  onRemove,
  removeLabel,
}: {
  profile: UserProfile | undefined;
  email: string;
  fallbackName?: string;
  tag?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const name = profile?.name ?? fallbackName ?? email;
  return (
    <li className="share-member">
      <Avatar name={name} photoURL={profile?.photoURL ?? null} size={24} />
      <span className="share-person">
        <span className="share-person-name">{profile?.name ?? fallbackName ?? email}</span>
        {(profile || fallbackName) && <span className="share-person-email">{email}</span>}
      </span>
      {tag && <span className="share-tag">{tag}</span>}
      {onRemove && (
        <button className="icon-button share-remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
          <X size={14} />
        </button>
      )}
    </li>
  );
}
