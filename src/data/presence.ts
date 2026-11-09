import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { currentUser, displayName } from '../auth';
import { PRESENCE_HEARTBEAT_MS } from '../constants';
import type { Presence } from '../types';
import { calibrateClock } from './clock';
import { presenceCol, presenceRef } from './refs';

/** 最後にハートビートを送った端末の時刻（時計のずれの補正に使う） */
let lastBeatSentAt: number | null = null;

/**
 * 参加中であることを定期的に書き込む。Firestore には切断検知がないため、
 * lastSeen が一定時間更新されない人は画面側で「退出」とみなす。戻り値で停止する。
 */
export function joinBoard(boardId: string): () => void {
  const user = currentUser();
  const beat = () => {
    lastBeatSentAt = Date.now();
    return setDoc(presenceRef(boardId, user.uid), {
      name: displayName(user).slice(0, 100),
      photoURL: user.photoURL,
      lastSeen: serverTimestamp(),
    }).catch(() => {});
  };
  beat();
  const timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
  const onVisible = () => document.visibilityState === 'visible' && beat();
  const leave = () => deleteDoc(presenceRef(boardId, user.uid)).catch(() => {});
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', leave);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', leave);
    leave();
  };
}

export function subscribePresence(boardId: string, onChange: (people: Presence[]) => void) {
  const uid = currentUser().uid;
  return onSnapshot(
    presenceCol(boardId),
    { includeMetadataChanges: true },
    (snap) => {
      // 自分のハートビートがサーバーに記録されたら、その時刻で時計のずれを測る
      const mine = snap.docs.find((d) => d.id === uid);
      const lastSeen = mine?.get('lastSeen');
      if (mine && !mine.metadata.hasPendingWrites && lastSeen && lastBeatSentAt !== null) {
        calibrateClock(lastSeen.toMillis(), lastBeatSentAt, Date.now());
        lastBeatSentAt = null;
      }
      onChange(snap.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Presence));
    },
    () => onChange([]),
  );
}
