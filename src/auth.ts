import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { create } from 'zustand';
import { allowedDomains, useEmulators } from './config';
import { auth } from './firebase';
import type { UserRef } from './types';
import { t } from './i18n';

interface AuthState {
  user: User | null;
  ready: boolean;
}

export const useAuth = create<AuthState>(() => ({ user: null, ready: false }));

onAuthStateChanged(auth, (user) => useAuth.setState({ user, ready: true }));

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // 組織のアカウントを選びやすくするための指定。制限そのものはセキュリティルールで行う。
  const params: Record<string, string> = { prompt: 'select_account' };
  if (allowedDomains.length === 1) params.hd = allowedDomains[0];
  provider.setCustomParameters(params);
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // ポップアップがブロックされる環境ではリダイレクトでログインする
    if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, provider);
    else throw e;
  }
}

export function signOutUser() {
  return signOut(auth);
}

export function displayName(user: Pick<User, 'displayName' | 'email'>): string {
  return user.displayName?.trim() || user.email?.split('@')[0] || t('common.anonymous');
}

export function toUserRef(user: User): UserRef {
  return { uid: user.uid, name: displayName(user).slice(0, 100), photoURL: user.photoURL };
}

/** 顔スタンプ・アバター用のイニシャル */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && /^[A-Za-z]/.test(words[0])) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? '?').slice(0, 1).toUpperCase();
}

/** 現在ログイン中のユーザー（ログイン後の画面でのみ使う） */
export function currentUser(): User {
  const user = useAuth.getState().user;
  if (!user) throw new Error('ログインしていません');
  return user;
}

// エミュレーター使用時だけ、自動テスト・複数人での動作確認用にコンソールからログインできるようにする。
//   await __nboardSignIn('alice@example.com', 'Alice')
if (useEmulators) {
  (window as unknown as Record<string, unknown>).__nboardSignIn = async (email: string, name?: string) => {
    const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: name ?? email.split('@')[0] });
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  };
}
