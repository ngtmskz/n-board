// HTML の書き出しのテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { exportFileName } from '../src/lib/download';
import { buildBoardHtml } from '../src/lib/exportHtml';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

describe('HTML の書き出し', () => {
  const html = buildBoardHtml('振り返り <&> "案"', SVG, new Date('2026-11-06T15:05:00'));

  it('1つのファイルで開ける：見た目の SVG と、拡大・縮小のスクリプトを中に入れ、外部のファイルは読まない', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<div id="board">${SVG}</div>`);
    expect(html).toContain('<script>');
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });

  it('ボード名はタグとして読まれないようにする', () => {
    expect(html).toContain('<title>振り返り &lt;&amp;&gt; &quot;案&quot;</title>');
    expect(html).not.toContain('<&>');
  });

  it('書き出した日時を出す', () => {
    expect(html).toContain('2026/11/06 15:05');
  });

  it('ファイル名は「ボード名_日付.html」', () => {
    expect(exportFileName('振り返り', new Date('2026-11-06T15:05:00'), 'html')).toBe('振り返り_20261106.html');
  });
});
