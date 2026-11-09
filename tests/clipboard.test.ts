// 付箋・セクションなどのコピー＆ペーストのテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { collectForCopy, decodeClip, encodeClip, MAX_CLIP_ITEMS, PASTE_CASCADE, planDuplicate, planPaste } from '../src/board/clipboard';
import type { BoardObject } from '../src/types';

const base = (id: string, x: number, y: number, z = 1) => ({
  id,
  x,
  y,
  z,
  createdBy: { uid: 'u', name: 'u', photoURL: null },
  createdAt: null,
  updatedBy: 'u',
  updatedAt: null,
  deleted: false,
  locked: false,
});

const objects: Record<string, BoardObject> = Object.fromEntries(
  (
    [
      { ...base('sec', 0, 0, 1), type: 'section', w: 600, h: 400, title: '発想法', color: 'yellow' },
      { ...base('a', 40, 40, 2), type: 'sticky', w: 160, h: 160, text: 'マンダラート', color: 'yellow', parentId: 'sec' },
      { ...base('b', 240, 40, 3), type: 'sticky', w: 344, h: 160, text: 'SCAMPER', color: 'blue', parentId: 'sec' },
      { ...base('t', 700, 0, 4), type: 'text', w: 300, h: 40, text: '見出し https://example.com', fontSize: 24, color: 'gray', autoWidth: true, parentId: null },
      // a に押された投票と、ボードに直接押したスタンプ
      { ...base('vote', 120, 120, 5), type: 'stamp', stampKind: 'like', targetId: 'a' },
      { ...base('free', 900, 50, 6), type: 'stamp', stampKind: 'star', targetId: null },
      { ...base('img', 40, 240, 7), type: 'image', w: 200, h: 100, src: 'boards/board1/images/abcdefghijklmnopqrst.webp', parentId: 'sec' },
    ] as BoardObject[]
  ).map((o) => [o.id, o]),
);

let counter = 0;
const newId = () => `new${++counter}`;
const roundTrip = (ids: string[]) => decodeClip(encodeClip(collectForCopy(ids, objects)))!;

describe('コピーするもの', () => {
  it('セクションを選ぶと、中の付箋・画像も入る。押された投票のスタンプは入らない', () => {
    const items = collectForCopy(['sec'], objects);
    expect(items.map((i) => i.key).sort()).toEqual(['a', 'b', 'img', 'sec']);
  });

  it('付箋だけを選ぶと、セクションとのつながりは持たない', () => {
    const items = collectForCopy(['a'], objects);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'sticky', parentKey: null });
  });

  it('付け先を選ばずにスタンプを選ぶと、ボードの上の位置のスタンプになる', () => {
    const [stamp] = collectForCopy(['vote'], objects);
    expect(stamp).toMatchObject({ type: 'stamp', x: 160, y: 160, targetKey: null });
  });

  it('何も選んでいなければ空', () => {
    expect(collectForCopy([], objects)).toEqual([]);
  });
});

