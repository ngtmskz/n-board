import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { currentUser } from '../auth';
import type { BgmTrackId } from '../constants';
import { bgmRef } from './refs';

/**
 * boards/{boardId}/state/bgm。ボード全体で流す曲（null なら止める）。
 * 曲を選ぶ・止めるのは全員で共有し、聞く音量は人ごと（src/lib/sound.ts）。
 */
export function subscribeBgm(boardId: string, onChange: (trackId: BgmTrackId | null) => void) {
  return onSnapshot(
    bgmRef(boardId),
    (snap) => onChange(snap.exists() ? ((snap.get('trackId') as BgmTrackId | null) ?? null) : null),
    (e) => console.error(e),
  );
}

export function setBgmTrack(boardId: string, trackId: BgmTrackId | null) {
  return setDoc(bgmRef(boardId), { trackId, updatedBy: currentUser().uid, updatedAt: serverTimestamp() });
}
