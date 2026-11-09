import { STAMP_SIZE } from '../constants';
import type { BoardObject, BoxObject, ConnectorObject, ImageObject, SectionObject, StampObject, StickyObject, TextObject } from '../types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function contains(rect: Rect, px: number, py: number) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/** 付箋の中心を含むセクションのうち一番手前のもの。セクション所属の判定に使う。 */
export function findParentSection(sticky: Rect, sections: SectionObject[]): SectionObject | null {
  const cx = sticky.x + sticky.w / 2;
  const cy = sticky.y + sticky.h / 2;
  let best: SectionObject | null = null;
  for (const s of sections) {
    if (contains(s, cx, cy) && (!best || s.z > best.z)) best = s;
  }
  return best;
}

/** スタンプが付箋に付く範囲：付箋の縁からこの距離までは、少し外にはみ出していても付く */
export const STAMP_ATTACH_MARGIN = 16;

/** 点から長方形までの距離（中にあれば 0） */
function distanceToRect(r: Rect, px: number, py: number) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * スタンプを押す先（スタンプの中心の位置で決める）。
 * 1. 付箋の上なら、その付箋（重なっていれば一番手前）
 * 2. 付箋の縁から STAMP_ATTACH_MARGIN 以内なら、一番近い付箋
 * 3. どちらでもなければセクション、それもなければボード（null）
 */
export function findStampTarget(
  px: number,
  py: number,
  stickies: StickyObject[],
  sections: SectionObject[],
): StickyObject | SectionObject | null {
  const inside = stickies.filter((s) => contains(s, px, py)).sort((a, b) => b.z - a.z)[0];
  if (inside) return inside;
  let near: StickyObject | null = null;
  let nearest = STAMP_ATTACH_MARGIN;
  for (const s of stickies) {
    const d = distanceToRect(s, px, py);
    if (d <= nearest) {
      near = s;
      nearest = d;
    }
  }
  if (near) return near;
  return sections.filter((o) => contains(o, px, py)).sort((a, b) => b.z - a.z)[0] ?? null;
}

