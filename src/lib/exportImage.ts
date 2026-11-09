// ボードの見た目を PNG に書き出す。
// 画面に表示している要素をそのまま画像にするので、付箋などの見た目を変えても書き出し側を直す必要はない。
import { toPng } from 'html-to-image';

/** 書き出す範囲のまわりの余白（ボードの座標） */
const PADDING = 48;
/** 資料に貼っても文字がつぶれないよう、基本は2倍の解像度にする */
const MAX_SCALE = 2;
/** ブラウザが作れる画像の上限（Safari の面積の上限と、各ブラウザの1辺の上限） */
const MAX_AREA = 16_777_216;
const MAX_SIDE = 16_384;

/** 外部の写真（顔スタンプのプロフィール写真）を読み込めなかったときに代わりに描く灰色の丸 */
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#c5c8d0"/></svg>');

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 画像の倍率。基本は2倍で、大きなボードはブラウザの上限に収まるまで下げる。 */
export function imageScale(width: number, height: number) {
  return Math.min(MAX_SCALE, Math.sqrt(MAX_AREA / (width * height)), MAX_SIDE / width, MAX_SIDE / height);
}

/** 置き場所のプレビューや、空の付箋の「ダブルクリックで編集」など、書き出さない要素 */
export function isExcluded(node: Node) {
  return node instanceof HTMLElement && (node.classList.contains('ghost') || node.classList.contains('placeholder'));
}

/** ボードにあるものすべてが入る範囲（ボードの座標）。何もなければ null。 */
export function contentBounds(world: HTMLElement, zoom: number): Bounds | null {
  const origin = world.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of world.children) {
    if (isExcluded(el)) continue;
    // 要素の中身（セクションの見出しなど）がはみ出している分も含める
    for (const node of [el, ...el.querySelectorAll('*')]) {
      const r = node.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
  }
  if (minX === Infinity) return null;
  return {
    x: (minX - origin.left) / zoom - PADDING,
    y: (minY - origin.top) / zoom - PADDING,
    w: (maxX - minX) / zoom + PADDING * 2,
    h: (maxY - minY) / zoom + PADDING * 2,
  };
}

/** SVG の中の図形で、見た目に関わるスタイル */
const SVG_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'display',
  'visibility',
];

/**
 * html-to-image は SVG（矢印の線・矢じりなど）の中身を CSS ごとは写さないので、
 * 書き出す間だけ、CSS で付けている色や太さを要素に直接書いておく。終わったら元に戻す。
 */
export async function withInlinedSvgStyles<T>(world: HTMLElement, render: () => Promise<T>): Promise<T> {
  const saved: { el: SVGElement; style: string | null }[] = [];
  for (const el of world.querySelectorAll<SVGElement>('svg *')) {
    const computed = getComputedStyle(el);
    saved.push({ el, style: el.getAttribute('style') });
    for (const prop of SVG_STYLE_PROPS) el.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  try {
    return await render();
  } finally {
    for (const { el, style } of saved) {
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
  }
}

/** ボード（.world の要素）を、白い背景の PNG の data URL にする */
export function renderBoardPng(world: HTMLElement, bounds: Bounds) {
  const width = Math.ceil(bounds.w);
  const height = Math.ceil(bounds.h);
  return withInlinedSvgStyles(world, () => toPng(world, {
    width,
    height,
    pixelRatio: imageScale(width, height),
    backgroundColor: '#ffffff',
    // 画面のスクロール・拡大の状態に関係なく、範囲の左上を画像の左上に合わせて等倍で描く
    style: { transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)` },
    filter: (node) => !isExcluded(node),
    imagePlaceholder: IMAGE_PLACEHOLDER,
  }));
}
