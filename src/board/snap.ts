// 付箋・セクションをきれいに並べるための計算（ドラッグ中の吸着と、「＋」で隣に付箋を足す位置）
import { STICKY_GAP } from '../constants';
import { overlaps, type Rect } from './geometry';

/** 吸着する距離（画面上の px）。これより離れていれば、今までどおり自由に置ける。 */
export const SNAP_DISTANCE_PX = 6;

/** 吸着したときに出すガイド線（キャンバス座標）。axis が 'x' なら縦の線。 */
export interface Guide {
  axis: 'x' | 'y';
  /** 線の位置（縦の線なら x 座標） */
  at: number;
  /** 線の始まりと終わり（縦の線なら y 座標） */
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** 出すガイド線は1本だけ（縦横の両方でそろったときは、より近くで吸い付いた方） */
  guide: Guide | null;
}

/** 左端・中心・右端（または上端・中心・下端） */
function edges(start: number, size: number) {
  return [start, start + size / 2, start + size];
}

interface Match {
  d: number;
  at: number;
  other: Rect;
}

function bestMatch(mine: number[], others: Rect[], pick: (r: Rect) => number[], threshold: number) {
  let best: Match | null = null;
  for (const other of others) {
    for (const a of mine) {
      for (const b of pick(other)) {
        const d = b - a;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: b, other };
      }
    }
  }
  return best;
}

/**
 * rect を、ほかのもの（others）と端や中心がそろう位置に吸着させる。
 * 縦・横それぞれ threshold（キャンバス座標）以内で一番近いものにそろえる。
 */
export function snapRect(rect: Rect, others: Rect[], threshold: number): SnapResult {
  const bx = bestMatch(edges(rect.x, rect.w), others, (r) => edges(r.x, r.w), threshold);
  const by = bestMatch(edges(rect.y, rect.h), others, (r) => edges(r.y, r.h), threshold);
  const dx = bx?.d ?? 0;
  const dy = by?.d ?? 0;
  const snapped = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
  let guide: Guide | null = null;
  if (bx && (!by || Math.abs(bx.d) <= Math.abs(by.d))) {
    guide = {
      axis: 'x',
      at: bx.at,
      from: Math.min(snapped.y, bx.other.y),
      to: Math.max(snapped.y + snapped.h, bx.other.y + bx.other.h),
    };
  } else if (by) {
    guide = {
      axis: 'y',
      at: by.at,
      from: Math.min(snapped.x, by.other.x),
      to: Math.max(snapped.x + snapped.w, by.other.x + by.other.w),
    };
  }
  return { dx, dy, guide };
}

/** 「＋」を押した方向 */
export type Direction = 'up' | 'right' | 'down' | 'left';

const STEP: Record<Direction, [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/**
 * 「＋」で足す付箋の位置。元の付箋から STICKY_GAP あけた隣に置き、
 * そこにほかの付箋・テキストがあれば、同じ方向に空いているところまで進める。
 */
export function nextStickySlot(from: Rect, direction: Direction, obstacles: Rect[]): Rect {
  const [sx, sy] = STEP[direction];
  let slot = { ...from };
  for (let i = 0; i < 100; i++) {
    slot = { ...slot, x: slot.x + sx * (from.w + STICKY_GAP), y: slot.y + sy * (from.h + STICKY_GAP) };
    if (!obstacles.some((o) => overlaps(slot, o))) break;
  }
  return slot;
}
