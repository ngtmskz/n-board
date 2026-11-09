import { useRef } from 'react';
import { splitLinks } from '../lib/links';
import { useBoard } from './store';

/** 押してからこの距離以上動いたら、ドラッグとみなしてリンクを開かない（Canvas の DRAG_THRESHOLD_PX と合わせる） */
const CLICK_MOVE_PX = 3;
/**
 * リンクを開くまでの待ち時間。ダブルクリック（文字の編集）の1回目でページが開いてしまわないよう、
 * 2回目が来なかったときだけ開く。
 */
const OPEN_DELAY_MS = 250;

let pendingOpen: number | undefined;

function Link({ text, href }: { text: string; href: string }) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <a
      className="board-link"
      href={href}
      target="_blank"
      // 開いた先のページから N-Board のタブを操作させず、どのボードから来たかも伝えない
      rel="noopener noreferrer"
      // リンクをドラッグすると URL を運ぶ動きになるので止め、付箋・テキストとして動かす
      draggable={false}
      // 付箋・テキストの選択や移動はそのまま行うので、止めずに位置だけ覚えておく
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        e.preventDefault();
        window.clearTimeout(pendingOpen);
        if (e.detail > 1 || e.shiftKey) return;
        const start = down.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= CLICK_MOVE_PX) return;
        // スタンプ・コメントなどのツールでは、そのツールの操作を優先する
        const tool = useBoard.getState().tool.kind;
        if (tool !== 'select' && tool !== 'hand') return;
        pendingOpen = window.setTimeout(() => window.open(href, '_blank', 'noopener,noreferrer'), OPEN_DELAY_MS);
      }}
    >
      {text}
    </a>
  );
}

/** 付箋・テキストの文字。http・https の URL だけを押せるリンクにする（編集中はふつうの入力欄）。 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) => (p.href ? <Link key={i} text={p.text} href={p.href} /> : p.text))}
    </>
  );
}
