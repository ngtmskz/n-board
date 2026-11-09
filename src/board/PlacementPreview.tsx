import { create } from 'zustand';
import { currentUser, displayName } from '../auth';
import { Avatar } from '../components/Avatar';
import { STAMP_SIZE, stampImageUrl, STICKY_COLORS, STICKY_SIZE, TEXT_DEFAULT, TEXT_LINE_HEIGHT } from '../constants';
import { useT } from '../i18n';
import { useNextSticky, type ConnectedLook } from './actions';
import type { Rect } from './geometry';
import type { Guide } from './snap';
import { useBoard } from './store';

/**
 * 付箋・スタンプ・セクションを置くときのプレビュー（キャンバス座標）。
 * カーソルの動きのたびにキャンバス全体を描き直さないよう、ボードの状態とは別に持つ。
 */
interface PreviewState {
  /** カーソルの位置。キャンバスの外にあるときは null。 */
  point: { x: number; y: number } | null;
  /** ドラッグ中のセクションの範囲 */
  draft: Rect | null;
  /** スタンプを押す・動かすときに付く先の付箋（光らせる） */
  target: string | null;
  /** ドラッグ中に吸着したときのガイド線 */
  guide: Guide | null;
  /** 範囲選択の枠 */
  marquee: Rect | null;
  /** 付箋の「＋」から矢印を伸ばしている途中。to はカーソルの位置、targetId は離したらつながる先。 */
  connect: {
    fromId: string;
    x: number;
    y: number;
    targetId: string | null;
    /** つながる先がないとき、離すとできるもの（半透明で出す）。画像から伸ばすときやクリックで伸ばすときは null。 */
    ghost: (Rect & { look: ConnectedLook }) | null;
  } | null;
  /** 矢印のツールで、始まりをクリックして先を選んでいる途中か（画面の下の案内を変える） */
  pendingConnect: boolean;
  /** 「矢印」のツールで、押すと矢印を伸ばせるもの（枠を出す） */
  hover: string | null;
}

export const usePreview = create<PreviewState>(() => ({ point: null, draft: null, target: null, guide: null, marquee: null, connect: null, hover: null, pendingConnect: false }));

export function PlacementPreview() {
  const t = useT();
  const tool = useBoard((s) => s.tool);
  const point = usePreview((s) => s.point);
  const draft = usePreview((s) => s.draft);
  const nextSticky = useNextSticky();

  if (tool.kind === 'section') {
    if (!draft) return null;
    return <div className="ghost ghost-section" style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }} />;
  }
  if (!point) return null;

  if (tool.kind === 'sticky') {
    return (
      <div
        className="ghost ghost-sticky"
        style={{
          left: point.x - nextSticky.w / 2,
          top: point.y - STICKY_SIZE / 2,
          width: nextSticky.w,
          height: STICKY_SIZE,
          background: STICKY_COLORS[nextSticky.color],
        }}
      />
    );
  }

  if (tool.kind === 'text') {
    const lineHeight = TEXT_DEFAULT.fontSize * TEXT_LINE_HEIGHT;
    return (
      <div
        className="ghost ghost-text"
        style={{ left: point.x, top: point.y - lineHeight / 2, fontSize: TEXT_DEFAULT.fontSize, lineHeight: TEXT_LINE_HEIGHT }}
      >
        {t('text.placeholder')}
      </div>
    );
  }

  if (tool.kind === 'stamp') {
    const user = currentUser();
    return (
      <div
        className="ghost ghost-stamp stamp"
        style={{ left: point.x - STAMP_SIZE / 2, top: point.y - STAMP_SIZE / 2, width: STAMP_SIZE, height: STAMP_SIZE }}
      >
        {tool.stamp === 'face' ? (
          <Avatar name={displayName(user)} photoURL={user.photoURL} size={STAMP_SIZE} stamp />
        ) : (
          <img className="stamp-image" src={stampImageUrl(tool.stamp)} alt="" draggable={false} />
        )}
      </div>
    );
  }
  return null;
}
