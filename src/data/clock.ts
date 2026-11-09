/**
 * 端末の時計とサーバーの時計の差。参加者のパソコンの時計は数秒ずれていることがあるため、
 * タイマーの残り時間はサーバーの時刻を基準に計算する。
 * 参加中の表示のハートビート（サーバーの時刻で記録される）を使って差を測る。
 */
let offsetMs = 0;

/** サーバーの今の時刻（の推定） */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/**
 * sentAt（端末の時刻）に送った書き込みに、サーバーが serverMs の時刻を記録し、
 * それが receivedAt（端末の時刻）に届いたときに呼ぶ。サーバーが記録したのは往復の中間とみなす。
 */
export function calibrateClock(serverMs: number, sentAt: number, receivedAt: number) {
  offsetMs = serverMs - (sentAt + receivedAt) / 2;
}
