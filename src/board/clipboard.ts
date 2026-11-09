// 付箋・セクションなどのコピー＆ペースト（⌘C・⌘X・⌘V）。
// コピーしたものは、パソコンのクリップボードに HTML の属性として入れる。同じボードにも、別のボード
// （別のタブ・別の環境の N-Board）にも貼れる。貼るときに渡されるのはよそから来たデータなので、
// 1つずつ形を確かめ、決まった項目だけを取り出してから作る。
import { findParentSection, type Rect } from './geometry';
import type { NewObject } from '../data/objects';
import type { BoardObject, SectionObject, StampKind } from '../types';

/** クリップボードに入れる1つ分。位置はコピーしたときのキャンバス上の位置（スタンプは付け先からの相対位置）。 */
export type ClipItem =
  | { key: string; type: 'sticky'; x: number; y: number; w: number; h: number; z: number; text: string; color: string; parentKey: string | null }
  | { key: string; type: 'section'; x: number; y: number; w: number; h: number; z: number; title: string; color: string }
  | { key: string; type: 'text'; x: number; y: number; w: number; h: number; z: number; text: string; fontSize: number; color: string; autoWidth: boolean; parentKey: string | null }
  | { key: string; type: 'image'; x: number; y: number; w: number; h: number; z: number; src: string; parentKey: string | null }
  | { key: string; type: 'stamp'; x: number; y: number; z: number; stampKind: string; targetKey: string | null }
  | { key: string; type: 'connector'; x: number; y: number; z: number; fromKey: string; toKey: string; label: string; bothEnds: boolean };

/** 一度にコピー・貼り付けできる数の上限 */
export const MAX_CLIP_ITEMS = 500;
/** 同じ場所に貼ったときに、少しずつずらす幅 */
export const PASTE_CASCADE = 24;

const ATTR = 'data-nboard-objects';
const FORMAT_VERSION = 1;

/**
 * 選んでいるものから、コピーするものを決める。
 * セクションを選んでいれば中の付箋・テキスト・画像も一緒に入れる。
 * 付箋などに押されたスタンプ（みんなの投票・反応）は入れない。スタンプそのものを選んでいるときだけ入れる。
 */
export function collectForCopy(selectedIds: string[], objects: Record<string, BoardObject>): ClipItem[] {
  const picked = new Map<string, BoardObject>();
  for (const id of selectedIds) {
    const o = objects[id];
    if (o) picked.set(id, o);
  }
  for (const o of Object.values(objects)) {
    if ((o.type === 'sticky' || o.type === 'text' || o.type === 'image') && o.parentId && picked.get(o.parentId)?.type === 'section') {
      picked.set(o.id, o);
    }
  }
  // 矢印は、両端を一緒にコピーするときだけ入れる（矢印を選んでいなくても入れる）
  for (const o of Object.values(objects)) {
    if (o.type === 'connector' && picked.has(o.fromId) && picked.has(o.toId)) picked.set(o.id, o);
  }
  const keep = (id: string | null) => (id && picked.has(id) ? id : null);
  const items: ClipItem[] = [];
  for (const o of [...picked.values()].sort((a, b) => a.z - b.z)) {
    const base = { key: o.id, x: o.x, y: o.y, z: o.z };
    switch (o.type) {
      case 'sticky':
        items.push({ ...base, type: 'sticky', w: o.w, h: o.h, text: o.text, color: o.color, parentKey: keep(o.parentId) });
        break;
      case 'section':
        items.push({ ...base, type: 'section', w: o.w, h: o.h, title: o.title, color: o.color });
        break;
      case 'text':
        items.push({ ...base, type: 'text', w: o.w, h: o.h, text: o.text, fontSize: o.fontSize, color: o.color, autoWidth: !!o.autoWidth, parentKey: keep(o.parentId) });
        break;
      case 'image':
        items.push({ ...base, type: 'image', w: o.w, h: o.h, src: o.src, parentKey: keep(o.parentId) });
        break;
      case 'stamp': {
        // 付け先を一緒にコピーしないときは、ボードに直接押したスタンプにする
        const target = o.targetId ? objects[o.targetId] : null;
        if (o.targetId && !target) break;
        if (target && !picked.has(target.id)) items.push({ ...base, x: target.x + o.x, y: target.y + o.y, type: 'stamp', stampKind: o.stampKind, targetKey: null });
        else items.push({ ...base, type: 'stamp', stampKind: o.stampKind, targetKey: keep(o.targetId) });
        break;
      }
      case 'connector':
        if (picked.has(o.fromId) && picked.has(o.toId) && picked.get(o.fromId)!.type !== 'connector' && picked.get(o.toId)!.type !== 'connector') {
          items.push({ ...base, type: 'connector', fromKey: o.fromId, toKey: o.toId, label: o.label, bothEnds: !!o.bothEnds });
        }
        break;
    }
  }
  return items.slice(0, MAX_CLIP_ITEMS);
}

