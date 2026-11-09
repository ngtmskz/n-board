// 「スペース＋ドラッグで画面を移動」のヒント。一度スペースで画面を動かしたら、その人の画面では出さない。
import { create } from 'zustand';

const KEY = 'nboard:space-pan-used';

function readUsed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const usePanHint = create<{ used: boolean }>(() => ({ used: readUsed() }));

export function markSpacePanUsed() {
  if (usePanHint.getState().used) return;
  usePanHint.setState({ used: true });
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // 保存できなくても、この画面を開いている間は出さない
  }
}
