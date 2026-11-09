// 付箋・テキストの URL をリンクにするときの分け方のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { safeHref, splitLinks } from '../src/lib/links';

const links = (text: string) => splitLinks(text).filter((p) => p.href);

describe('splitLinks', () => {
  it('http・https の URL をリンクにし、前後の文字はそのまま残す', () => {
    expect(splitLinks('やり方はこちら https://example.com/guide を見てね')).toEqual([
      { text: 'やり方はこちら ' },
      { text: 'https://example.com/guide', href: 'https://example.com/guide' },
      { text: ' を見てね' },
    ]);
    expect(links('http://example.com')).toHaveLength(1);
  });

  it('URL のない文は、そのまま1つの文字として返す', () => {
    expect(splitLinks('ふつうの付箋')).toEqual([{ text: 'ふつうの付箋' }]);
    expect(splitLinks('')).toEqual([]);
  });

  it('javascript: や data: など、http・https 以外はリンクにしない', () => {
    for (const text of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com',
      'mailto:someone@example.com',
      '//example.com',
      'www.example.com',
    ]) {
      expect(links(text), text).toEqual([]);
    }
  });

  it('URL の途中に javascript: を混ぜても、リンク先は http・https のまま', () => {
    for (const p of links('https://example.com/javascript:alert(1) と javascript:https://example.com')) {
      expect(new URL(p.href!).protocol).toBe('https:');
    }
  });

  it('文字の中の < > " で URL を区切る（タグや属性として読まれない）', () => {
    expect(links('https://example.com/"><img src=x onerror=alert(1)>')).toEqual([
      { text: 'https://example.com/', href: 'https://example.com/' },
    ]);
    expect(links("https://example.com/'onmouseover='alert(1)")[0].text).toBe('https://example.com/');
  });

  it('後ろに続く句読点・かっこは URL に含めない', () => {
    expect(links('https://example.com。')[0].text).toBe('https://example.com');
    expect(links('https://example.com、次は')[0].text).toBe('https://example.com');
    expect(links('（https://example.com）')[0].text).toBe('https://example.com');
    expect(links('「https://example.com」')[0].text).toBe('https://example.com');
    expect(links('See https://example.com.')[0].text).toBe('https://example.com');
    expect(links('(https://example.com)')[0].text).toBe('https://example.com');
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')[0].text).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('1つの文の中の複数の URL を、それぞれリンクにする', () => {
    expect(links('A: https://a.example.com\nB: https://b.example.com/x?y=1#z').map((p) => p.text)).toEqual([
      'https://a.example.com',
      'https://b.example.com/x?y=1#z',
    ]);
  });

  it('リンクにした部分とそれ以外をつなぐと、元の文に戻る', () => {
    const text = '投票はこちら：https://share.example.com/d/2hqqy2CgXFmA。1人3票まで';
    expect(
      splitLinks(text)
        .map((p) => p.text)
        .join(''),
    ).toBe(text);
  });
});

describe('safeHref', () => {
  it('http・https だけを通す', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com/');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
  });

  it('見た目が似た文字のドメインは、実際の宛先（xn--）の形にする', () => {
    expect(safeHref('https://ехаmple.com')).toMatch(/^https:\/\/xn--/);
  });
});