/** ほかのアプリに貼ったときの文字（セクションの名前・付箋・テキストの文字を1行ずつ） */
export function clipPlainText(items: ClipItem[]): string {
  return items
    .map((i) => (i.type === 'section' ? i.title : i.type === 'sticky' || i.type === 'text' ? i.text : ''))
    .filter((s) => s.trim())
    .join('\n');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function toBase64(s: string) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

/** クリップボードの HTML。ほかのアプリでは文字として見え、N-Board では属性からデータを読む。 */
export function encodeClip(items: ClipItem[]): string {
  const data = toBase64(JSON.stringify({ v: FORMAT_VERSION, items }));
  const text = escapeHtml(clipPlainText(items)).replace(/\n/g, '<br>');
  return `<div ${ATTR}="${data}">${text}</div>`;
}

// ---- 貼るときの確認 ----

const STICKY_COLORS = ['yellow', 'orange', 'pink', 'purple', 'blue', 'green', 'gray'];
const SECTION_COLORS = ['gray', 'blue', 'green', 'yellow', 'pink', 'purple'];
const TEXT_COLORS = ['black', 'gray', 'red', 'orange', 'green', 'blue', 'purple'];
const TEXT_SIZES = [16, 24, 36, 56];
const STAMP_KINDS: StampKind[] = ['like', 'heart', 'star', 'hundred', 'fire', 'idea', 'rofl', 'eyes', 'question', 'face'];
/** 画像の置き場所（Storage）。ほかの場所は指させない。 */
export const IMAGE_SRC = /^boards\/[A-Za-z0-9]{1,40}\/images\/[A-Za-z0-9]{20,40}\.(png|jpg|gif|webp)$/;

const LIMIT = 1_000_000;
const num = (v: unknown, min = -LIMIT, max = LIMIT) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
const oneOf = <T>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : null);
const keyOf = (v: unknown) => (v == null ? null : str(v, 100));

/** 1つ分を確かめる。おかしなものは null（貼らない）。 */
function readItem(raw: unknown): ClipItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const key = str(r.key, 100);
  const x = num(r.x);
  const y = num(r.y);
  const z = num(r.z, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) ?? 0;
  if (!key || x == null || y == null) return null;
  const base = { key, x, y, z };
  const w = num(r.w, 20, 5000);
  const h = num(r.h, 10, 20000);
  switch (r.type) {
    case 'sticky': {
      const text = str(r.text, 2000);
      const color = oneOf(r.color, STICKY_COLORS);
      if (w == null || h == null || w < 40 || h < 40 || h > 5000 || text == null || !color) return null;
      return { ...base, type: 'sticky', w, h, text, color, parentKey: keyOf(r.parentKey) };
    }
    case 'section': {
      const title = str(r.title, 100);
      const color = oneOf(r.color, SECTION_COLORS);
      if (w == null || h == null || w < 40 || h < 40 || h > 5000 || title == null || !color) return null;
      return { ...base, type: 'section', w, h, title, color };
    }
    case 'text': {
      const text = str(r.text, 2000);
      const fontSize = oneOf(r.fontSize, TEXT_SIZES);
      const color = oneOf(r.color, TEXT_COLORS);
      if (w == null || h == null || w < 40 || text == null || !fontSize || !color) return null;
      return { ...base, type: 'text', w, h, text, fontSize, color, autoWidth: r.autoWidth === true, parentKey: keyOf(r.parentKey) };
    }
    case 'image': {
      const src = typeof r.src === 'string' && IMAGE_SRC.test(r.src) ? r.src : null;
      if (w == null || h == null || h > 5000 || !src) return null;
      return { ...base, type: 'image', w, h, src, parentKey: keyOf(r.parentKey) };
    }
    case 'stamp': {
      const stampKind = oneOf(r.stampKind, STAMP_KINDS);
      if (!stampKind) return null;
      return { ...base, type: 'stamp', stampKind, targetKey: keyOf(r.targetKey) };
    }
    case 'connector': {
      const fromKey = str(r.fromKey, 100);
      const toKey = str(r.toKey, 100);
      const label = str(r.label, 50);
      if (!fromKey || !toKey || fromKey === toKey || label == null) return null;
      return { ...base, type: 'connector', fromKey, toKey, label, bothEnds: r.bothEnds === true };
    }
  }
  return null;
}

