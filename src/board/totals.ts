// ボードの付箋とコメントの数（ボード画面の左下と、履歴一覧に出す）
import { useComments } from './comments';
import { mergeObjects, useBoard } from './store';

/**
 * 今ある付箋の数と、それらへのコメントの数。
 * 付箋は文字が入っているものだけ数える（置いただけの空の付箋は意見ではないため）。
 * コメントは空の付箋に付いたものも数え、削除された付箋へのコメントは数えない（付箋と一緒に見えなくなるため）。
 * 付箋の ID を文字列にまとめて取り出し、画面の移動などでは描き直さないようにする。
 */
export function useBoardTotals() {
  const stickyKey = useBoard((s) =>
    Object.values(mergeObjects(s.server, s.created, s.settling, s.overrides))
      .filter((o) => o.type === 'sticky')
      .map((o) => `${o.id}:${o.text.trim() ? 1 : 0}`)
      .sort()
      .join(','),
  );
  const stickies = stickyKey ? stickyKey.split(',').map((k) => k.split(':')) : [];
  const stickyIds = new Set(stickies.map(([id]) => id));
  const commentCount = useComments((s) => s.list.filter((c) => stickyIds.has(c.targetId)).length);
  return { stickyCount: stickies.filter(([, filled]) => filled === '1').length, commentCount };
}
