// 付箋へのコメントの、画面側の状態と操作
import { create } from 'zustand';
import { addComment, deleteComment, editComment } from '../data/comments';
import { t } from '../i18n';
import type { BoardComment } from '../types';
import { activeBoardId, deleteObjects } from './actions';
import { getObjects } from './store';

/** 削除されていないコメント（Firestore から届いたもの。自分の書き込みもすぐ反映される） */
export const useComments = create<{ list: BoardComment[] }>(() => ({ list: [] }));

export function setComments(list: BoardComment[]) {
  useComments.setState({ list });
}

function createdTime(c: BoardComment) {
  return c.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
}

/** ある付箋へのコメントを、古い順に */
export function commentsOf(list: BoardComment[], stickyId: string) {
  return list.filter((c) => c.targetId === stickyId).sort((a, b) => createdTime(a) - createdTime(b));
}

/** 付箋に付いているコメントの数 */
export function useCommentCount(stickyId: string) {
  return useComments((s) => s.list.filter((c) => c.targetId === stickyId).length);
}

function report(e: unknown) {
  console.error(e);
  window.dispatchEvent(new CustomEvent('nboard:error', { detail: t('common.saveFailed') }));
}

export function postComment(stickyId: string, text: string) {
  addComment(activeBoardId(), stickyId, text).catch(report);
}

export function updateComment(commentId: string, text: string) {
  editComment(activeBoardId(), commentId, text).catch(report);
}

export function removeComment(commentId: string) {
  deleteComment(activeBoardId(), commentId).catch(report);
}

/**
 * 削除する付箋に付いているコメントの数。付箋を消すとコメントも一緒に見えなくなるので、
 * コメントがあるときだけ確認を出すのに使う。
 */
export function commentCountOn(ids: string[]) {
  const objects = getObjects();
  const stickies = new Set(ids.filter((id) => objects[id]?.type === 'sticky'));
  return useComments.getState().list.filter((c) => stickies.has(c.targetId)).length;
}

/**
 * 削除の前に、コメントが付いた付箋が含まれていれば確認する。付箋を消すとコメントも一緒に見えなくなり、
 * 「元に戻す」で戻せるのは消した本人だけなので、ほかの人のコメントを消してしまわないように。
 */
export function confirmAndDelete(ids: string[]) {
  const count = commentCountOn(ids);
  if (count > 0 && !window.confirm(t('comment.deleteStickiesConfirm', { count }))) return;
  deleteObjects(ids);
}
