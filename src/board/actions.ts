// ボード上の操作。Firestore への書き込みと「元に戻す」の記録をまとめて行う。
import { create as createStore } from 'zustand';
import { currentUser, toUserRef } from '../auth';
import { SECTION_DEFAULT, STAMP_SIZE, STICKY_SIZE, TEXT_DEFAULT, TEXT_LINE_HEIGHT, TEXT_PADDING_Y } from '../constants';
import { t } from '../i18n';
import { getBlob, ref } from 'firebase/storage';
import { toast } from '../components/Toast';
import { imagePath, rememberImage, uploadImage } from '../data/images';
import { storage } from '../firebase';
import { createObject, patchObjects, type NewObject, type PatchOp } from '../data/objects';
import { getDoc } from 'firebase/firestore';
import { historyRef, newId } from '../data/refs';
import { prepareImage, type ImageError } from '../lib/imageFile';
import type {
  BoardObject,
  ImageObject,
  ObjectPatch,
  SectionColor,
  SectionObject,
  StampKind,
  StickyColor,
  StickyObject,
  TextColor,
  TextObject,
  TextSize,
} from '../types';
import { clipPlainText, collectForCopy, encodeClip, PASTE_CASCADE, planDuplicate, planPaste, type ClipItem, type PastePlan } from './clipboard';
import { connectorDirection, connectorLine, findParentSection, findStampTarget, isConnectable, type ArrowDirection, type Rect } from './geometry';
import { nextStickySlot, type Direction } from './snap';
import { addCreated, applyLocally, getObjects, useBoard } from './store';
import { recordUndo, type UndoChange } from './undo';

let boardId = '';

/**
 * 次に置く付箋の色（最後に選んだ色）と幅（ツールバーで選んだ形）。
 * ツールバーのアイコンや置く前のプレビューにも出す。最初は黄色の正方形で、ページを開き直すと戻る。
 */
interface NextSticky {
  color: StickyColor;
  w: number;
}
export const useNextSticky = createStore<NextSticky>(() => ({
  color: 'yellow',
  w: STICKY_SIZE,
}));

export function setActiveBoard(id: string) {
  boardId = id;
}

export function activeBoardId() {
  return boardId;
}


/** 新しく作るものを手前に出すための重なり順 */
function nextZ() {
  return Date.now();
}

function report(e: unknown) {
  console.error(e);
  window.dispatchEvent(new CustomEvent('nboard:error', { detail: t('common.saveFailed') }));
}

/**
 * まとめて書き込み、元に戻すに記録する。before は各項目の変更前の値。
 * record が false なら記録しない（複製したものを置いた位置など、作ったことだけを記録すればよいとき）。
 */
export function commitChanges(changes: UndoChange[], record = true) {
  const ops: PatchOp[] = changes
    .filter((c) => Object.keys(c.after).length > 0)
    .map((c) => ({ id: c.id, patch: c.after }));
  if (ops.length === 0) return;
  if (record) recordUndo(changes);
  applyLocally(ops);
  patchObjects(boardId, ops).catch(report);
}

/** obj の、patch に含まれる項目の現在値 */
export function pickBefore(obj: BoardObject, patch: ObjectPatch): ObjectPatch {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) before[key] = (obj as unknown as Record<string, unknown>)[key];
  return before as ObjectPatch;
}

function sections(objects: Record<string, BoardObject>) {
  return Object.values(objects).filter((o): o is SectionObject => o.type === 'section');
}

function stickies(objects: Record<string, BoardObject>) {
  return Object.values(objects).filter((o): o is StickyObject => o.type === 'sticky');
}

/** セクションに所属できるもの（付箋・テキスト・画像）。セクションを動かすと一緒に動く。 */
export function isMember(o: BoardObject): o is StickyObject | TextObject | ImageObject {
  return o.type === 'sticky' || o.type === 'text' || o.type === 'image';
}

function members(objects: Record<string, BoardObject>) {
  return Object.values(objects).filter(isMember);
}

/**
 * 付箋・テキストがどのセクションに入っているかを位置から決め直し、変わるものの変更を返す。
 * objects には移動後の位置を反映しておく。
 */
export function membershipChanges(objects: Record<string, BoardObject>, onlyIds?: string[]): UndoChange[] {
  const secs = sections(objects);
  const changes: UndoChange[] = [];
  for (const s of members(objects)) {
    if (onlyIds && !onlyIds.includes(s.id)) continue;
    const parentId = findParentSection(s, secs)?.id ?? null;
    if (parentId !== s.parentId) changes.push({ id: s.id, before: { parentId: s.parentId }, after: { parentId } });
  }
  return changes;
}

