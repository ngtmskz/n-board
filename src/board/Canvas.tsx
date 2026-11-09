import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DRAG_WRITE_INTERVAL_MS, STAMP_SIZE, TEXT_MIN_WIDTH, ZOOM_MAX, ZOOM_MIN } from '../constants';
import type { PatchOp } from '../data/objects';
import { toast } from '../components/Toast';
import { t } from '../i18n';
import { isTyping } from '../lib/isTyping';
import type { BoardObject, BoxObject, ConnectorObject, ImageObject, ObjectPatch, SectionObject, StampObject, StickyObject, TextObject } from '../types';
import {
  addSection,
  addStamp,
  addSticky,
  addText,
  commitChanges,
  copySelection,
  defaultSectionRect,
  duplicateSelection,
  isMember,
  membershipChanges,
  mergeChanges,
  stampTargetStickyId,
  syncTextSize,
  usePendingImages,
  writePositions,
} from './actions';
import { AddNextButtons, SelectionMarquee, SnapGuide } from './ArrangeAids';
import { ImageBox, PendingImageBox, Section, Stamp, Sticky, TextBox } from './BoardObjects';
import { CommentPanel } from './CommentPanel';
import { beginConnect, cancelPendingConnect, finishPendingConnect, isConnectPending } from './connectDrag';
import { ConnectorHint, ConnectorLayer, ConnectPreview } from './Connectors';
import { confirmAndDelete } from './comments';
import { boxAt, contains, findStampTarget, isBox, marqueeHits, overlaps, stampPosition, type Rect } from './geometry';
import { imageFiles, insertImageFiles, pasteFromClipboard, setPastePointer } from './insert';
import { StampOutlineFilter } from './StampEmoji';
import { markSpacePanUsed } from './panHint';
import { PlacementPreview, usePreview } from './PlacementPreview';
import { SelectionToolbar } from './SelectionToolbar';
import { SNAP_DISTANCE_PX, snapRect } from './snap';
import { clearOverrides, getObjects, mergeObjects, setOverride, settleOverrides, useBoard } from './store';
import type { UndoChange } from './undo';

type Drag =
  | { kind: 'pan'; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'move';
      primaryId: string;
      /** 動かすもの（選んでいるもの＋選んだセクションの中の付箋・テキスト） */
      ids: string[];
      /** 動かさずに離したときの選択（複数選んでいる中の1つを押したらそれだけ、Shift＋クリックで外すときは残り） */
      selectOnClick: string[] | null;
      /** 吸着させる範囲（選んでいるものの外枠の、動かし始めの位置）。スタンプだけなら null。 */
      snapBox: Rect | null;
      start: Record<string, { x: number; y: number }>;
      startZ: number;
      newZ: number | null;
      startX: number;
      startY: number;
      moved: boolean;
      lastWrite: number;
      timer: number | undefined;
      /** 吸着の相手（画面に見えている、動かしていないもの）。スタンプを動かすときは空。 */
      snapTargets: Rect[];
      /** Option（Alt）を押して始めたドラッグ。動かし始めたときに複製を作り、複製の方を動かす。 */
      duplicate: boolean;
      /** 複製を作ったか（置いた位置は元に戻すに記録しない。作ったことだけを記録する） */
      duplicated: boolean;
    }
  /** セクションは幅と高さ、テキストは幅だけ、画像は縦横の比率を保って変える */
  | {
      kind: 'resize';
      id: string;
      widthOnly: boolean;
      /** セクションの右の辺（x）・下の辺（y）をつかんだときは、その向きだけ変える。角なら null。 */
      axis: 'x' | 'y' | null;
      /** 画像の高さ÷幅（比率を保つとき） */
      ratio: number | null;
      /** テキストが文字に合わせて伸びる状態だったか（幅を変えると「幅を決めた」状態になる） */
      startAuto: boolean;
      startW: number;
      startH: number;
      startX: number;
      startY: number;
    }
  /** セクションの範囲をドラッグで描く（開始点はキャンバス座標） */
  | { kind: 'draw'; startX: number; startY: number; startClientX: number; startClientY: number }
  /** 何もないところからドラッグして範囲で選ぶ。base は Shift を押して始めたときの元の選択。 */
  | {
      kind: 'marquee';
      startX: number;
      startY: number;
      startClientX: number;
      startClientY: number;
      base: string[];
      moved: boolean;
    };

const MIN_SECTION = 120;
/** 画像を小さくできる限度（短い辺） */
const MIN_IMAGE = 20;
const DRAG_THRESHOLD_PX = 3;
/** これより短いドラッグはクリックとみなし、標準サイズのセクションを置く */
const DRAW_THRESHOLD_PX = 8;

