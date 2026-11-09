import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { useT, type MessageKey } from '../i18n';
import type { StickyObject } from '../types';
import { addStickyNextTo } from './actions';
import { beginConnect } from './connectDrag';
import { FIT_MARGIN } from './Canvas';
import { usePreview } from './PlacementPreview';
import type { Direction } from './snap';
import { getObjects, useBoard } from './store';

/** ガイド線の太さ（画面上の px）。拡大・縮小しても同じ太さで出す。 */
const GUIDE_WIDTH = 2;
/** 「＋」ボタンの中心と付箋の縁の距離（画面上の px） */
const ADD_BUTTON_OFFSET = 22;

/** ドラッグ中に吸着したときのガイド線（1本だけ）。画面の座標で描くので、画像の書き出しには写らない。 */
export function SnapGuide() {
  const guide = usePreview((s) => s.guide);
  const v = useBoard((s) => s.viewport);
  if (!guide) return null;
  const at = guide.at * v.zoom + (guide.axis === 'x' ? v.offsetX : v.offsetY) - GUIDE_WIDTH / 2;
  const from = guide.from * v.zoom + (guide.axis === 'x' ? v.offsetY : v.offsetX);
  const length = (guide.to - guide.from) * v.zoom;
  return (
    <div
      className={`snap-guide snap-guide-${guide.axis}`}
      style={
        guide.axis === 'x'
          ? { left: at, top: from, width: GUIDE_WIDTH, height: length }
          : { left: from, top: at, width: length, height: GUIDE_WIDTH }
      }
    />
  );
}

/** 画面の外にできた付箋が見えるよう、必要な分だけキャンバスを動かす */
export function reveal(id: string) {
  const o = getObjects()[id];
  if (!o || o.type === 'stamp' || o.type === 'connector') return;
  useBoard.setState(({ viewport: v }) => {
    const left = o.x * v.zoom + v.offsetX;
    const top = o.y * v.zoom + v.offsetY;
    const right = left + o.w * v.zoom;
    const bottom = top + o.h * v.zoom;
    // はみ出している分だけ動かす（min, max は見えていてほしい範囲）
    const shift = (start: number, end: number, min: number, max: number) =>
      start < min ? min - start : end > max ? max - end : 0;
    const dx = shift(left, right, FIT_MARGIN.left, window.innerWidth - FIT_MARGIN.right);
    const dy = shift(top, bottom, FIT_MARGIN.top, window.innerHeight - FIT_MARGIN.bottom);
    return dx || dy ? { viewport: { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy } } : {};
  });
}

/** 範囲選択の枠。画面の座標で描く。 */
export function SelectionMarquee() {
  const marquee = usePreview((s) => s.marquee);
  const v = useBoard((s) => s.viewport);
  if (!marquee) return null;
  return (
    <div
      className="selection-marquee"
      style={{
        left: marquee.x * v.zoom + v.offsetX,
        top: marquee.y * v.zoom + v.offsetY,
        width: marquee.w * v.zoom,
        height: marquee.h * v.zoom,
      }}
    />
  );
}

const BUTTONS: { direction: Direction; dx: number; dy: number; label: MessageKey }[] = [
  { direction: 'up', dx: 0, dy: -1, label: 'sticky.addUp' },
  { direction: 'right', dx: 1, dy: 0, label: 'sticky.addRight' },
  { direction: 'down', dx: 0, dy: 1, label: 'sticky.addDown' },
  { direction: 'left', dx: -1, dy: 0, label: 'sticky.addLeft' },
];

/**
 * 選んでいる付箋の上下左右に出す「＋」。
 * 押すと同じ色の付箋が隣にでき、すぐ文字を入れられる。
 * ドラッグすると矢印が伸び、ほかの付箋などの上で離すとつながる。何もないところで離すと、そこに付箋を作ってつなぐ。
 */
export function AddNextButtons({
  sticky,
  toCanvas,
}: {
  sticky: StickyObject;
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
}) {
  const t = useT();
  const v = useBoard((s) => s.viewport);
  // ドラッグして矢印を引いたあとの click では、付箋を足さない
  const dragged = useRef(false);
  // 矢印を伸ばしている間は、伸ばし始めの矢印に重ならないよう「＋」を隠す
  const connecting = usePreview((s) => s.connect !== null);

  if (connecting) return null;
  const cx = (sticky.x + sticky.w / 2) * v.zoom + v.offsetX;
  const cy = (sticky.y + sticky.h / 2) * v.zoom + v.offsetY;
  return (
    <>
      {BUTTONS.map((b) => (
        <button
          key={b.direction}
          className="add-next-button"
          title={t(b.label)}
          aria-label={t(b.label)}
          style={{
            left: cx + b.dx * ((sticky.w / 2) * v.zoom + ADD_BUTTON_OFFSET),
            top: cy + b.dy * ((sticky.h / 2) * v.zoom + ADD_BUTTON_OFFSET),
          }}
          // キャンバスの「何もないところを押した」扱い（選択の解除・移動）にしない
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.button !== 0) return;
            dragged.current = false;
            beginConnect(sticky.id, e, toCanvas, {
              onEnd: (d) => {
                dragged.current = d;
              },
            });
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            const id = addStickyNextTo(sticky.id, b.direction);
            if (id) reveal(id);
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      ))}
    </>
  );
}