/** 同じIDへの変更をひとつにまとめる（before は最初の値、after は最後の値） */
export function mergeChanges(changes: UndoChange[]): UndoChange[] {
  const map = new Map<string, UndoChange>();
  for (const c of changes) {
    const prev = map.get(c.id);
    if (!prev) map.set(c.id, { id: c.id, before: { ...c.before }, after: { ...c.after } });
    else map.set(c.id, { id: c.id, before: { ...c.before, ...prev.before }, after: { ...prev.after, ...c.after } });
  }
  return [...map.values()];
}

/** 作成して、Firestore から届く前に手元にも表示する */
function create(id: string, data: NewObject) {
  createObject(boardId, id, data).catch(report);
  const user = currentUser();
  addCreated({
    ...data,
    id,
    createdBy: toUserRef(user),
    createdAt: null,
    updatedBy: user.uid,
    updatedAt: null,
    deleted: false,
    locked: false,
  } as BoardObject);
}

/** 付箋を作り、すぐ文字を入れられるようにする */
function createSticky(rect: Rect, color: StickyColor): string {
  const id = newId();
  const parent = findParentSection(rect, sections(getObjects()));
  create(id, {
    type: 'sticky',
    ...rect,
    z: nextZ(),
    text: '',
    color,
    parentId: parent?.id ?? null,
  });
  recordUndo([{ id, before: { deleted: true }, after: { deleted: false } }]);
  useBoard.setState({ selectedIds: [id], editingId: id });
  return id;
}

export function addSticky(x: number, y: number): string {
  const { w, color } = useNextSticky.getState();
  return createSticky({ x: x - w / 2, y: y - STICKY_SIZE / 2, w, h: STICKY_SIZE }, color);
}

/** 選んでいる付箋の「＋」：同じ色の付箋を、決まった間隔をあけて隣に足す */
export function addStickyNextTo(id: string, direction: Direction): string | null {
  const objects = getObjects();
  const from = objects[id];
  if (!from || from.type !== 'sticky') return null;
  const rect = nextStickySlot({ x: from.x, y: from.y, w: from.w, h: from.h }, direction, members(objects));
  return createSticky(rect, from.color);
}

/** 同じ向きの矢印がすでにあるか */
function connected(objects: Record<string, BoardObject>, fromId: string, toId: string) {
  return Object.values(objects).some((o) => o.type === 'connector' && o.fromId === fromId && o.toId === toId);
}

/**
 * from から to への矢印を作り、選んだ状態にする。同じものどうし・同じ向きの矢印がすでにあるときは作らない。
 * 作った矢印の ID を返す。
 */
export function addConnector(fromId: string, toId: string): string | null {
  const objects = getObjects();
  const from = objects[fromId];
  const to = objects[toId];
  if (fromId === toId || !from || !to || !isConnectable(from) || !isConnectable(to) || connected(objects, fromId, toId)) return null;
  const id = newId();
  create(id, { type: 'connector', x: 0, y: 0, z: nextZ(), fromId, toId, label: '' });
  recordUndo([{ id, before: { deleted: true }, after: { deleted: false } }]);
  useBoard.setState({ selectedIds: [id], editingId: null });
  return id;
}

/**
 * 矢印を伸ばして何もないところで離したときに作るもの。元と同じ種類にする：
 * 付箋からは同じ色・形の付箋、テキストからは同じ大きさ・色のテキスト。画像からは作らない（null）。
 * w・h は置く位置を決めるための大きさ（テキストは1行分。幅は文字に合わせて伸びる）。
 */
export type ConnectedLook =
  | { kind: 'sticky'; color: StickyColor; w: number; h: number }
  | { kind: 'text'; color: TextColor; fontSize: TextSize; w: number; h: number };

export function connectedLook(fromId: string): ConnectedLook | null {
  const from = getObjects()[fromId];
  if (from?.type === 'sticky') return { kind: 'sticky', color: from.color, w: from.w, h: from.h };
  if (from?.type === 'text') {
    const h = Math.round(from.fontSize * TEXT_LINE_HEIGHT + TEXT_PADDING_Y * 2);
    // 空のテキストは「テキスト」と薄く出るので、その幅（4文字分と左右の余白）で置く。文字を入れると右に伸びる
    return { kind: 'text', color: from.color, fontSize: from.fontSize, w: Math.round(from.fontSize * 4 + 12), h };
  }
  return null;
}

