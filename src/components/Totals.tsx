import { MessageSquare } from 'lucide-react';
import { useT } from '../i18n';

/** 数字の表示。1000以上は「999+」にする（正確な数はマウスを乗せると出る）。幅は styles.css でそろえる */
function short(n: number) {
  return n > 999 ? '999+' : String(n);
}

/** 付箋とコメントの数（アイコン＋数字）。履歴一覧とボード画面の左下で使う。 */
export function Totals({ stickyCount, commentCount }: { stickyCount: number; commentCount: number }) {
  const t = useT();
  return (
    <span className="totals">
      <span className="totals-item" title={t('board.stickies', { count: stickyCount })} aria-label={t('board.stickies', { count: stickyCount })}>
        <span className="totals-sticky" aria-hidden="true" />
        <span className="totals-number">{short(stickyCount)}</span>
      </span>
      <span className="totals-item" title={t('board.comments', { count: commentCount })} aria-label={t('board.comments', { count: commentCount })}>
        <MessageSquare size={14} aria-hidden="true" />
        <span className="totals-number">{short(commentCount)}</span>
      </span>
    </span>
  );
}
