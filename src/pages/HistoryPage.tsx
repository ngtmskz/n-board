import { BookOpen, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { currentUser } from '../auth';
import { AccountMenu } from '../components/AccountMenu';
import { AppLogo } from '../components/AppLogo';
import { toast } from '../components/Toast';
import { Totals } from '../components/Totals';
import { appTagline, guideUrl } from '../config';
import { locale, useLang, useT } from '../i18n';
import { createBoard, subscribeHistory } from '../data/boards';
import type { HistoryEntry } from '../types';

function formatDate(entry: HistoryEntry) {
  if (!entry.lastOpenedAt) return '';
  return entry.lastOpenedAt.toDate().toLocaleString(locale(), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 最初に出す件数と、「もっと見る」で足す件数 */
const FIRST_PAGE = 10;
const MORE_PAGE = 20;

/** ボード名の中の、検索した文字を目立たせる（大文字・小文字は区別しない） */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let start = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, start)) {
    if (i > start) parts.push(text.slice(start, i));
    parts.push(<mark key={i}>{text.slice(i, i + q.length)}</mark>);
    start = i + q.length;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}

export function HistoryPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(FIRST_PAGE);

  useEffect(
    () =>
      subscribeHistory(setEntries, (e) => {
        console.error(e);
        setEntries([]);
        toast(t('history.loadFailed'));
      }),
    [],
  );

  const onCreate = async () => {
    setCreating(true);
    try {
      navigate(`/b/${await createBoard()}`);
    } catch (e) {
      console.error(e);
      toast(t('history.createFailed'));
      setCreating(false);
    }
  };

  return (
    <div className="history-page">
      <header className="history-header">
        <AppLogo />
        {/* 初めての人にも見つけてもらえるよう、使い方はメニューの中ではなくヘッダーに出す */}
        <div className="history-header-actions">
          <a className="guide-button" href={guideUrl} target="_blank" rel="noopener" title={t('history.guideTitle')}>
            <BookOpen size={16} />
            <span className="guide-label">{t('history.guide')}</span>
          </a>
          <AccountMenu />
        </div>
      </header>
      <main className="history-main">
        {/* ボードがないときは、真ん中の「ホワイトボードを作る」だけにする（読み込み中も出さず、ちらつかないようにする） */}
        {entries !== null && entries.length > 0 && (
          <div className="history-title-row">
            <h2>{t('history.title')}</h2>
            <label className="history-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder={t('history.search')}
                aria-label={t('history.search')}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(FIRST_PAGE);
                }}
              />
            </label>
            <button className="primary-button" onClick={onCreate} disabled={creating}>
              {t('history.new')}
            </button>
          </div>
        )}
        {entries === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : entries.length === 0 ? (
          // ボードがまだないとき。「ボード」だけでは伝わりにくいので、ここでは「ホワイトボード」と言い切る
          <div className="history-empty">
            <div className="history-empty-art" aria-hidden="true">
              <span className="history-empty-note note-1" />
              <span className="history-empty-note note-2" />
              <span className="history-empty-note note-3" />
            </div>
            <p className="history-empty-catch">{appTagline(lang)}</p>
            <p className="history-empty-lead">{t('login.lead')}</p>
            <button className="primary-button" onClick={onCreate} disabled={creating}>
              {t('history.start')}
            </button>
            <p className="history-empty-note-text">{t('history.emptyNote')}</p>
          </div>
        ) : (
          <HistoryList
            entries={entries}
            query={query.trim()}
            shown={shown}
            onMore={() => setShown((n) => n + MORE_PAGE)}
          />
        )}
      </main>
    </div>
  );
}

/**
 * 参加しているボードの一覧。最後に開いた順に、最初は10件だけ出し、「もっと見る」で20件ずつ足す。
 * 検索は読み込んだ一覧の中で絞り込む（Firestore は部分一致の検索ができないため）。
 */
function HistoryList({
  entries,
  query,
  shown,
  onMore,
}: {
  entries: HistoryEntry[];
  query: string;
  shown: number;
  onMore: () => void;
}) {
  const t = useT();
  const user = currentUser();
  const matched = query ? entries.filter((e) => e.title.toLowerCase().includes(query.toLowerCase())) : entries;
  if (matched.length === 0) {
    return <p className="history-no-match">{t('history.noMatch', { query })}</p>;
  }
  const rest = matched.length - shown;
  return (
    <div className="history-list">
      <ul>
        {matched.slice(0, shown).map((entry) => (
          <li key={entry.boardId}>
            <Link to={`/b/${entry.boardId}`} className="history-item">
              <span className="history-item-title">
                <Highlight text={entry.title} query={query} />
              </span>
              {entry.ownerUid === user.uid && <span className="badge">{t('history.mine')}</span>}
              {/* 最後に開いていたときの数。記録する前に開いたボードには出さない（列の幅はそろえる） */}
              <span className="history-item-totals">
                {entry.stickyCount !== undefined && (
                  <Totals stickyCount={entry.stickyCount} commentCount={entry.commentCount ?? 0} />
                )}
              </span>
              <span className="history-item-date">{formatDate(entry)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button className="history-more" onClick={onMore}>
          {t('history.more', { count: rest })}
        </button>
      )}
    </div>
  );
}