/**
 * 矢印を伸ばして何もないところで離したとき：rect の位置に、元と同じ種類のもの（connectedLook）を作り、矢印でつなぐ。
 * 元に戻すは1回で両方消える。作ったものはすぐ文字を入れられるようにする。
 */
export function addConnectedItem(fromId: string, rect: Rect): string | null {
  const objects = getObjects();
  const look = connectedLook(fromId);
  if (!objects[fromId] || !look) return null;
  const id = newId();
  const parentId = findParentSection(rect, sections(objects))?.id ?? null;
  if (look.kind === 'sticky') {
    create(id, { type: 'sticky', ...rect, z: nextZ(), text: '', color: look.color, parentId });
  } else {
    create(id, { type: 'text', ...rect, z: nextZ(), text: '', fontSize: look.fontSize, color: look.color, autoWidth: true, parentId });
  }
  const connectorId = newId();
  create(connectorId, { type: 'connector', x: 0, y: 0, z: nextZ(), fromId, toId: id, label: '' });
  recordUndo([
    { id, before: { deleted: true }, after: { deleted: false } },
    { id: connectorId, before: { deleted: true }, after: { deleted: false } },
  ]);
  useBoard.setState({ selectedIds: [id], editingId: id });
  // テキストは表示された大きさを保存し、矢印の先を実際の文字の位置に合わせる
  if (look.kind === 'text') syncTextSize(id);
  return id;
}

/**
 * 矢印の向きを、画面で見たままの向きで変える（→ ← ↔、縦に近い矢印なら ↓ ↑ ↕）。
 * → / ← はつなぎ元とつなぎ先を入れ替えて表し、↔ は両向きにする。
 */
export function setConnectorDirection(ids: string[], direction: ArrowDirection) {
  const objects = getObjects();
  const changes: UndoChange[] = [];
  for (const id of ids) {
    const o = objects[id];
    if (o?.type !== 'connector') continue;
    const line = connectorLine(o, objects);
    if (!line) continue;
    const current = connectorDirection(o, line).direction;
    if (current === direction) continue;
    const before: ObjectPatch = { bothEnds: !!o.bothEnds };
    const after: ObjectPatch = { bothEnds: direction === 'both' };
    // 片向きにするときは、矢じりが付くつなぎ先が、選んだ向きの側（→ なら右、← なら左）になるように入れ替える
    if (direction !== 'both') {
      const toIsForward = connectorDirection({ ...o, bothEnds: false }, line).direction === 'forward';
      if (toIsForward !== (direction === 'forward')) {
        before.fromId = o.fromId;
        before.toId = o.toId;
        after.fromId = o.toId;
        after.toId = o.fromId;
      }
    }
    changes.push({ id, before, after });
  }
  commitChanges(changes);
}

/** 中心の位置に標準サイズのセクションを置くときの範囲 */
export function defaultSectionRect(cx: number, cy: number): Rect {
  const { w, h } = SECTION_DEFAULT;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function addSection(rect: Rect): string {
  const id = newId();
  const section: Omit<SectionObject, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deleted' | 'locked'> = {
    id,
    type: 'section',
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
    // セクションは付箋より奥に表示するが、セクション同士は新しいものを手前にする
    z: nextZ(),
    title: t('section.defaultTitle'),
    color: 'gray',
  };
  const { id: _omit, ...data } = section;
  create(id, data);
  // セクションの範囲内にある付箋を取り込む
  const objects = { ...getObjects(), [id]: { ...section, deleted: false, locked: false } as SectionObject };
  const adopt = membershipChanges(objects);
  if (adopt.length) patchObjects(boardId, adopt.map((c) => ({ id: c.id, patch: c.after }))).catch(report);
  recordUndo([{ id, before: { deleted: true }, after: { deleted: false } }, ...adopt]);
  useBoard.setState({ selectedIds: [id], editingId: null });
  return id;
}

/**
 * テキストを置く。クリックした位置が1行目の中央の高さになるようにする。
 * 文字を渡したとき（⌘V で貼ったとき）は、その文字を入れて選んだ状態にする。なければすぐ文字を入れられるようにする。
 */