function rectBetween(ax: number, ay: number, bx: number, by: number) {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

export function zoomAt(screenX: number, screenY: number, factor: number) {
  useBoard.setState(({ viewport: v }) => {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor));
    const k = zoom / v.zoom;
    return {
      viewport: { zoom, offsetX: screenX - (screenX - v.offsetX) * k, offsetY: screenY - (screenY - v.offsetY) * k },
    };
  });
}

/** 「全体を表示」で、ツールバーや上部の表示に重ならないよう空けておく幅 */
export const FIT_MARGIN = { left: 96, top: 72, right: 48, bottom: 72 };
/** セクション名のラベル（セクションの上に出る）の高さ */
const SECTION_LABEL_HEIGHT = 36;

/** ボード上のすべてが画面に収まるように表示する。小さいものを必要以上に拡大はしない。 */
export function fitToContent() {
  const objects = getObjects();
  const rects: Rect[] = [];
  for (const o of Object.values(objects)) {
    if (o.type === 'stamp') {
      const p = stampPosition(o, objects);
      if (p) rects.push({ x: p.x, y: p.y, w: STAMP_SIZE, h: STAMP_SIZE });
    } else if (o.type === 'section') {
      rects.push({ x: o.x, y: o.y - SECTION_LABEL_HEIGHT, w: o.w, h: o.h + SECTION_LABEL_HEIGHT });
    } else if (o.type !== 'connector') {
      rects.push(o);
    }
  }
  if (rects.length === 0) return;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const areaW = window.innerWidth - FIT_MARGIN.left - FIT_MARGIN.right;
  const areaH = window.innerHeight - FIT_MARGIN.top - FIT_MARGIN.bottom;
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(areaW / (maxX - minX), areaH / (maxY - minY), 1)));
  useBoard.setState({
    viewport: {
      zoom,
      offsetX: FIT_MARGIN.left + (areaW - (maxX - minX) * zoom) / 2 - minX * zoom,
      offsetY: FIT_MARGIN.top + (areaH - (maxY - minY) * zoom) / 2 - minY * zoom,
    },
  });
}

/**
 * 動かしたスタンプを、中心の位置にある付箋・セクション（なければボード）に付け直す変更。
 * 表示が反映待ちの間にずれないよう、手元の表示も新しい値にしておく。
 */
function stampRetarget(stamp: StampObject, objects: Record<string, BoardObject>): UndoChange[] {
  const pos = stampPosition(stamp, objects);
  if (!pos) return [];
  const list = Object.values(objects);
  const target = findStampTarget(
    pos.x + STAMP_SIZE / 2,
    pos.y + STAMP_SIZE / 2,
    list.filter((o): o is StickyObject => o.type === 'sticky'),
    list.filter((o): o is SectionObject => o.type === 'section'),
  );
  const after: ObjectPatch = {
    x: Math.round(pos.x - (target?.x ?? 0)),
    y: Math.round(pos.y - (target?.y ?? 0)),
    targetId: target?.id ?? null,
  };
  setOverride(stamp.id, after);
  return [{ id: stamp.id, before: { targetId: stamp.targetId }, after }];
}

/** その位置にある一番手前の付箋（なければ null）。コメントのツールで使う。 */
function stickyAt(px: number, py: number): string | null {
  const hit = Object.values(getObjects())
    .filter((o): o is StickyObject => o.type === 'sticky' && contains(o, px, py))
    .sort((a, b) => b.z - a.z)[0];
  return hit?.id ?? null;
}

