import { onSnapshot, serverTimestamp, setDoc, type FirestoreError } from 'firebase/firestore';
import { currentUser } from '../auth';
import type { TimerState } from '../types';
import { serverNow } from './clock';
import { timerRef } from './refs';

const MINUTE = 60_000;
/** 設定できる最大の分数。表示を「分:秒」の2桁（最大 99:59）に収めるため。 */
export const TIMER_MAX_MINUTES = 99;
/** 残り時間の上限（99:59）。+1分 で超えそうなときもここで止める。セキュリティルールと合わせる。 */
const MAX_MS = TIMER_MAX_MINUTES * MINUTE + 59_000;

export function subscribeTimer(
  boardId: string,
  onChange: (timer: TimerState | null) => void,
  onError: (error: FirestoreError) => void,
) {
  return onSnapshot(
    timerRef(boardId),
    (snap) => onChange(snap.exists() ? (snap.data({ serverTimestamps: 'estimate' }) as TimerState) : null),
    onError,
  );
}

/** 残り時間（ミリ秒）。時間を過ぎると負になる。止まっていないタイマーがなければ 0。 */
export function timerRemaining(timer: TimerState | null): number {
  if (!timer || timer.status === 'idle') return 0;
  if (timer.status === 'paused') return timer.remainingMs;
  const startedAt = timer.startedAt?.toMillis() ?? serverNow();
  return timer.remainingMs - (serverNow() - startedAt);
}

function clampMs(ms: number) {
  return Math.round(Math.min(MAX_MS, Math.max(0, ms)));
}

function write(boardId: string, data: Pick<TimerState, 'status' | 'durationMs' | 'remainingMs'> & { running: boolean }) {
  const { running, ...rest } = data;
  return setDoc(timerRef(boardId), {
    ...rest,
    durationMs: clampMs(rest.durationMs),
    remainingMs: clampMs(rest.remainingMs),
    startedAt: running ? serverTimestamp() : null,
    updatedBy: currentUser().uid,
    updatedAt: serverTimestamp(),
  });
}

export function startTimer(boardId: string, ms: number) {
  return write(boardId, { status: 'running', durationMs: ms, remainingMs: ms, running: true });
}

export function pauseTimer(boardId: string, timer: TimerState) {
  return write(boardId, {
    status: 'paused',
    durationMs: timer.durationMs,
    remainingMs: timerRemaining(timer),
    running: false,
  });
}

export function resumeTimer(boardId: string, timer: TimerState) {
  return write(boardId, { status: 'running', durationMs: timer.durationMs, remainingMs: timer.remainingMs, running: true });
}

/** 1分延ばす。時間を過ぎていたら、1分のタイマーとして始め直す。 */
export function addMinute(boardId: string, timer: TimerState) {
  const remaining = timerRemaining(timer);
  if (timer.status === 'running' && remaining <= 0) return startTimer(boardId, MINUTE);
  return write(boardId, {
    status: timer.status,
    durationMs: timer.durationMs + MINUTE,
    remainingMs: remaining + MINUTE,
    running: timer.status === 'running',
  });
}

export function stopTimer(boardId: string) {
  return write(boardId, { status: 'idle', durationMs: 0, remainingMs: 0, running: false });
}
