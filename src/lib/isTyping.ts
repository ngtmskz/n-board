/** 文字を入力している最中か（キー操作をボードの操作として扱わないため） */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/**
 * 日本語などの変換の途中か。変換を確定する Enter や、変換を取り消す Esc で、入力そのものを終えないために使う。
 * Safari は確定の Enter で isComposing が false になることがあるので、keyCode 229 でも判定する。
 */
export function isImeComposing(e: { nativeEvent: KeyboardEvent }) {
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
}