export function Canvas() {
  const server = useBoard((s) => s.server);
  const settling = useBoard((s) => s.settling);
  const created = useBoard((s) => s.created);
  const overrides = useBoard((s) => s.overrides);
  const viewport = useBoard((s) => s.viewport);
  const selectedIds = useBoard((s) => s.selectedIds);
  const commentTargetId = useBoard((s) => s.commentTargetId);
  const editingId = useBoard((s) => s.editingId);
  const tool = useBoard((s) => s.tool);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const detach = useRef<(() => void) | null>(null);
  // スペースを押している間は、どこをドラッグしても画面を動かす
  const [spaceDown, setSpaceDown] = useState(false);
  const space = useRef(false);

  const objects = useMemo(
    () => mergeObjects(server, created, settling, overrides),
    [server, created, settling, overrides],
  );
  const pendingImages = usePendingImages((s) => s.list);
  // 表示の順番：セクション（奥）→ 画像 → 付箋・テキスト → スタンプ（手前）。同じ層の中は z の順。
  const { sections, images, items, stamps, connectors } = useMemo(() => {
    const all = Object.values(objects).sort((a, b) => a.z - b.z);
    return {
      sections: all.filter((o): o is SectionObject => o.type === 'section'),
      images: all.filter((o): o is ImageObject => o.type === 'image'),
      items: all.filter((o): o is StickyObject | TextObject => o.type === 'sticky' || o.type === 'text'),
      stamps: all.filter((o): o is StampObject => o.type === 'stamp'),
      connectors: all.filter((o): o is ConnectorObject => o.type === 'connector'),
    };
  }, [objects]);

  /** 画面上の座標 → キャンバス上の座標 */
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const v = useBoard.getState().viewport;
    return { x: (clientX - rect.left - v.offsetX) / v.zoom, y: (clientY - rect.top - v.offsetY) / v.zoom };
  };

  // スタンプのツールをやめたら、付く先の付箋を光らせるのもやめる
  useEffect(() => {
    if (tool.kind !== 'stamp' && tool.kind !== 'comment') usePreview.setState({ target: null });
    if (tool.kind !== 'connector') {
      usePreview.setState({ hover: null });
      cancelPendingConnect();
    }
  }, [tool.kind]);

  useEffect(() => {
    const set = (down: boolean) => {
      space.current = down;
      setSpaceDown(down);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      // ページのスクロールや、フォーカスのあるボタンが押されるのを止める
      e.preventDefault();
      if (!space.current) set(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !space.current) return;
      e.preventDefault();
      set(false);
    };
    const onBlur = () => set(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // タッチ操作（iPad など）：2本指のピンチで拡大・縮小し、2本指のまま動かすと画面を動かす。
  // 2本目の指が触れたら、1本目で始めていた操作（画面の移動・付箋の移動など）はそこで終える。
  useEffect(() => {
    const el = ref.current!;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; midX: number; midY: number } | null = null;
    const measure = () => {
      const [a, b] = [...touches.values()];
      const rect = el.getBoundingClientRect();
      return {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        midX: (a.x + b.x) / 2 - rect.left,
        midY: (a.y + b.y) / 2 - rect.top,
      };
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size < 2) return;
      // 2本目の指は、付箋の選択やキャンバスの操作として扱わない
      e.stopPropagation();
      if (touches.size === 2) {
        if (drag.current) {
          const first = [...touches.values()][0];
          // 今の操作を、1本目の指を離したことにして終える（付箋の移動ならその位置で確定する）
          window.dispatchEvent(new PointerEvent('pointerup', { pointerId: -1, clientX: first.x, clientY: first.y }));
        }
        pinch = measure();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch || touches.size !== 2) return;
      const next = measure();
      zoomAt(next.midX, next.midY, next.dist / pinch.dist);
      const dx = next.midX - pinch.midX;
      const dy = next.midY - pinch.midY;
      useBoard.setState(({ viewport: v }) => ({ viewport: { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy } }));
      pinch = next;
    };
    const onUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      if (touches.size < 2) pinch = null;
    };
    // Safari の、ページ全体の拡大・縮小を止める
    const onGesture = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('gesturestart', onGesture);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('gesturestart', onGesture);
    };
  }, []);

  // ⌘V：文字が入っていればテキストとして、画像だけなら画像として貼る（文字を入力中なら、いつもどおり入力欄に貼る）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      if (useBoard.getState().tool.kind === 'comment') return;
      if (pasteFromClipboard(e.clipboardData)) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // ⌘C・⌘X：選んでいる付箋・セクションなどをコピーする（⌘X はコピーしてから削除）。文字を選んでいるときはいつもどおり。
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || isTyping(document.activeElement)) return;
      if (!window.getSelection()?.isCollapsed) return;
      const clip = copySelection();
      if (!clip || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/html', clip.html);
      e.clipboardData.setData('text/plain', clip.text);
      // 削除の確認（コメントがあるとき）は、コピーを済ませてから出す
      if (e.type === 'cut') {
        const ids = useBoard.getState().selectedIds;
        setTimeout(() => confirmAndDelete(ids));
      }
      else toast(t('clip.copied', { count: clip.count }));
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
    };
  }, []);

  // ボードの上部の表示などにファイルを落としたとき、ブラウザがファイルを開いてボードから離れないようにする
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  // ホイール：スクロールで移動、ピンチ（ctrl+ホイール）や ⌘+ホイールで拡大・縮小
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01));
      } else {
        useBoard.setState(({ viewport: v }) => ({
          viewport: { ...v, offsetX: v.offsetX - e.deltaX, offsetY: v.offsetY - e.deltaY },
        }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const flushMove = (d: Extract<Drag, { kind: 'move' }>) => {
    const objs = getObjects();
    const ops: PatchOp[] = d.ids
      .filter((id) => objs[id])
      .map((id) => ({ id, patch: { x: objs[id].x, y: objs[id].y } }));
    d.lastWrite = Date.now();
    writePositions(ops);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const zoom = useBoard.getState().viewport.zoom;
    if (d.kind === 'pan') {
      useBoard.setState(({ viewport: v }) => ({
        viewport: { ...v, offsetX: d.origX + e.clientX - d.startX, offsetY: d.origY + e.clientY - d.startY },
      }));
      return;
    }
    if (d.kind === 'draw') {
      const p = toCanvas(e.clientX, e.clientY);
      usePreview.setState({ draft: rectBetween(d.startX, d.startY, p.x, p.y) });
      return;
    }
    if (d.kind === 'marquee') {
      if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      const p = toCanvas(e.clientX, e.clientY);
      const rect = rectBetween(d.startX, d.startY, p.x, p.y);
      usePreview.setState({ marquee: rect });
      useBoard.setState({ selectedIds: [...new Set([...d.base, ...marqueeHits(rect, getObjects())])] });
      return;
    }
    if (d.kind === 'resize') {
      if (d.ratio !== null) {
        // 画像は縦横の比率を保つ。短い辺が限度より小さくならないようにする。
        const minW = d.ratio >= 1 ? MIN_IMAGE : MIN_IMAGE / d.ratio;
        const w = Math.max(minW, d.startW + (e.clientX - d.startX) / zoom);
        setOverride(d.id, { w: Math.round(w), h: Math.round(w * d.ratio) });
        return;
      }
      if (d.widthOnly) {
        setOverride(d.id, {
          w: Math.round(Math.max(TEXT_MIN_WIDTH, d.startW + (e.clientX - d.startX) / zoom)),
          autoWidth: false,
        });
        return;
      }
      const w = d.axis === 'y' ? d.startW : Math.max(MIN_SECTION, d.startW + (e.clientX - d.startX) / zoom);
      const h = d.axis === 'x' ? d.startH : Math.max(MIN_SECTION, d.startH + (e.clientY - d.startY) / zoom);
      setOverride(d.id, { w: Math.round(w), h: Math.round(h) });
      return;
    }
    const sx = e.clientX - d.startX;
    const sy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(sx, sy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved && d.duplicate) startDuplicate(d);
    d.moved = true;
    // Shift を押している間は、大きく動かした方の向き（横か縦）だけに動かす
    const lock = e.shiftKey ? (Math.abs(sx) >= Math.abs(sy) ? 'x' : 'y') : null;
    let mx = lock === 'y' ? 0 : sx / zoom;
    let my = lock === 'x' ? 0 : sy / zoom;
    // 近くのものと端や中心がそろう位置に吸い付かせる（⌘ / Ctrl を押している間は吸い付かない。⌥ / Alt は複製に使う）。
    // 複数選んでいるときは、全体の外枠でそろえる。
    if (d.snapBox && d.snapTargets.length > 0 && !(e.metaKey || e.ctrlKey)) {
      const snap = snapRect({ ...d.snapBox, x: d.snapBox.x + mx, y: d.snapBox.y + my }, d.snapTargets, SNAP_DISTANCE_PX / zoom);
      if (lock !== 'y') mx += snap.dx;
      if (lock !== 'x') my += snap.dy;
      usePreview.setState({ guide: lock && snap.guide?.axis !== lock ? null : snap.guide });
    } else {
      usePreview.setState({ guide: null });
    }
    for (const id of d.ids) {
      const patch: ObjectPatch = { x: Math.round(d.start[id].x + mx), y: Math.round(d.start[id].y + my) };
      if (id === d.primaryId && d.newZ !== null) patch.z = d.newZ;
      setOverride(id, patch);
    }
    // スタンプを動かしている間は、置いたときに付く先の付箋を光らせる
    const moving = getObjects()[d.primaryId];
    if (moving?.type === 'stamp') {
      const pos = stampPosition(moving, getObjects());
      usePreview.setState({
        target: pos ? stampTargetStickyId(pos.x + STAMP_SIZE / 2, pos.y + STAMP_SIZE / 2) : null,
      });
    }
    // ドラッグ中の書き込みは一定間隔に間引く
    const wait = DRAG_WRITE_INTERVAL_MS - (Date.now() - d.lastWrite);
    if (wait <= 0) flushMove(d);
    else if (d.timer === undefined) {
      d.timer = window.setTimeout(() => {
        d.timer = undefined;
        if (drag.current === d) flushMove(d);
      }, wait);
    }
  };

  /**
   * Option＋ドラッグで動かし始めたとき：選んでいるものを同じ位置に複製し、ここからは複製の方を動かす。
   * 元のものはその場に残り、吸着の相手になる（元と縦横をそろえて置ける）。
   */
  const startDuplicate = (d: Extract<Drag, { kind: 'move' }>) => {
    const map = duplicateSelection(0, 0);
    if (!map) {
      // 複製できるものがない（スタンプだけなど）ときは、ふつうに動かす
      d.duplicate = false;
      return;
    }
    const objs = getObjects();
    for (const id of d.ids) {
      const o = objs[id];
      if (o && isBox(o)) d.snapTargets.push({ x: o.x, y: o.y, w: o.w, h: o.h });
    }
    const ids = d.ids.map((id) => map.get(id)).filter((id): id is string => !!id);
    const start: Record<string, { x: number; y: number }> = {};
    for (const id of d.ids) {
      const copy = map.get(id);
      if (copy) start[copy] = d.start[id];
    }
    d.ids = ids;
    d.start = start;
    d.primaryId = map.get(d.primaryId) ?? ids[0] ?? d.primaryId;
    d.newZ = null;
    d.selectOnClick = null;
    d.duplicated = true;
    ref.current?.classList.add('duplicating');
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    detach.current?.();
    ref.current?.classList.remove('duplicating');
    if (!d || d.kind === 'pan') return;

    if (d.kind === 'marquee') {
      usePreview.setState({ marquee: null });
      // 操作パネルを出すため、ドラッグが終わったことを画面に反映させる
      useBoard.setState((s) => ({ selectedIds: [...s.selectedIds] }));
      return;
    }

    if (d.kind === 'draw') {
      usePreview.setState({ draft: null });
      const dragged = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) >= DRAW_THRESHOLD_PX;
      const p = toCanvas(e.clientX, e.clientY);
      const drawn = rectBetween(d.startX, d.startY, p.x, p.y);
      addSection(
        dragged
          ? { ...drawn, w: Math.max(MIN_SECTION, drawn.w), h: Math.max(MIN_SECTION, drawn.h) }
          : defaultSectionRect(d.startX, d.startY),
      );
      useBoard.setState({ tool: { kind: 'select' } });
      return;
    }

    const objs = getObjects();
    if (d.kind === 'resize') {
      const s = objs[d.id];
      if (s?.type === 'text') {
        // 取っ手を動かしていない（クリック・ダブルクリック）なら何もしない。幅を変えたら「幅を決めた」状態にする
        if (useBoard.getState().overrides[d.id]?.w === undefined) return clearOverrides([d.id]);
        commitChanges(
          mergeChanges([
            { id: d.id, before: { w: d.startW, autoWidth: d.startAuto }, after: { w: s.w, autoWidth: false } },
            ...membershipChanges(objs, [d.id]),
          ]),
        );
        settleOverrides([d.id]);
        syncTextSize(d.id);
        return;
      }
      if (s?.type === 'image') {
        if (useBoard.getState().overrides[d.id]?.w === undefined) return clearOverrides([d.id]);
        // 大きさが変わると中心も動くので、所属するセクションを決め直す
        commitChanges(
          mergeChanges([
            { id: d.id, before: { w: d.startW, h: d.startH }, after: { w: s.w, h: s.h } },
            ...membershipChanges(objs, [d.id]),
          ]),
        );
        settleOverrides([d.id]);
        return;
      }
      if (!s || s.type !== 'section') return clearOverrides([d.id]);
      commitChanges(
        mergeChanges([
          { id: d.id, before: { w: d.startW, h: d.startH }, after: { w: s.w, h: s.h } },
          ...membershipChanges(objs),
        ]),
      );
      settleOverrides([d.id]);
      return;
    }

    window.clearTimeout(d.timer);
    usePreview.setState({ target: null, guide: null });
    if (!d.moved) {
      clearOverrides(d.ids);
      if (d.selectOnClick) useBoard.setState({ selectedIds: d.selectOnClick });
      return;
    }
    const changes: UndoChange[] = d.ids
      .filter((id) => objs[id])
      .map((id) => {
        const before: ObjectPatch = { x: d.start[id].x, y: d.start[id].y };
        const after: ObjectPatch = { x: objs[id].x, y: objs[id].y };
        if (id === d.primaryId && d.newZ !== null) {
          before.z = d.startZ;
          after.z = d.newZ;
        }
        return { id, before, after };
      });
    // 付箋を動かしたら所属セクションを、セクションを動かしたら範囲内の付箋を決め直す。
    // スタンプは置いた位置にある付箋・セクション（なければボード）に付け直す。
    const moved = d.ids.map((id) => objs[id]).filter((o) => o !== undefined);
    const retargets = moved.flatMap((o) => (o.type === 'stamp' ? stampRetarget(o, objs) : []));
    const memberIds = moved.filter(isMember).map((o) => o.id);
    const membership = moved.some((o) => o.type === 'section')
      ? membershipChanges(objs)
      : memberIds.length > 0
        ? membershipChanges(objs, memberIds)
        : [];
    commitChanges(mergeChanges([...changes, ...retargets, ...membership]), !d.duplicated);
    settleOverrides(d.ids);
  };

  const startDrag = (d: Drag) => {
    detach.current?.();
    drag.current = d;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    detach.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      detach.current = null;
    };
  };

  useEffect(() => () => detach.current?.(), []);

  const onObjectPointerDown = (e: ReactPointerEvent, id: string) => {
    const state = useBoard.getState();
    // 置くツールを選んでいるとき・スペースを押しているとき（画面の移動）は、キャンバス側でまとめて扱う
    if (state.tool.kind !== 'select' || e.button !== 0 || space.current) return;
    if (state.editingId === id) return;
    e.stopPropagation();
    // 編集中の文字があれば、先に確定させてから選択を切り替える
    (document.activeElement as HTMLElement | null)?.blur?.();
    const objs = getObjects();
    const obj = objs[id];
    if (!obj) return;

    // 複数選んでいる中の1つを押したら、選んでいるものをまとめて動かす。
    // Shift＋クリックは選択に足す・外す。Shift を押したままドラッグしたら、足した選択をまとめて縦か横に動かす。
    const current = state.selectedIds;
    const inGroup = current.length > 1 && current.includes(id);
    let selected: string[];
    let selectOnClick: string[] | null;
    if (e.shiftKey) {
      selected = current.includes(id) ? current : [...current, id];
      // 選んでいたものは、動かさずに離したときに外す（ドラッグしたときは外さずに一緒に動かす）
      selectOnClick = current.includes(id) ? current.filter((i) => i !== id) : null;
    } else {
      selected = inGroup ? current : [id];
      selectOnClick = inGroup ? [id] : null;
    }
    selected = selected.filter((i) => objs[i]);
    useBoard.setState({ selectedIds: selected, editingId: null });

    // セクションを動かすときは中の付箋も一緒に動かす。付け先と一緒に動くスタンプは別に動かさない。
    const moving = new Set(selected);
    for (const o of Object.values(objs)) {
      if (isMember(o) && o.parentId && moving.has(o.parentId)) moving.add(o.id);
    }
    for (const i of [...moving]) {
      const o = objs[i];
      if (o.type === 'stamp' && o.targetId && moving.has(o.targetId)) moving.delete(i);
      // 矢印は位置を持たず、両端と一緒に動く
      if (o.type === 'connector') moving.delete(i);
    }
    const ids = [...moving];
    const start: Record<string, { x: number; y: number }> = {};
    for (const i of ids) start[i] = { x: objs[i].x, y: objs[i].y };
    // 付箋とテキストは同じ層に重なるので、まとめて一番手前を求める（画像は画像だけの層）
    const layer = (o: BoardObject) => (o.type === 'sticky' || o.type === 'text' ? 'item' : o.type);
    const sameLayer = (o: BoardObject) => layer(o) === layer(obj);
    const topZ = Math.max(0, ...Object.values(objs).filter(sameLayer).map((o) => o.z));

    // 吸着は選んでいるもの全体の外枠でそろえる。相手は画面に見えているものだけで、
    // セクションを含むときはセクション同士、付箋・テキストだけならどれにでもそろえる。
    const boxes = selected.map((i) => objs[i]).filter(isBox);
    const snapBox: Rect | null =
      boxes.length > 0
        ? {
            x: Math.min(...boxes.map((o) => o.x)),
            y: Math.min(...boxes.map((o) => o.y)),
            w: Math.max(...boxes.map((o) => o.x + o.w)) - Math.min(...boxes.map((o) => o.x)),
            h: Math.max(...boxes.map((o) => o.y + o.h)) - Math.min(...boxes.map((o) => o.y)),
          }
        : null;
    const withSection = boxes.some((o) => o.type === 'section');
    const v = state.viewport;
    const el = ref.current!;
    const visible: Rect = {
      x: -v.offsetX / v.zoom,
      y: -v.offsetY / v.zoom,
      w: el.clientWidth / v.zoom,
      h: el.clientHeight / v.zoom,
    };
    const snapTargets: Rect[] = snapBox
      ? Object.values(objs)
          .filter(isBox)
          .filter((o: BoxObject) => !moving.has(o.id) && (!withSection || o.type === 'section') && overlaps(o, visible))
          .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
      : [];
    startDrag({
      kind: 'move',
      primaryId: id,
      ids,
      selectOnClick,
      snapBox,
      start,
      startZ: obj.z,
      // 1つだけ動かす付箋・スタンプは、掴んだら手前に出す
      newZ: selected.length === 1 && obj.type !== 'section' && obj.type !== 'connector' && obj.z < topZ ? Date.now() : null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      lastWrite: 0,
      timer: undefined,
      snapTargets,
      duplicate: e.altKey && obj.type !== 'connector',
      duplicated: false,
    });
  };

  const onResizeStart = (e: ReactPointerEvent, id: string, axis: 'x' | 'y' | null = null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const obj = getObjects()[id];
    if (!obj || (obj.type !== 'section' && obj.type !== 'text' && obj.type !== 'image')) return;
    // 文字に合わせて伸びているテキストは、保存されている幅ではなく表示中の幅から始める
    const shown = document.querySelector<HTMLElement>(`[data-id="${id}"]`)?.offsetWidth;
    const startAuto = obj.type === 'text' && !!obj.autoWidth;
    startDrag({
      kind: 'resize',
      id,
      widthOnly: obj.type === 'text',
      axis: obj.type === 'section' ? axis : null,
      ratio: obj.type === 'image' ? obj.h / obj.w : null,
      startAuto,
      startW: startAuto && shown ? Math.round(shown) : obj.w,
      startH: obj.h,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  const onCanvasPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const state = useBoard.getState();
    const { tool } = state;
    const v = state.viewport;
    const pan = () =>
      startDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, origX: v.offsetX, origY: v.offsetY });
    // スペース＋ドラッグは、どのツールを選んでいても画面を動かす（付箋などを置いたりはしない）。
    // ホイールボタンのドラッグも同じ。どちらも選択はそのまま。
    if (space.current || e.button === 1) {
      e.preventDefault();
      if (space.current) markSpacePanUsed();
      pan();
      return;
    }
    // コメントのツールでは、押した付箋のコメントのパネルを開く（付箋以外を押したら閉じる）
    if (tool.kind === 'comment') {
      const p = toCanvas(e.clientX, e.clientY);
      useBoard.setState({ commentTargetId: stickyAt(p.x, p.y) });
      return;
    }
    // 画面移動のツールでは、どこをドラッグしても画面を動かす（付箋の上から始めても付箋は動かさない）
    if (tool.kind === 'hand') {
      (document.activeElement as HTMLElement | null)?.blur?.();
      pan();
      return;
    }
    // 矢印のツール：押したもの（付箋・テキスト・画像）から矢印を伸ばす。ドラッグして離すか、クリックしてから先をクリックする。
    // クリックで伸ばしている途中に押したら、そこで決める（つなげるものならつなぎ、元のもの・何もないところならやめる）。
    // 引き終えても矢印のツールのまま（Esc で選択のツールに戻る）
    if (tool.kind === 'connector') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      const p = toCanvas(e.clientX, e.clientY);
      if (isConnectPending()) {
        finishPendingConnect(p);
        return;
      }
      const from = boxAt(p.x, p.y, getObjects());
      if (!from) return;
      usePreview.setState({ hover: null });
      beginConnect(from.id, e, toCanvas, { clickToConnect: true });
      return;
    }
    if (tool.kind !== 'select') {
      // 既定の動作（フォーカスの移動）を止め、置いた付箋の入力欄からフォーカスが外れないようにする
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      const p = toCanvas(e.clientX, e.clientY);
      if (tool.kind === 'stamp') {
        // スタンプは続けて押せるよう、ツールを選んだままにする
        addStamp(tool.stamp, p.x, p.y);
      } else if (tool.kind === 'sticky') {
        useBoard.setState({ tool: { kind: 'select' } });
        addSticky(p.x, p.y);
      } else if (tool.kind === 'text') {
        useBoard.setState({ tool: { kind: 'select' } });
        addText(p.x, p.y);
      } else if (tool.kind === 'section') {
        startDrag({ kind: 'draw', startX: p.x, startY: p.y, startClientX: e.clientX, startClientY: e.clientY });
      }
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    // タッチ操作では、指で範囲を描くより画面を動かすことのほうが多いので、1本指のドラッグで画面を動かす
    if (e.pointerType === 'touch') {
      useBoard.setState({ selectedIds: [], editingId: null });
      pan();
      return;
    }
    // 何もないところ（セクションの中の何もないところも含む）からドラッグすると、範囲で選ぶ。
    // Shift を押して始めたら、今の選択に足す。
    const base = e.shiftKey ? state.selectedIds : [];
    useBoard.setState({ selectedIds: base, editingId: null });
    const p = toCanvas(e.clientX, e.clientY);
    startDrag({
      kind: 'marquee',
      startX: p.x,
      startY: p.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      base,
      moved: false,
    });
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    const kind = target.dataset.kind;
    if (useBoard.getState().tool.kind !== 'select') return;
    if (kind !== 'background' && kind !== 'section-body') return;
    const p = toCanvas(e.clientX, e.clientY);
    addSticky(p.x, p.y);
  };

  const selectedSet = new Set(selectedIds);
  const selected = selectedIds.map((id) => objects[id]).filter((o) => o !== undefined);
  const commentTarget = commentTargetId ? objects[commentTargetId] : undefined;
  // 大きさの取っ手と「＋」は、1つだけ選んでいるときに出す
  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div
      ref={ref}
      className={`canvas${tool.kind !== 'select' && tool.kind !== 'hand' && tool.kind !== 'comment' ? ' placing' : ''}${tool.kind === 'comment' ? ' commenting' : ''}${tool.kind === 'hand' || spaceDown ? ' space-pan' : ''}`}
      data-kind="background"
      onPointerDown={onCanvasPointerDown}
      onPointerMove={(e) => {
        setPastePointer(e);
        const tool = useBoard.getState().tool;
        if (tool.kind === 'select' || tool.kind === 'hand') return;
        const point = toCanvas(e.clientX, e.clientY);
        if (tool.kind === 'connector') {
          // 押すと矢印を伸ばせるものに枠を出す（伸ばしている間は出さない）
          if (!usePreview.getState().connect) usePreview.setState({ hover: boxAt(point.x, point.y, getObjects())?.id ?? null });
          return;
        }
        // スタンプを押す前は付く先の付箋を、コメントのツールでは指している付箋を光らせる
        const target =
          tool.kind === 'stamp'
            ? stampTargetStickyId(point.x, point.y)
            : tool.kind === 'comment'
              ? stickyAt(point.x, point.y)
              : null;
        usePreview.setState({ point, target });
      }}
      onPointerLeave={() => {
        setPastePointer(null);
        usePreview.setState({ point: null, target: null, hover: null });
      }}
      onDoubleClick={onDoubleClick}
      // 画像のファイルをドロップしたら、その場所に貼る
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const files = imageFiles(e.dataTransfer.files);
        if (files.length === 0) return;
        e.preventDefault();
        insertImageFiles(files, toCanvas(e.clientX, e.clientY));
      }}
      style={{
        backgroundPosition: `${viewport.offsetX}px ${viewport.offsetY}px`,
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
      }}
    >
      <div
        className="world"
        style={{ transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom})` }}
      >
        <StampOutlineFilter />
        {sections.map((s) => (
          <Section
            key={s.id}
            section={s}
            selected={selectedSet.has(s.id)}
            resizable={single?.id === s.id}
            editing={s.id === editingId}
            onPointerDown={onObjectPointerDown}
            onResizeStart={onResizeStart}
          />
        ))}
        {images.map((s) => (
          <ImageBox
            key={s.id}
            image={s}
            selected={selectedSet.has(s.id)}
            resizable={single?.id === s.id}
            onPointerDown={onObjectPointerDown}
            onResizeStart={onResizeStart}
          />
        ))}
        {pendingImages.map((p) => (
          <PendingImageBox key={p.id} {...p} />
        ))}
        <ConnectorLayer
          connectors={connectors}
          objects={objects}
          selectedIds={selectedSet}
          editingId={editingId}
          onPointerDown={onObjectPointerDown}
        />
        {items.map((s) =>
          s.type === 'sticky' ? (
            <Sticky
              key={s.id}
              sticky={s}
              selected={selectedSet.has(s.id)}
              editing={s.id === editingId}
              onPointerDown={onObjectPointerDown}
            />
          ) : (
            <TextBox
              key={s.id}
              item={s}
              selected={selectedSet.has(s.id)}
              resizable={single?.id === s.id}
              editing={s.id === editingId}
              onPointerDown={onObjectPointerDown}
              onResizeStart={onResizeStart}
            />
          ),
        )}
        {stamps.map((s) => {
          const pos = stampPosition(s, objects);
          if (!pos) return null;
          return (
            <Stamp
              key={s.id}
              stamp={s}
              x={pos.x}
              y={pos.y}
              selected={selectedSet.has(s.id)}
              onPointerDown={onObjectPointerDown}
            />
          );
        })}
        <ConnectPreview objects={objects} />
        <PlacementPreview />
      </div>
      <SnapGuide />
      <SelectionMarquee />
      {single?.type === 'sticky' && !drag.current && tool.kind === 'select' && <AddNextButtons sticky={single} toCanvas={toCanvas} />}
      {selected.length > 0 && !drag.current && tool.kind !== 'comment' && (
        <SelectionToolbar selected={selected} objects={objects} />
      )}
      {commentTarget?.type === 'sticky' && <CommentPanel sticky={commentTarget} />}
      {tool.kind === 'connector' && <ConnectorHint />}
    </div>
  );
}