/** クリップボードの HTML から、N-Board でコピーしたものを読み出す。なければ null。 */
export function decodeClip(html: string): ClipItem[] | null {
  const m = html.match(new RegExp(`${ATTR}="([A-Za-z0-9+/=]+)"`));
  if (!m) return null;
  try {
    const parsed = JSON.parse(fromBase64(m[1])) as { v?: unknown; items?: unknown };
    if (parsed.v !== FORMAT_VERSION || !Array.isArray(parsed.items)) return null;
    const items = parsed.items.slice(0, MAX_CLIP_ITEMS).map(readItem).filter((i): i is ClipItem => !!i);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

// ---- 貼る位置 ----

/** 新しく作るもの。image の copyFrom は、元の画像のファイル（別のボードなら新しい置き場所に写す）。 */
export interface PastePlan {
  id: string;
  /** 元にしたもの（コピーしたときの ID） */
  sourceKey: string;
  data: NewObject;
  copyFrom?: string;
}

function itemRect(i: ClipItem): Rect | null {
  return i.type === 'stamp' || i.type === 'connector' ? null : { x: i.x, y: i.y, w: i.w, h: i.h };
}

/**
 * 貼るものを作る形にする。
 * - 全体の真ん中が center に来るように置く。同じ種類のものがちょうど同じ位置にあるとき（同じ場所に続けて貼ったとき）は、少しずつずらす。
 * - ID は新しく付け直し、セクションとその中身、スタンプと付け先のつながりは保つ。
 * - 一緒に貼ったセクションに入っていないものは、置いた位置のセクションに入れる。
 * - 重なり順は、元の順番のまま手前に出す（zBase から1ずつ増やす）。
 */
export function planPaste(
  items: ClipItem[],
  center: { x: number; y: number },
  objects: Record<string, BoardObject>,
  newId: () => string,
  zBase: number,
): PastePlan[] {
  const rects = items.map(itemRect).filter((r): r is Rect => !!r);
  if (rects.length === 0) {
    // スタンプだけのとき
    for (const i of items) if (i.type === 'stamp') rects.push({ x: i.x, y: i.y, w: 0, h: 0 });
    if (rects.length === 0) return [];
  }
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  let dx = Math.round(center.x - (minX + maxX) / 2);
  let dy = Math.round(center.y - (minY + maxY) / 2);

  const existing = Object.values(objects);
  const taken = (d: number, e: number) =>
    items.some((i) => i.type !== 'stamp' && i.type !== 'connector' && existing.some((o) => o.type === i.type && o.x === i.x + d && o.y === i.y + e));
  for (let n = 0; n < 50 && taken(dx, dy); n++) {
    dx += PASTE_CASCADE;
    dy += PASTE_CASCADE;
  }
  return planAt(items, dx, dy, objects, newId, zBase);
}

/**
 * 複製するものを作る形にする（Option＋ドラッグ・⌘D）。元の位置から (dx, dy) ずらして置く。
 * ID の付け直し・セクションや矢印のつながり・重なり順の決め方は貼り付けと同じ。
 */
export function planDuplicate(
  items: ClipItem[],
  dx: number,
  dy: number,
  objects: Record<string, BoardObject>,
  newId: () => string,
  zBase: number,
): PastePlan[] {
  return planAt(items, dx, dy, objects, newId, zBase);
}

function planAt(
  items: ClipItem[],
  dx: number,
  dy: number,
  objects: Record<string, BoardObject>,
  newId: () => string,
  zBase: number,
): PastePlan[] {
  const existing = Object.values(objects);
  const ids = new Map(items.map((i) => [i.key, newId()]));
  const sorted = [...items].sort((a, b) => a.z - b.z);
  const zOf = new Map(sorted.map((i, n) => [i.key, zBase + n]));

  // 置いた位置で入るセクション（一緒に貼るセクションも含める）
  const sections: SectionObject[] = existing.filter((o): o is SectionObject => o.type === 'section');
  for (const i of items) {
    if (i.type === 'section') sections.push({ ...i, id: ids.get(i.key)!, x: i.x + dx, y: i.y + dy, z: zOf.get(i.key)! } as unknown as SectionObject);
  }
  const parentOf = (parentKey: string | null, rect: Rect) => {
    const copied = parentKey && items.some((p) => p.key === parentKey && p.type === 'section') ? ids.get(parentKey)! : null;
    return copied ?? findParentSection(rect, sections)?.id ?? null;
  };

  const plans: PastePlan[] = [];
  for (const i of items) {
    const id = ids.get(i.key)!;
    const z = zOf.get(i.key)!;
    const x = i.x + dx;
    const y = i.y + dy;
    switch (i.type) {
      case 'sticky':
        plans.push({ id, sourceKey: i.key, data: { type: 'sticky', x, y, z, w: i.w, h: i.h, text: i.text, color: i.color as never, parentId: parentOf(i.parentKey, { x, y, w: i.w, h: i.h }) } });
        break;
      case 'section':
        plans.push({ id, sourceKey: i.key, data: { type: 'section', x, y, z, w: i.w, h: i.h, title: i.title, color: i.color as never } });
        break;
      case 'text':
        plans.push({
          id,
          sourceKey: i.key,
          data: { type: 'text', x, y, z, w: i.w, h: i.h, text: i.text, fontSize: i.fontSize as never, color: i.color as never, autoWidth: i.autoWidth, parentId: parentOf(i.parentKey, { x, y, w: i.w, h: i.h }) },
        });
        break;
      case 'image':
        plans.push({ id, sourceKey: i.key, data: { type: 'image', x, y, z, w: i.w, h: i.h, src: i.src, parentId: parentOf(i.parentKey, { x, y, w: i.w, h: i.h }) }, copyFrom: i.src });
        break;
      case 'stamp': {
        const target = i.targetKey ? ids.get(i.targetKey) : undefined;
        // 付け先を一緒に貼るときは相対位置のまま。付け先がないときはボードに直接押す。
        if (i.targetKey && !target) break;
        plans.push({ id, sourceKey: i.key, data: { type: 'stamp', x: target ? i.x : x, y: target ? i.y : y, z, stampKind: i.stampKind as StampKind, targetId: target ?? null } });
        break;
      }
      case 'connector': {
        // 両端を一緒に貼るときだけ作る
        const fromId = items.some((p) => p.key === i.fromKey && p.type !== 'stamp' && p.type !== 'connector') ? ids.get(i.fromKey) : undefined;
        const toId = items.some((p) => p.key === i.toKey && p.type !== 'stamp' && p.type !== 'connector') ? ids.get(i.toKey) : undefined;
        if (!fromId || !toId) break;
        plans.push({ id, sourceKey: i.key, data: { type: 'connector', x: 0, y: 0, z, fromId, toId, label: i.label, ...(i.bothEnds ? { bothEnds: true } : {}) } });
        break;
      }
    }
  }
  return plans;
}
