// 画面の言葉の切り替え（日本語・英語）。ブラウザの言語で決め、アカウントのメニューから手動でも変えられる。
// 選んだ言語はその人のブラウザに覚えておく。ユーザーが書いた付箋やコメントの内容は対象外。
import { create } from 'zustand';
import { en } from './en';
import { ja, type Messages } from './ja';

export type Lang = 'ja' | 'en';
export type MessageKey = keyof Messages;

export const LANGS: { lang: Lang; label: string }[] = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'English' },
];

const dictionaries: Record<Lang, Messages> = { ja, en };
const KEY = 'nboard:lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // 保存できない環境では、ブラウザの言語で決める
  }
  const browser = typeof navigator === 'undefined' ? 'ja' : navigator.language.toLowerCase();
  return browser.startsWith('ja') ? 'ja' : 'en';
}

export const useLang = create<{ lang: Lang }>(() => ({ lang: initialLang() }));

export function currentLang(): Lang {
  return useLang.getState().lang;
}

export function setLang(lang: Lang) {
  useLang.setState({ lang });
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // 覚えておけなくても、この画面を開いている間は切り替わる
  }
}

/** 言葉を引く。{name} のような部分は params で差し込む。画面の外（通知・CSV など）からも使える。 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = dictionaries[currentLang()][key];
  if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

/** 画面の部品から使う。言語を切り替えたら描き直される。 */
export function useT() {
  useLang((s) => s.lang);
  return t;
}

/** 日時の表示などに使うロケール */
export function locale() {
  return currentLang() === 'ja' ? 'ja-JP' : 'en-US';
}
