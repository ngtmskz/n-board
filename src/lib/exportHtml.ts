// ボードの見た目を、1つのファイルで開ける HTML に書き出す（共有用のページに貼って共有する用途）。
// 画像の書き出しと同じく画面の要素をそのまま写すので、付箋などの見た目を変えても書き出し側を直す必要はない。
// 画像と違って図（SVG）のまま入れるので、拡大しても文字がぼやけず、文字の検索やリンクのクリックもできる。
import { toSvg } from 'html-to-image';
import { t } from '../i18n';
import { IMAGE_PLACEHOLDER, isExcluded, withInlinedSvgStyles, type Bounds } from './exportImage';

const SVG_DATA_PREFIX = 'data:image/svg+xml;charset=utf-8,';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** ボード（.world の要素）を、そのまま HTML に埋め込める SVG の文字列にする */
export async function renderBoardSvg(world: HTMLElement, bounds: Bounds) {
  const url = await withInlinedSvgStyles(world, () => toSvg(world, {
    width: Math.ceil(bounds.w),
    height: Math.ceil(bounds.h),
    backgroundColor: '#ffffff',
    style: { transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)` },
    filter: (node) => !isExcluded(node),
    imagePlaceholder: IMAGE_PLACEHOLDER,
    // 書体（日本語の書体は数 MB ある）は入れず、見る人のパソコンの書体で表示する
    skipFonts: true,
  }));
  if (!url.startsWith(SVG_DATA_PREFIX)) throw new Error('unexpected SVG data URL');
  return decodeURIComponent(url.slice(SVG_DATA_PREFIX.length));
}

/** 書き出した HTML を開いたときの操作（拡大・縮小・移動・全体を表示）。外部のライブラリは使わない。 */
const VIEWER_SCRIPT = `
(() => {
  const stage = document.getElementById('stage');
  const board = document.getElementById('board');
  const label = document.getElementById('zoom-label');
  const W = board.offsetWidth, H = board.offsetHeight;
  const MIN = 0.05, MAX = 8, MARGIN = 24;
  let z = 1, x = 0, y = 0;
  const apply = () => {
    board.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')';
    label.textContent = Math.round(z * 100) + '%';
  };
  const fit = () => {
    const r = stage.getBoundingClientRect();
    z = Math.min(1, (r.width - MARGIN * 2) / W, (r.height - MARGIN * 2) / H);
    x = (r.width - W * z) / 2;
    y = (r.height - H * z) / 2;
    apply();
  };
  const zoomAt = (cx, cy, f) => {
    const nz = Math.min(MAX, Math.max(MIN, z * f));
    x = cx - (cx - x) * nz / z;
    y = cy - (cy - y) * nz / z;
    z = nz;
    apply();
  };
  const zoomCenter = (f) => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, f);
  };
  // スクロールで移動、ピンチ（ctrl＋ホイール）や ⌘＋ホイールで拡大・縮小（ボードの画面と同じ）
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
    else { x -= e.deltaX; y -= e.deltaY; apply(); }
  }, { passive: false });
  // ドラッグで移動、2本指で拡大・縮小
  const pointers = new Map();
  let moved = false, last = null;
  const gesture = () => {
    const ps = [...pointers.values()];
    if (ps.length === 1) return { x: ps[0].x, y: ps[0].y, d: 0 };
    return { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2, d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) };
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (pointers.size === 0) moved = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    last = gesture();
    stage.classList.add('panning');
  });
  window.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 4) moved = true;
    if (!moved) return;
    if (!stage.hasPointerCapture(e.pointerId)) stage.setPointerCapture(e.pointerId);
    const g = gesture();
    const r = stage.getBoundingClientRect();
    x += g.x - last.x; y += g.y - last.y;
    if (g.d && last.d) zoomAt(g.x - r.left, g.y - r.top, g.d / last.d); else apply();
    last = g;
  });
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    last = pointers.size ? gesture() : null;
    if (!pointers.size) stage.classList.remove('panning');
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // ドラッグで動かしたときは、リンクを開かない
  stage.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
  stage.addEventListener('dragstart', (e) => e.preventDefault());
  document.getElementById('zoom-in').onclick = () => zoomCenter(1.25);
  document.getElementById('zoom-out').onclick = () => zoomCenter(1 / 1.25);
  document.getElementById('zoom-fit').onclick = fit;
  label.onclick = () => zoomCenter(1 / z);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') zoomCenter(1.25);
    else if (e.key === '-') zoomCenter(1 / 1.25);
    else if (e.key === '0') fit();
  });
  window.addEventListener('resize', fit);
  fit();
})();
`;

const VIEWER_STYLE = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  display: flex; flex-direction: column; color: #1f2329; background: #fafafa;
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Segoe UI', Meiryo, sans-serif;
}
header {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  background: #fff; border-bottom: 1px solid #e4e5e9; flex-wrap: wrap;
}
h1 { margin: 0; font-size: 16px; font-weight: 600; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.meta { font-size: 12px; color: #6b7280; }
.zoom { display: flex; align-items: center; gap: 2px; }
.zoom button {
  font: inherit; font-size: 14px; min-width: 32px; height: 32px; padding: 0 8px;
  border: 1px solid #e4e5e9; border-radius: 6px; background: #fff; color: inherit; cursor: pointer;
}
.zoom button:hover { background: #f2f3f5; }
#zoom-label { min-width: 60px; font-variant-numeric: tabular-nums; }
#stage {
  position: relative; flex: 1; overflow: hidden; touch-action: none; cursor: grab;
  background-color: #fafafa; background-image: radial-gradient(#dcdce2 1.2px, transparent 1.2px); background-size: 24px 24px;
}
#stage.panning { cursor: grabbing; }
#board {
  position: absolute; left: 0; top: 0; transform-origin: 0 0;
  background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); user-select: none; -webkit-user-select: none;
}
#board svg { display: block; }
#board a { cursor: pointer; }
`;

/** 書き出し日時の表示（例：2026/11/06 15:30） */
function formatExportedAt(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 見た目の SVG を、拡大・縮小できる1つの HTML ファイルの中身にする */
export function buildBoardHtml(boardTitle: string, svg: string, exportedAt: Date) {
  const title = escapeHtml(boardTitle || t('common.board'));
  return `<!doctype html>
<html lang="${escapeHtml(t('html.lang'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${VIEWER_STYLE}</style>
</head>
<body>
<header>
<h1>${title}</h1>
<span class="meta">${escapeHtml(t('html.exportedAt', { date: formatExportedAt(exportedAt) }))}</span>
<div class="zoom">
<button id="zoom-out" type="button" title="${escapeHtml(t('html.zoomOut'))}" aria-label="${escapeHtml(t('html.zoomOut'))}">−</button>
<button id="zoom-label" type="button" title="${escapeHtml(t('html.zoomReset'))}">100%</button>
<button id="zoom-in" type="button" title="${escapeHtml(t('html.zoomIn'))}" aria-label="${escapeHtml(t('html.zoomIn'))}">＋</button>
<button id="zoom-fit" type="button" title="${escapeHtml(t('html.fitTitle'))}">${escapeHtml(t('html.fit'))}</button>
</div>
</header>
<main id="stage"><div id="board">${svg}</div></main>
<script>${VIEWER_SCRIPT}</script>
</body>
</html>
`;
}
