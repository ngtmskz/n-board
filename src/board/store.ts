import { create } from 'zustand';
import type { BoardObject, ObjectPatch, StampKind } from '../types';

/** select・hand（画面移動）以外は「キャンバスをクリックした場所に置く」ツール */
export type Tool =
  | { kind: 'select' }
  | { kind: 'hand' }
  /** 押した付箋のコメントのパネルを開く（スタンプと同じく、続けて使える） */
  | { kind: 'comment' }
  | { kind: 'sticky' }
  | { kind: 'text' }
  | { kind: 'section' }
  /** 付箋などを押して、つなぎたい先までドラッグすると矢印を引く */
  | { kind: 'connector' }
  | { kind: 'stamp'; stamp: StampKind };

export interface Viewport {
  /** 画面左上に表示しているキャンバス座標にズームを掛けた値（screen = canvas * zoom + offset） */
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface BoardState {
  /** Firestore 上の状態（削除済みを除く） */
  server: Record<string, BoardObject>;
  /** ドラッグ・文字入力中など、まだ確定していない手元の変更 */
  overrides: Record<string, ObjectPatch>;
  /** 書き込み済みで、Firestore からの反映待ちの変更 */
  settling: Record<string, ObjectPatch>;
  /** 作成したばかりで、まだ Firestore から届いていないオブジェクト */
  created: Record<string, BoardObject>;
  /** 選んでいるもの（Shift＋クリックや範囲選択で複数選べる） */
  selectedIds: string[];
  editingId: string | null;
  /** コメントのパネルを開いている付箋 */
  commentTargetId: string | null;
  /** ボードの作成者（コメントを削除できるかの判定に使う） */
  boardOwnerUid: string | null;
  tool: Tool;
  viewport: Viewport;
}

export const useBoard = create<BoardState>(() => ({
  server: {},
  overrides: {},
  settling: {},
  created: {},
  selectedIds: [],
  editingId: null,
  commentTargetId: null,
  boardOwnerUid: null,
  tool: { kind: 'select' },
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
}));

export function resetBoardState() {
  useBoard.setState({
    server: {},
    overrides: {},
    settling: {},
    created: {},
    selectedIds: [],
    editingId: null,
    commentTargetId: null,
    boardOwnerUid: null,
    tool: { kind: 'select' },
  });
}

function matches(obj: BoardObject | undefined, patch: ObjectPatch) {
  if (!obj) return true;
  return Object.entries(patch).every(([k, v]) => (obj as unknown as Record<string, unknown>)[k] === v);
}

/** Firestore から届いた最新の状態を反映する。反映済みになった settling は消す。 */
export function setServerObjects(list: BoardObject[]) {
  const server: Record<string, BoardObject> = {};
  for (const o of list) server[o.id] = o;
  const state = useBoard.getState();
  const settling = { ...state.settling };
  for (const [id, patch] of Object.entries(settling)) {
    if (matches(server[id], patch)) delete settling[id];
  }
  const created = { ...state.created };
  for (const id of Object.keys(created)) if (server[id]) delete created[id];
  const exists = (id: string | null) => !!id && (!!server[id] || !!created[id]);
  useBoard.setState((s) => ({
    server,
    settling,
    created,
    selectedIds: s.selectedIds.filter(exists),
    editingId: exists(s.editingId) ? s.editingId : null,
    commentTargetId: exists(s.commentTargetId) ? s.commentTargetId : null,
  }));
}

/** 作成したオブジェクトを Firestore から届く前に表示する */
export function addCreated(obj: BoardObject) {
  useBoard.setState((s) => ({ created: { ...s.created, [obj.id]: obj } }));
  // 保存に失敗した場合（ルールで拒否など）に残り続けないようにする
  setTimeout(() => {
    useBoard.setState((s) => {
      if (!s.created[obj.id]) return {};
      const created = { ...s.created };
      delete created[obj.id];
      return { created };
    });
  }, 10_000);
}

/** 確定前の変更を手元にだけ反映する */
export function setOverride(id: string, patch: ObjectPatch) {
  useBoard.setState((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } } }));
}

/** 書き込みを済ませた変更を「反映待ち」に移す。Firestore から同じ値が届くまで手元の表示を保つ。 */
export function settleOverrides(ids: string[]) {
  useBoard.setState((s) => {
    const overrides = { ...s.overrides };
    const settling = { ...s.settling };
    for (const id of ids) {
      if (overrides[id]) settling[id] = { ...settling[id], ...overrides[id] };
      delete overrides[id];
    }
    return { overrides, settling };
  });
  // 書き込みに失敗した場合などに表示が固まらないよう、一定時間で解除する
  setTimeout(() => {
    useBoard.setState((s) => {
      const settling = { ...s.settling };
      for (const id of ids) delete settling[id];
      return { settling };
    });
  }, 3000);
}

/**
 * 書き込んだ変更を、Firestore から届く前に手元の表示へ反映する（色・大きさの変更、元に戻すなど）。
 * 新しく作った直後や、ブラウザが裏側にあるときは Firestore からの反映が遅れることがあるため。
 */
export function applyLocally(ops: { id: string; patch: ObjectPatch }[]) {
  if (ops.length === 0) return;
  useBoard.setState((s) => {
    const settling = { ...s.settling };
    for (const { id, patch } of ops) settling[id] = { ...settling[id], ...patch };
    return { settling };
  });
  setTimeout(() => {
    useBoard.setState((s) => {
      const settling = { ...s.settling };
      for (const { id } of ops) delete settling[id];
      return { settling };
    });
  }, 3000);
}

export function clearOverrides(ids: string[]) {
  useBoard.setState((s) => {
    const overrides = { ...s.overrides };
    for (const id of ids) delete overrides[id];
    return { overrides };
  });
}

/** 画面に表示する状態（Firestore の状態に手元の変更を重ねたもの） */
export function mergeObjects(
  server: Record<string, BoardObject>,
  created: Record<string, BoardObject>,
  settling: Record<string, ObjectPatch>,
  overrides: Record<string, ObjectPatch>,
): Record<string, BoardObject> {
  const result: Record<string, BoardObject> = { ...created, ...server };
  for (const layer of [settling, overrides]) {
    for (const [id, patch] of Object.entries(layer)) {
      if (result[id]) result[id] = { ...result[id], ...patch } as BoardObject;
    }
  }
  // 削除した直後（Firestore からの反映待ち）のものは表示しない
  for (const [id, o] of Object.entries(result)) if (o.deleted) delete result[id];
  return result;
}

export function getObjects() {
  const { server, created, settling, overrides } = useBoard.getState();
  return mergeObjects(server, created, settling, overrides);
}
