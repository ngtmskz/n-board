import {
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type FirestoreError,
} from 'firebase/firestore';
import { currentUser, displayName } from '../auth';
import { t } from '../i18n';
import { db } from '../firebase';
import { SCHEMA_VERSION, type Board, type HistoryEntry, type Visibility } from '../types';
import { deleteBoardImages } from './images';
import { boardRef, commentsCol, historyCol, historyRef, newId, objectsCol, presenceCol, stateCol } from './refs';

export async function createBoard(): Promise<string> {
  const user = currentUser();
  const id = newId();
  await setDoc(boardRef(id), {
    // ボード名の初期値は、作った人の表示の言語で付ける
    title: t('board.untitled'),
    ownerUid: user.uid,
    ownerName: displayName(user).slice(0, 100),
    visibility: 'link',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  });
  return id;
}

/** ボードを購読する。存在しない（削除された）場合は null を渡す。 */
export function subscribeBoard(
  boardId: string,
  onChange: (board: Board | null) => void,
  onError: (error: FirestoreError) => void,
) {
  return onSnapshot(
    boardRef(boardId),
    (snap) => onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Board) : null),
    onError,
  );
}

export function renameBoard(boardId: string, title: string) {
  return updateDoc(boardRef(boardId), { title, updatedAt: serverTimestamp() });
}

/** 共有範囲と招待した人を変える（作成者のみ）。招待した人の一覧は、共有範囲を戻しても残しておく。 */
export function updateSharing(boardId: string, visibility: Visibility, memberEmails: string[]) {
  return updateDoc(boardRef(boardId), { visibility, memberEmails, updatedAt: serverTimestamp() });
}

/**
 * ボードを削除する（作成者のみ）。Firestore はサブコレクションを自動で消さないため、
 * 画像のファイルと中身を先に消してから、最後にボード本体を消す。途中で失敗してもボードが残るのでやり直せる。
 */
export async function deleteBoard(boardId: string) {
  const user = currentUser();
  // 画像のファイルは、ボードを開ける人か確かめるのにボードが要るので、ボードより先に消す
  await deleteBoardImages(boardId);
  for (const col of [objectsCol(boardId), commentsCol(boardId), presenceCol(boardId), stateCol(boardId)]) {
    const snap = await getDocs(col);
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  }
  await deleteDoc(boardRef(boardId));
  await deleteDoc(historyRef(user.uid, boardId));
}

/** 履歴に記録する（開いたとき・タイトルが変わったとき）。付箋とコメントの数は残す。 */
export function recordHistory(board: Board) {
  const user = currentUser();
  return setDoc(
    historyRef(user.uid, board.id),
    { title: board.title, ownerUid: board.ownerUid, lastOpenedAt: serverTimestamp() },
    { merge: true },
  );
}

/** 開いているボードの付箋とコメントの数を、自分の履歴に記録する（履歴一覧に出す） */
export function recordHistoryCounts(boardId: string, stickyCount: number, commentCount: number) {
  const user = currentUser();
  return setDoc(historyRef(user.uid, boardId), { stickyCount, commentCount }, { merge: true });
}

export function subscribeHistory(
  onChange: (entries: HistoryEntry[]) => void,
  onError: (error: FirestoreError) => void,
) {
  const user = currentUser();
  // 一覧はまとめて読み込み、画面の中で「もっと見る」と検索をする
  const q = query(historyCol(user.uid), orderBy('lastOpenedAt', 'desc'), limit(1000));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({
          boardId: d.id,
          ...(d.data({ serverTimestamps: 'estimate' }) as Omit<HistoryEntry, 'boardId'>),
        })),
      ),
    onError,
  );
}