export function addText(x: number, y: number, text = ''): string {
  const id = newId();
  const { w, fontSize, color } = TEXT_DEFAULT;
  const h = Math.round(fontSize * TEXT_LINE_HEIGHT + TEXT_PADDING_Y * 2);
  const rect = { x: Math.round(x), y: Math.round(y - h / 2), w, h };
  const parent = findParentSection(rect, sections(getObjects()));
  create(id, {
    type: 'text',
    ...rect,
    z: nextZ(),
    text,
    fontSize,
    color,
    autoWidth: true,
    parentId: parent?.id ?? null,
  });
  recordUndo([{ id, before: { deleted: true }, after: { deleted: false } }]);
  useBoard.setState({ selectedIds: [id], editingId: text ? null : id });
  // 貼った文字は、表示された大きさを保存する（セクションの所属や「全体を表示」に使う）
  if (text) syncTextSize(id);
  return id;
}

export function setTextSize(id: string, fontSize: TextSize) {
  const obj = getObjects()[id];
  if (!obj || obj.type !== 'text' || obj.fontSize === fontSize) return;
  commitChanges([{ id, before: { fontSize: obj.fontSize }, after: { fontSize } }]);
  syncTextSize(id);
}

/** 取っ手で幅を決めたテキストを、文字に合わせて伸びる状態に戻す */
export function setTextAutoWidth(id: string) {
  const obj = getObjects()[id];
  if (!obj || obj.type !== 'text' || obj.autoWidth) return;
  commitChanges([{ id, before: { autoWidth: false, w: obj.w }, after: { autoWidth: true } }]);
  syncTextSize(id);
}

/**
 * テキストの大きさを、画面に表示されている大きさに合わせて保存する（元に戻すには記録しない）。
 * 高さは常に、幅は文字に合わせて伸びるときだけ測る。セクションの所属判定や「全体を表示」に使う。
 * 文字・大きさ・幅を変えたあとに呼ぶ。表示が更新されるのを待ってから測る。
 */
export function syncTextSize(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const obj = getObjects()[id];
    if (!el || !obj || obj.type !== 'text') return;
    const patch: ObjectPatch = {};
    const h = Math.round(el.offsetHeight);
    if (Math.abs(h - obj.h) > 1) patch.h = h;
    if (obj.autoWidth) {
      const w = Math.round(el.offsetWidth);
      if (Math.abs(w - obj.w) > 1) patch.w = w;
    }
    if (Object.keys(patch).length) patchObjects(boardId, [{ id, patch }]).catch(report);
  });
}

/** スタンプの中心が (px, py) にあるとき、付く先の付箋の ID（付箋でなければ null）。付く先を光らせるのに使う。 */
export function stampTargetStickyId(px: number, py: number): string | null {
  const objects = getObjects();
  const target = findStampTarget(px, py, stickies(objects), sections(objects));
  return target?.type === 'sticky' ? target.id : null;
}

export function addStamp(kind: StampKind, px: number, py: number) {
  const objects = getObjects();
  const target = findStampTarget(px, py, stickies(objects), sections(objects));
  const id = newId();
  const x = px - STAMP_SIZE / 2 - (target?.x ?? 0);
  const y = py - STAMP_SIZE / 2 - (target?.y ?? 0);
  create(id, { type: 'stamp', x, y, z: nextZ(), stampKind: kind, targetId: target?.id ?? null });
  recordUndo([{ id, before: { deleted: true }, after: { deleted: false } }]);
}

/** 貼った文字の長さの上限（テキストの上限と合わせる） */
const MAX_TEXT_LENGTH = 2000;

/**
 * ⌘V で貼った文字を、(x, y) にテキストとして置く。表の複数のセルは、行を改行・列を空白でつなぐ。
 * 長すぎるときは切り詰めて true を返す。
 */
export function addPastedText(raw: string, x: number, y: number): boolean {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').trimEnd())
    .join('\n')
    .trim();
  if (!text) return false;
  addText(x, y, text.slice(0, MAX_TEXT_LENGTH));
  return text.length > MAX_TEXT_LENGTH;
}

/** 貼った画像の最初の表示の大きさ（長い辺）。元の画像がこれより小さいときは元の大きさ。 */
const IMAGE_DISPLAY_SIDE = 400;
/** 何枚かまとめて貼ったときに、少しずつずらす幅 */
const IMAGE_CASCADE = 32;