/** 2つの長方形が重なっているか */
export function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(inner: Rect, outer: Rect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/**
 * 範囲選択の枠で選ぶもの。付箋・テキスト・スタンプは枠に少しでもかかれば選び、
 * セクションは全体が枠に入ったときだけ選ぶ（中の付箋を選びたいだけなのに、毎回セクションまで選ばれないように）。
 * 付け先も選ばれるスタンプは選ばない（付け先と一緒に動くうえ、付箋だけを選んだときに色を変えられるように）。
 */
export function marqueeHits(rect: Rect, objects: Record<string, BoardObject>): string[] {
  const hits = new Set<string>();
  for (const o of Object.values(objects)) {
    if (isBox(o) && (o.type === 'section' ? inside(o, rect) : overlaps(o, rect))) hits.add(o.id);
  }
  // 矢印は、両端がどちらも選ばれたときに選ぶ（一緒にコピー・削除できるように）
  for (const o of Object.values(objects)) {
    if (o.type === 'connector' && hits.has(o.fromId) && hits.has(o.toId)) hits.add(o.id);
  }
  for (const o of Object.values(objects)) {
    if (o.type !== 'stamp' || (o.targetId && hits.has(o.targetId))) continue;
    const p = stampPosition(o, objects);
    if (p && overlaps({ x: p.x, y: p.y, w: STAMP_SIZE, h: STAMP_SIZE }, rect)) hits.add(o.id);
  }
  return [...hits];
}

/** スタンプのキャンバス上の絶対位置。押した先が消えている場合は null。 */
export function stampPosition(stamp: StampObject, objects: Record<string, BoardObject>) {
  if (!stamp.targetId) return { x: stamp.x, y: stamp.y };
  const target = objects[stamp.targetId];
  if (!target || target.type === 'stamp') return null;
  return { x: target.x + stamp.x, y: target.y + stamp.y };
}

/** 位置と大きさを持つもの（矢印でつなげるもの） */
export function isBox(o: BoardObject): o is BoxObject {
  return o.type === 'sticky' || o.type === 'section' || o.type === 'text' || o.type === 'image';
}

/** 矢印の端と、つないだものの縁との隙間 */
export const CONNECTOR_GAP = 6;

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** r の中心から (tx, ty) へ向かう線が、r の縁から gap だけ外に出たところ */
function edgePoint(r: Rect, tx: number, ty: number, gap: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (r.w / 2 + gap) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (r.h / 2 + gap) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * a から b への矢印の線。中心どうしを結び、それぞれの縁で止める（大きさ 0 の b は点として扱う）。
 * 2つが重なっていて線が引けないときは null。
 */
export function lineBetween(a: Rect, b: Rect): Line | null {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p1 = edgePoint(a, bc.x, bc.y, CONNECTOR_GAP);
  const p2 = b.w === 0 && b.h === 0 ? bc : edgePoint(b, ac.x, ac.y, CONNECTOR_GAP);
  // 縁で止めた結果、向きが逆になる（重なっている）なら描かない
  if ((p2.x - p1.x) * (bc.x - ac.x) + (p2.y - p1.y) * (bc.y - ac.y) <= 0) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** 矢印の線。両端のどちらかが消えている（または重なっている）ときは null。 */
export function connectorLine(c: ConnectorObject, objects: Record<string, BoardObject>): Line | null {
  const a = objects[c.fromId];
  const b = objects[c.toId];
  if (!a || !b || !isBox(a) || !isBox(b)) return null;
  return lineBetween(a, b);
}

/** 両端がそろっている矢印か（片方が消えた矢印は、表示・コピー・書き出しの対象にしない） */
export function connectorAlive(c: ConnectorObject, objects: Record<string, BoardObject>) {
  const a = objects[c.fromId];
  const b = objects[c.toId];
  return !!a && !!b && isBox(a) && isBox(b);
}

/**
 * 矢印でつなげるもの（付箋・テキスト・画像）。セクションはつながない：ボードはセクションで区切って使うことが多く、
 * セクションの中の余白を押したり離したりしたときに、セクションにつながってしまうのを防ぐため。
 */
export function isConnectable(o: BoardObject): o is StickyObject | TextObject | ImageObject {
  return o.type === 'sticky' || o.type === 'text' || o.type === 'image';
}

/** 矢印の始まり・先になるもの：その位置で一番手前に見えているもの（付箋・テキスト → 画像の順）。セクションは含めない。 */
export function boxAt(
  px: number,
  py: number,
  objects: Record<string, BoardObject>,
  excludeId?: string,
): StickyObject | TextObject | ImageObject | null {
  const layer = (o: BoxObject) => (o.type === 'sticky' || o.type === 'text' ? 2 : 1);
  let best: StickyObject | TextObject | ImageObject | null = null;
  for (const o of Object.values(objects)) {
    if (!isConnectable(o) || o.id === excludeId || !contains(o, px, py)) continue;
    if (!best || layer(o) > layer(best) || (layer(o) === layer(best) && o.z > best.z)) best = o;
  }
  return best;
}

/** 矢印を伸ばすときに、元の付箋の中心の線へ吸い付く距離（画面上の px） */
const CONNECT_ALIGN_PX = 12;

/**
 * 矢印を伸ばしている先の位置を、元の付箋の中心にそろえる。
 * Shift を押している間は真横か真下（大きく動かした方の向き）に固定し、
 * そうでなければ中心の線の近く（画面上で CONNECT_ALIGN_PX 以内）に来たときだけ吸い付かせる（⌘ / Ctrl を押している間は吸い付かない）。
 * 長い距離を引くと手がぶれやすいので、付箋を動かすときの吸着（6px）より広めにしている。
 * 何もないところで離すと、ここで決めた位置を中心に付箋ができるので、元の付箋と中心がそろって並ぶ。
 */
export function alignToSource(
  p: { x: number; y: number },
  from: { x: number; y: number; w: number; h: number },
  keys: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  zoom: number,
) {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  if (keys.shiftKey) return Math.abs(p.x - cx) >= Math.abs(p.y - cy) ? { x: p.x, y: cy } : { x: cx, y: p.y };
  if (keys.metaKey || keys.ctrlKey) return p;
  const near = CONNECT_ALIGN_PX / zoom;
  return { x: Math.abs(p.x - cx) <= near ? cx : p.x, y: Math.abs(p.y - cy) <= near ? cy : p.y };
}

/** 矢印を伸ばして作るもの（付箋・テキスト）と、元のものとの最低限の間隔（矢印が見えるように、隣に足すときより広くする） */
export const CONNECT_MIN_GAP = 96;

/**
 * 矢印を伸ばして何もないところで離したときに作る付箋の位置。
 * 伸ばした向き（横か縦の、大きく動かした方）の手前の辺がカーソルの位置に来るように置き（付箋が元の付箋側にかぶらない）、
 * 元の付箋との間は CONNECT_MIN_GAP 以上あける。もう一方の向きは、カーソルの位置を中心にする。
 */
export function connectedStickyRect(from: Rect, p: { x: number; y: number }, w: number, h: number): Rect {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx >= 0 ? Math.max(p.x, from.x + from.w + CONNECT_MIN_GAP) : Math.min(p.x - w, from.x - CONNECT_MIN_GAP - w);
    return { x: Math.round(x), y: Math.round(p.y - h / 2), w, h };
  }
  const y = dy >= 0 ? Math.max(p.y, from.y + from.h + CONNECT_MIN_GAP) : Math.min(p.y - h, from.y - CONNECT_MIN_GAP - h);
  return { x: Math.round(p.x - w / 2), y: Math.round(y), w, h };
}

/**
 * 矢印の向きを、画面で見たままの向きで表す。横に近い矢印は右（下）向きが 'forward'、左（上）向きが 'backward'。
 * axis は横に近いか縦に近いか（操作パネルのアイコンを → ← ↔ にするか ↓ ↑ ↕ にするか）。
 */
export type ArrowDirection = 'forward' | 'backward' | 'both';

export function connectorDirection(c: ConnectorObject, line: Line): { axis: 'x' | 'y'; direction: ArrowDirection } {
  const axis = Math.abs(line.x2 - line.x1) >= Math.abs(line.y2 - line.y1) ? 'x' : 'y';
  if (c.bothEnds) return { axis, direction: 'both' };
  const toIsForward = axis === 'x' ? line.x2 > line.x1 : line.y2 > line.y1;
  return { axis, direction: toIsForward ? 'forward' : 'backward' };
}
