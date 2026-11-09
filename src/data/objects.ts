import {
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type FirestoreError,
} from 'firebase/firestore';
import { currentUser, toUserRef } from '../auth';
import { db } from '../firebase';
import type { BoardObject, ObjectPatch } from '../types';
import { objectRef, objectsCol } from './refs';

/** 削除されていないオブジェクトをすべて購読する */
export function subscribeObjects(
  boardId: string,
  onChange: (objects: BoardObject[]) => void,
  onError: (error: FirestoreError) => void,
) {
  const q = query(objectsCol(boardId), where('deleted', '==', false));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as BoardObject),
      ),
    onError,
  );
}

type ManagedKeys = 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deleted' | 'locked';
/** 新規作成時に画面側で指定する項目（作成者・日時などはここで付ける） */
export type NewObject = BoardObject extends infer T ? (T extends BoardObject ? Omit<T, ManagedKeys> : never) : never;

export function createObject(boardId: string, id: string, data: NewObject) {
  const user = currentUser();
  return setDoc(objectRef(boardId, id), {
    ...data,
    createdBy: toUserRef(user),
    createdAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
    deleted: false,
    locked: false,
  });
}

export interface PatchOp {
  id: string;
  patch: ObjectPatch;
}

/** 複数のオブジェクトをまとめて更新する（セクションと中の付箋の移動など） */
export function patchObjects(boardId: string, ops: PatchOp[]) {
  if (ops.length === 0) return Promise.resolve();
  const user = currentUser();
  const batch = writeBatch(db);
  for (const { id, patch } of ops) {
    batch.update(objectRef(boardId, id), { ...patch, updatedBy: user.uid, updatedAt: serverTimestamp() });
  }
  return batch.commit();
}
