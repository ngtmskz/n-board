import { onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type FirestoreError } from 'firebase/firestore';
import { currentUser, toUserRef } from '../auth';
import type { BoardComment } from '../types';
import { commentRef, commentsCol, newId } from './refs';

/** コメントの本文の上限（ルールと合わせる） */
export const COMMENT_MAX_LENGTH = 1000;

/** 削除されていないコメントをすべて購読する */
export function subscribeComments(
  boardId: string,
  onChange: (comments: BoardComment[]) => void,
  onError: (error: FirestoreError) => void,
) {
  const q = query(commentsCol(boardId), where('deleted', '==', false));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as BoardComment),
      ),
    onError,
  );
}

export function addComment(boardId: string, targetId: string, text: string) {
  return setDoc(commentRef(boardId, newId()), {
    targetId,
    text,
    createdBy: toUserRef(currentUser()),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    edited: false,
    deleted: false,
  });
}

/** 本文を直す（書いた本人だけ） */
export function editComment(boardId: string, commentId: string, text: string) {
  return updateDoc(commentRef(boardId, commentId), { text, edited: true, updatedAt: serverTimestamp() });
}

/** 削除する（書いた本人とボード作成者）。付箋と同じく、消した印を付けるだけ。 */
export function deleteComment(boardId: string, commentId: string) {
  return updateDoc(commentRef(boardId, commentId), { deleted: true, updatedAt: serverTimestamp() });
}