describe('クリップボードの形', () => {
  it('入れたものをそのまま読み出せる（日本語・URL を含む）', () => {
    const items = collectForCopy(['sec', 't', 'free'], objects);
    expect(decodeClip(encodeClip(items))).toEqual(items);
  });

  it('ほかのアプリに貼ったときの文字は、HTML として読まれないようにする', () => {
    const html = encodeClip(collectForCopy(['a'], { a: { ...objects.a, text: '<img src=x onerror=alert(1)>' } as BoardObject }));
    expect(html).not.toContain('<img');
    expect(html).toContain('&#60;img');
  });

  it('N-Board のものでない HTML や、壊れたデータは null', () => {
    expect(decodeClip('<p>ふつうの文</p>')).toBeNull();
    expect(decodeClip('<div data-nboard-objects="not-base64!!">')).toBeNull();
    expect(decodeClip(`<div data-nboard-objects="${btoa('{"v":1,"items":"x"}')}">`)).toBeNull();
    expect(decodeClip(`<div data-nboard-objects="${btoa('{"v":99,"items":[]}')}">`)).toBeNull();
  });

  const crafted = (items: unknown[]) => `<div data-nboard-objects="${btoa(JSON.stringify({ v: 1, items }))}">`;
  const good = { key: 'k', type: 'sticky', x: 0, y: 0, z: 1, w: 160, h: 160, text: 'ok', color: 'yellow', parentKey: null };

  it('よそから作られたデータは、決まった項目だけを取り出し、おかしなものは貼らない', () => {
    const items = decodeClip(
      crafted([
        { ...good, createdBy: { uid: 'someone-else' }, locked: true, extra: 1 },
        { ...good, key: 'c', color: 'red' },
        { ...good, key: 'd', text: 'x'.repeat(2001) },
        { ...good, key: 'e', x: 'javascript:alert(1)' },
        { ...good, key: 'f', w: 1e9 },
        { ...good, key: 'g', type: 'iframe' },
        { key: 'h', type: 'image', x: 0, y: 0, z: 0, w: 100, h: 100, src: 'https://evil.example.com/a.png', parentKey: null },
        { key: 'i', type: 'image', x: 0, y: 0, z: 0, w: 100, h: 100, src: 'boards/x/../../secret/abcdefghijklmnopqrst.png', parentKey: null },
        { key: 'j', type: 'stamp', x: 0, y: 0, z: 0, stampKind: 'poop', targetKey: null },
      ]),
    )!;
    expect(items).toEqual([good]);
  });

  it(`一度に貼れるのは ${MAX_CLIP_ITEMS} 個まで`, () => {
    const many = Array.from({ length: MAX_CLIP_ITEMS + 50 }, (_, n) => ({ ...good, key: `k${n}` }));
    expect(decodeClip(crafted(many))).toHaveLength(MAX_CLIP_ITEMS);
  });
});

describe('貼る位置とつながり', () => {
  it('全体の真ん中を指定の位置に置き、並びはそのまま', () => {
    const plans = planPaste(roundTrip(['sec']), { x: 5000, y: 5000 }, {}, newId, 100);
    const sec = plans.find((p) => p.data.type === 'section')!;
    expect(sec.data).toMatchObject({ x: 4700, y: 4800, w: 600, h: 400 });
    const a = plans.find((p) => p.data.type === 'sticky' && p.data.text === 'マンダラート')!;
    expect(a.data).toMatchObject({ x: 4740, y: 4840 });
  });

  it('ID は付け直し、中の付箋は新しいセクションに入る', () => {
    const plans = planPaste(roundTrip(['sec']), { x: 5000, y: 5000 }, objects, newId, 100);
    const ids = plans.map((p) => p.id);
    expect(ids.some((id) => id in objects)).toBe(false);
    const sec = plans.find((p) => p.data.type === 'section')!;
    for (const p of plans) if (p.data.type !== 'section') expect(p.data).toMatchObject({ parentId: sec.id });
  });

  it('重なり順は元の順番のまま、新しいものとして手前に出す', () => {
    const plans = planPaste(roundTrip(['sec']), { x: 0, y: 0 }, {}, newId, 100);
    expect(plans.map((p) => p.data.z)).toEqual([100, 101, 102, 103]);
  });

  it('付箋だけを貼ると、置いた位置のセクションに入る', () => {
    const plans = planPaste(roundTrip(['t']), { x: 300, y: 200 }, objects, newId, 100);
    expect(plans[0].data).toMatchObject({ type: 'text', parentId: 'sec' });
    const outside = planPaste(roundTrip(['t']), { x: 3000, y: 3000 }, objects, newId, 100);
    expect(outside[0].data).toMatchObject({ parentId: null });
  });

  it('同じ場所に続けて貼ると、重ならないように少しずつずらす', () => {
    const items = roundTrip(['a']);
    // 元の付箋 a の真ん中に貼る
    const first = planPaste(items, { x: 120, y: 120 }, objects, newId, 100);
    expect(first[0].data).toMatchObject({ x: 40 + PASTE_CASCADE, y: 40 + PASTE_CASCADE });
    const withFirst = { ...objects, [first[0].id]: { ...objects.a, ...first[0].data, id: first[0].id } as BoardObject };
    const second = planPaste(items, { x: 120, y: 120 }, withFirst, newId, 100);
    expect(second[0].data).toMatchObject({ x: 40 + PASTE_CASCADE * 2, y: 40 + PASTE_CASCADE * 2 });
  });

  it('付け先と一緒に貼るスタンプは、新しい付け先に付く', () => {
    const items = roundTrip(['a', 'vote']);
    const plans = planPaste(items, { x: 3000, y: 3000 }, objects, newId, 100);
    const sticky = plans.find((p) => p.data.type === 'sticky')!;
    expect(plans.find((p) => p.data.type === 'stamp')!.data).toMatchObject({ x: 120, y: 120, targetId: sticky.id });
  });

  it('画像は元のファイルの場所を覚えておく（別のボードなら貼るときに写す）', () => {
    const plans = planPaste(roundTrip(['img']), { x: 0, y: 0 }, {}, newId, 100);
    expect(plans[0].copyFrom).toBe('boards/board1/images/abcdefghijklmnopqrst.webp');
  });
});

