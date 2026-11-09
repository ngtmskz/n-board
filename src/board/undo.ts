import { create } from 'zustand';
import { UNDO_LIMIT } from '../constants';
import { patchObjects } from '../data/objects';
import { applyLocally } from './store';
import type { ObjectPatch } from '../types';

/**
 * 元に戻す／やり直し。自分が行った操作だけをこの画面の中で記録する。
 * 操作はすべて「項目の変更前・変更後」で表す。作成は deleted:true→false、削除は false→true。
 */
export interface UndoChange {
  id: string;
  before: ObjectPatch;
  after: ObjectPatch;
}

interface UndoState {
  boardId: string | null;
  undoStack: UndoChange[][];
  redoStack: UndoChange[][];
}

export const useUndo = create<UndoState>(() => ({ boardId: null, undoStack: [], redoStack: [] }));

export function resetUndo(boardId: string) {
  useUndo.setState({ boardId, undoStack: [], redoStack: [] });
}

export function recordUndo(changes: UndoChange[]) {
  const meaningful = changes.filter((c) => Object.keys(c.after).length > 0);
  if (meaningful.length === 0) return;
  useUndo.setState((s) => ({
    undoStack: [...s.undoStack, meaningful].slice(-UNDO_LIMIT),
    redoStack: [],
  }));
}

async function apply(changes: UndoChange[], key: 'before' | 'after') {
  const { boardId } = useUndo.getState();
  if (!boardId) return;
  const ops = changes.map((c) => ({ id: c.id, patch: c[key] }));
  applyLocally(ops);
  try {
    await patchObjects(boardId, ops);
  } catch (e) {
    // 対象がボードごと削除されている場合など。記録は捨てる。
    console.warn('元に戻せませんでした', e);
  }
}

export function undo() {
  const { undoStack, redoStack } = useUndo.getState();
  const changes = undoStack.at(-1);
  if (!changes) return;
  useUndo.setState({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, changes] });
  void apply(changes, 'before');
}

export function redo() {
  const { undoStack, redoStack } = useUndo.getState();
  const changes = redoStack.at(-1);
  if (!changes) return;
  useUndo.setState({ redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, changes] });
  void apply(changes, 'after');
}
