import { getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { displayName } from '../auth';
import type { UserProfile } from '../types';
import { userRef, usersCol } from './refs';

/** 自分の名前・メールアドレス・写真を記録する（ログインしたとき）。招待するときの候補に使われる。 */
export function saveMyProfile(user: User) {
  return setDoc(userRef(user.uid), {
    name: displayName(user).slice(0, 100),
    email: (user.email ?? '').toLowerCase(),
    photoURL: user.photoURL,
    updatedAt: serverTimestamp(),
  });
}

/**
 * N-Board にログインしたことがある人の一覧（招待の候補）。
 * Firestore は部分一致の検索ができないため、まとめて読み込んで画面の中で絞り込む。
 */
export async function loadDirectory(): Promise<UserProfile[]> {
  const snap = await getDocs(query(usersCol, limit(5000)));
  return snap.docs.map((d) => ({
    uid: d.id,
    name: String(d.get('name') ?? ''),
    email: String(d.get('email') ?? ''),
    photoURL: (d.get('photoURL') as string | null) ?? null,
  }));
}