/** アップロード中の画像（貼った本人の画面だけに「読み込み中」の枠を出す） */
export interface PendingImage {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const usePendingImages = createStore<{ list: PendingImage[] }>(() => ({ list: [] }));

function setPending(update: (list: PendingImage[]) => PendingImage[]) {
  usePendingImages.setState((s) => ({ list: update(s.list) }));
}

/**
 * 画像を貼る。(x, y) を中心に置き、何枚かあるときは少しずつずらす。
 * 画像を縮めて Storage に置いてから、ボードに画像を作る（ほかの人には、置き終わってから見える）。
 * 貼れなかった画像の理由を返す。
 */
export async function addImages(files: File[], x: number, y: number): Promise<ImageError[]> {
  const board = boardId;
  const errors: ImageError[] = [];
  const created: string[] = [];
  await Promise.all(
    files.map(async (file, i) => {
      const prepared = await prepareImage(file);
      if (typeof prepared === 'string') {
        errors.push(prepared);
        return;
      }
      const scale = Math.min(1, IMAGE_DISPLAY_SIDE / Math.max(prepared.width, prepared.height));
      const w = Math.max(20, Math.round(prepared.width * scale));
      const h = Math.max(20, Math.round(prepared.height * scale));
      const rect = {
        x: Math.round(x - w / 2 + i * IMAGE_CASCADE),
        y: Math.round(y - h / 2 + i * IMAGE_CASCADE),
        w,
        h,
      };
      const id = newId();
      const src = imagePath(board, id, prepared.contentType);
      setPending((list) => [...list, { id, ...rect }]);
      try {
        await uploadImage(src, prepared.blob, prepared.contentType);
      } catch (e) {
        console.error(e);
        errors.push('unreadable');
        return;
      } finally {
        setPending((list) => list.filter((p) => p.id !== id));
      }
      // 待っている間に別のボードへ移っていたら作らない
      if (boardId !== board) return;
      rememberImage(src, prepared.blob);
      const parent = findParentSection(rect, sections(getObjects()));
      create(id, { type: 'image', ...rect, z: nextZ(), src, parentId: parent?.id ?? null });
      created.push(id);
    }),
  );
  if (created.length) {
    recordUndo(created.map((id) => ({ id, before: { deleted: true }, after: { deleted: false } })));
    useBoard.setState({ selectedIds: created, editingId: null });
  }
  return errors;
}

/** まとめて削除する（元に戻すは1回でまとめて戻る） */
export function deleteObjects(ids: string[]) {
  const objects = getObjects();
  const changes: UndoChange[] = [];
  for (const id of ids) {
    const obj = objects[id];
    if (!obj) continue;
    changes.push({ id, before: { deleted: false }, after: { deleted: true } });
    if (obj.type === 'section') {
      // セクションを消しても中の付箋・テキストは残す（セクションから外すだけ）
      for (const s of members(objects)) {
        if (s.parentId === id) changes.push({ id: s.id, before: { parentId: id }, after: { parentId: null } });
      }
    }
  }
  commitChanges(mergeChanges(changes));
  useBoard.setState({ selectedIds: [], editingId: null });
}

/** 付箋の形（幅）を変える。正方形は STICKY_SIZE、横長は STICKY_WIDE_WIDTH。左端の位置はそのまま。 */
export function setStickyWidth(ids: string[], w: number) {
  const objects = getObjects();
  const next = { ...objects };
  const changes: UndoChange[] = [];
  for (const id of ids) {
    const obj = objects[id];
    if (!obj || obj.type !== 'sticky' || obj.w === w) continue;
    changes.push({ id, before: { w: obj.w }, after: { w } });
    next[id] = { ...obj, w };
  }
  if (changes.length === 0) return;
  // 幅が変わると中心も動くので、所属するセクションを決め直す
  commitChanges(mergeChanges([...changes, ...membershipChanges(next, changes.map((c) => c.id))]));
}

/** まとめて色を変える（同じ種類のものを選んでいるとき） */
export function setColors(ids: string[], color: StickyColor | SectionColor | TextColor) {
  const objects = getObjects();
  const changes: UndoChange[] = [];
  for (const id of ids) {
    const obj = objects[id];
    if (!obj || obj.type === 'stamp' || obj.type === 'image' || obj.type === 'connector' || obj.color === color) continue;
    if (obj.type === 'sticky') useNextSticky.setState({ color: color as StickyColor });
    changes.push({ id, before: { color: obj.color }, after: { color } });
  }
  commitChanges(changes);
}

/** 文字入力中の途中保存（元に戻すには記録しない） */
export function saveDraft(id: string, patch: ObjectPatch) {
  patchObjects(boardId, [{ id, patch }]).catch(report);
}

export function writePositions(ops: PatchOp[]) {
  patchObjects(boardId, ops).catch(report);
}

/** 選んでいるものをクリップボードに入れる形にする（⌘C・⌘X）。選んでいなければ null。 */
export function copySelection(): { html: string; text: string; count: number } | null {
  const items = collectForCopy(useBoard.getState().selectedIds, getObjects());
  if (items.length === 0) return null;
  return { html: encodeClip(items), text: clipPlainText(items), count: items.length };
}

/**
 * コピーしたものを (x, y) を中心に貼り、貼ったものを選んだ状態にする。
 * 別のボードからコピーした画像は、このボードの置き場所にファイルを写してから作る。
 * 写すのは自分が開いたことのある（履歴にある）ボードの画像だけで、写せなかった画像は貼らない。
 */
export async function pasteClip(items: ClipItem[], x: number, y: number) {
  const board = boardId;
  const plans = planPaste(items, { x, y }, getObjects(), newId, nextZ());
  let imageFailed = false;
  await Promise.all(
    plans.map(async (p) => {
      if (!p.copyFrom || p.copyFrom.startsWith(`boards/${board}/`)) return;
      try {
        // 写すのは、自分が開いたことのあるボードの画像だけ。よそで作られたデータに、自分しか開けないボードの
        // 画像の置き場所を書かれていても、それをほかの人が見られるボードへ写さないようにする。
        const from = p.copyFrom.split('/')[1];
        if (!(await getDoc(historyRef(currentUser().uid, from))).exists()) throw new Error(`開いたことのないボードの画像: ${from}`);
        const blob = await getBlob(ref(storage, p.copyFrom));
        const ext = p.copyFrom.split('.').pop()!;
        const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const src = imagePath(board, newId(), contentType);
        await uploadImage(src, blob, contentType);
        rememberImage(src, blob);
        (p.data as { src: string }).src = src;
      } catch (e) {
        console.error(e);
        imageFailed = true;
        p.copyFrom = undefined;
        p.id = '';
      }
    }),
  );
  // 待っている間に別のボードへ移っていたら作らない
  if (boardId !== board) return;
  const targetOf = (p: PastePlan) => (p.data.type === 'stamp' ? p.data.targetId : null);
  const made = (id: string | null) => !id || plans.some((q) => q.id && q.id === id);
  // 付け先の画像を貼れなかったスタンプ、端の画像を貼れなかった矢印も貼らない
  const created = plans.filter(
    (p) => p.id && made(targetOf(p)) && (p.data.type !== 'connector' || (made(p.data.fromId) && made(p.data.toId))),
  );
  for (const p of created) create(p.id, p.data);
  if (created.length) {
    recordUndo(created.map((p) => ({ id: p.id, before: { deleted: true }, after: { deleted: false } })));
    // 付け先と一緒に動くスタンプは選ばない（範囲選択と同じ）
    useBoard.setState({ selectedIds: created.filter((p) => !targetOf(p)).map((p) => p.id), editingId: null });
    for (const p of created) if (p.data.type === 'text') syncTextSize(p.id);
  }
  if (imageFailed) toast(t('clip.imageFailed'));
}

/**
 * 選んでいるものを複製し、(dx, dy) ずらして置く（Option＋ドラッグ・⌘D）。何を複製するかは ⌘C と同じ
 * （セクションの中身と、一緒に複製するもの同士の矢印も入れる。付箋に押されたスタンプとコメントは入れない）。
 * 元に戻すは1回でまとめて消える。複製したもののうち、選んでいたものに当たるものを選んだ状態にする。
 * 元の ID → 複製の ID の対応を返す。何も複製しなければ null。
 */
export function duplicateSelection(dx: number, dy: number): Map<string, string> | null {
  const { selectedIds } = useBoard.getState();
  const objects = getObjects();
  const items = collectForCopy(selectedIds, objects);
  // スタンプと矢印だけでは複製しない
  if (!items.some((i) => i.type !== 'stamp' && i.type !== 'connector')) return null;
  const plans = planDuplicate(items, dx, dy, objects, newId, nextZ());
  if (plans.length === 0) return null;
  for (const p of plans) create(p.id, p.data);
  recordUndo(plans.map((p) => ({ id: p.id, before: { deleted: true }, after: { deleted: false } })));
  const map = new Map(plans.map((p) => [p.sourceKey, p.id]));
  useBoard.setState({
    selectedIds: selectedIds.map((id) => map.get(id)).filter((id): id is string => !!id),
    editingId: null,
  });
  return map;
}

/** ⌘D・操作パネルの「複製」：少し右下にずらして複製する */
export function duplicateInPlace() {
  duplicateSelection(PASTE_CASCADE, PASTE_CASCADE);
}
