import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';

export const boardRef = (boardId: string) => doc(db, 'boards', boardId);
export const objectsCol = (boardId: string) => collection(db, 'boards', boardId, 'objects');
export const objectRef = (boardId: string, objectId: string) => doc(db, 'boards', boardId, 'objects', objectId);
export const commentsCol = (boardId: string) => collection(db, 'boards', boardId, 'comments');
export const commentRef = (boardId: string, commentId: string) => doc(db, 'boards', boardId, 'comments', commentId);
export const presenceCol = (boardId: string) => collection(db, 'boards', boardId, 'presence');
export const presenceRef = (boardId: string, uid: string) => doc(db, 'boards', boardId, 'presence', uid);
export const stateCol = (boardId: string) => collection(db, 'boards', boardId, 'state');
export const timerRef = (boardId: string) => doc(db, 'boards', boardId, 'state', 'timer');
export const bgmRef = (boardId: string) => doc(db, 'boards', boardId, 'state', 'bgm');
export const usersCol = collection(db, 'users');
export const userRef = (uid: string) => doc(db, 'users', uid);
export const historyCol = (uid: string) => collection(db, 'users', uid, 'history');
export const historyRef = (uid: string, boardId: string) => doc(db, 'users', uid, 'history', boardId);

/** 推測されにくいID（Firestore の自動ID：20文字の乱数） */
export function newId(): string {
  return doc(collection(db, '_')).id;
}