describe('矢印', () => {
  const withArrows: Record<string, BoardObject> = {
    ...objects,
    ab: { ...base('ab', 0, 0, 8), type: 'connector', fromId: 'a', toId: 'b', label: 'はい', bothEnds: true },
    at: { ...base('at', 0, 0, 9), type: 'connector', fromId: 'a', toId: 't', label: '' },
  };

  it('両端を一緒にコピーするときだけ入れる（矢印を選んでいなくても入る）', () => {
    expect(collectForCopy(['a', 'b'], withArrows).map((i) => i.key).sort()).toEqual(['a', 'ab', 'b']);
    // 片方の端だけなら入れない。矢印だけを選んでも入れない
    expect(collectForCopy(['a'], withArrows).map((i) => i.key)).toEqual(['a']);
    expect(collectForCopy(['ab'], withArrows)).toEqual([]);
  });

  it('貼ると、新しい付箋どうしをつなぐ。言葉もそのまま', () => {
    const items = decodeClip(encodeClip(collectForCopy(['a', 'b'], withArrows)))!;
    const plans = planPaste(items, { x: 1000, y: 1000 }, withArrows, newId, 100);
    const ids = new Map(items.map((i, n) => [i.key, plans[n]?.id]));
    const arrow = plans.find((p) => p.data.type === 'connector')!;
    const sticky = (text: string) => plans.find((p) => p.data.type === 'sticky' && p.data.text === text)!.id;
    expect(arrow.data).toMatchObject({ type: 'connector', fromId: sticky('マンダラート'), toId: sticky('SCAMPER'), label: 'はい', bothEnds: true, x: 0, y: 0 });
    expect(ids.size).toBe(3);
  });

  it('端のないデータや、同じものどうしをつなぐデータは貼らない', () => {
    const raw = [
      { key: 'x', type: 'sticky', x: 0, y: 0, z: 1, w: 160, h: 160, text: '', color: 'yellow', parentKey: null },
      { key: 'k1', type: 'connector', x: 0, y: 0, z: 2, fromKey: 'x', toKey: 'missing', label: '' },
      { key: 'k2', type: 'connector', x: 0, y: 0, z: 3, fromKey: 'x', toKey: 'x', label: '' },
    ];
    const items = decodeClip(encodeClip(raw as never))!;
    expect(items.map((i) => i.key)).toEqual(['x', 'k1']);
    const plans = planPaste(items, { x: 0, y: 0 }, {}, newId, 1);
    expect(plans.map((p) => p.data.type)).toEqual(['sticky']);
  });
});

describe('複製（Option＋ドラッグ・⌘D）', () => {
  it('元の位置から指定の分だけずらし、重なっていてもずらし直さない。元の ID との対応を持つ', () => {
    const items = collectForCopy(['sec'], objects);
    const plans = planDuplicate(items, 0, 0, objects, newId, 100);
    const sec = plans.find((p) => p.sourceKey === 'sec')!;
    expect(sec.data).toMatchObject({ x: 0, y: 0 });
    const a = plans.find((p) => p.sourceKey === 'a')!;
    expect(a.data).toMatchObject({ x: 40, y: 40, parentId: sec.id });
    expect(a.id).not.toBe('a');
    const moved = planDuplicate(items, 24, 24, objects, newId, 100);
    expect(moved.find((p) => p.sourceKey === 'a')!.data).toMatchObject({ x: 64, y: 64 });
  });
});
