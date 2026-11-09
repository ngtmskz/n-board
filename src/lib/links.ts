/** 付箋・テキストの文字を、ふつうの文字と URL に分けたもの。href があるところをリンクにする。 */
export interface TextPart {
  text: string;
  href?: string;
}

/**
 * URL とみなす範囲。http・https で始まるものだけを探す（javascript: などはリンクにしない）。
 * 日本語の文では URL のすぐ後ろに句読点やかっこが続くことが多いので、それらは URL に含めない。
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'`「」『』（）【】〈〉《》、。，．！？]+/gi;
/** 末尾にあっても URL の一部とはみなさない記号（文の終わりの「.」など） */
const TRAILING = /[.,!?:;]+$/;

/** 開いてよい URL なら、ブラウザが解釈したとおりの形で返す。http・https 以外や、壊れた URL は null。 */
export function safeHref(s: string): string | null {
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_PATTERN)) {
    let raw = m[0].replace(TRAILING, '');
    // 「(https://example.com)」のような書き方では、対になっていない閉じかっこを URL に含めない
    if (raw.endsWith(')') && !raw.includes('(')) raw = raw.slice(0, -1);
    const href = safeHref(raw);
    if (!href) continue;
    const start = m.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
