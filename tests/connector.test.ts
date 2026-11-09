// 矢印の位置と範囲選択のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { alignToSource, boxAt, connectorDirection, CONNECT_MIN_GAP, connectedStickyRect, CONNECTOR_GAP, connectorLine, lineBetween, marqueeHits } from '../src/board/geometry';
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
      { ...base('sec', 0, 0), type: 'section', w: 1000, h: 400, title: '', color: 'gray' },
      { ...base('a', 0, 0, 2), type: 'sticky', w: 100, h: 100, text: '', color: 'yellow', parentId: 'sec' },
      { ...base('b', 300, 0, 3), type: 'sticky', w: 100, h: 100, text: '', color: 'yellow', parentId: 'sec' },
      { ...base('ab', 0, 0, 4), type: 'connector', fromId: 'a', toId: 'b', label: '' },
      { ...base('gone', 0, 0, 5), type: 'connector', fromId: 'a', toId: 'deleted', label: '' },
    ] as BoardObject[]
  ).map((o) => [o.id, o]),
);

describe('矢印の線', () => {
  it('中心どうしを結び、それぞれの縁の少し外で止める', () => {
    expect(connectorLine(objects.ab as never, objects)).toEqual({
      x1: 100 + CONNECTOR_GAP,
      y1: 50,
      x2: 300 - CONNECTOR_GAP,
      y2: 50,
    });
  });

  it('片方の端が消えていれば描かない', () => {
    expect(connectorLine(objects.gone as never, objects)).toBeNull();
  });

  it('2つが重なっていて線が引けないときは描かない', () => {
    expect(lineBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 0, w: 100, h: 100 })).toBeNull();
  });

  it('大きさ 0 の先（伸ばしている途中のカーソル）には、その点まで引く', () => {
    expect(lineBetween({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 300, w: 0, h: 0 })).toEqual({
      x1: 50,
      y1: 100 + CONNECTOR_GAP,
      x2: 50,
      y2: 300,
    });
  });
});

describe('つなぐ先', () => {
  it('付箋の上ならその付箋。元の付箋とセクション（中の余白）は除く', () => {
    expect(boxAt(350, 50, objects)?.id).toBe('b');
    expect(boxAt(50, 50, objects, 'a')).toBeNull();
    expect(boxAt(2000, 2000, objects)).toBeNull();
  });
});

describe('範囲選択', () => {
  it('両端がどちらも選ばれたときだけ、矢印も選ぶ', () => {
    expect(marqueeHits({ x: -10, y: -10, w: 420, h: 120 }, objects).sort()).toEqual(['a', 'ab', 'b']);
    expect(marqueeHits({ x: -10, y: -10, w: 50, h: 50 }, objects)).toEqual(['a']);
  });
});

describe('矢印を伸ばす先をそろえる', () => {
  const from = { x: 0, y: 0, w: 100, h: 100 };
  const keys = { shiftKey: false, metaKey: false, ctrlKey: false };

  it('Shift を押している間は、大きく動かした方の向きに固定する', () => {
    expect(alignToSource({ x: 400, y: 120 }, from, { ...keys, shiftKey: true }, 1)).toEqual({ x: 400, y: 50 });
    expect(alignToSource({ x: 90, y: 400 }, from, { ...keys, shiftKey: true }, 1)).toEqual({ x: 50, y: 400 });
  });

  it('中心の線の近くなら吸い付き、離れていればそのまま。縮小しているときは画面上の距離で決める', () => {
    expect(alignToSource({ x: 400, y: 60 }, from, keys, 1)).toEqual({ x: 400, y: 50 });
    expect(alignToSource({ x: 400, y: 80 }, from, keys, 1)).toEqual({ x: 400, y: 80 });
    expect(alignToSource({ x: 400, y: 70 }, from, keys, 0.5)).toEqual({ x: 400, y: 50 });
  });

  it('⌘ / Ctrl を押している間は吸い付かない', () => {
    expect(alignToSource({ x: 400, y: 55 }, from, { ...keys, metaKey: true }, 1)).toEqual({ x: 400, y: 55 });
  });
});

describe('矢印を伸ばして作る付箋の位置', () => {
  const from = { x: 0, y: 0, w: 100, h: 100 };

  it('伸ばした向きの手前の辺をカーソルの位置に置く', () => {
    expect(connectedStickyRect(from, { x: 400, y: 50 }, 100, 100)).toEqual({ x: 400, y: 0, w: 100, h: 100 });
    expect(connectedStickyRect(from, { x: 50, y: 500 }, 100, 100)).toEqual({ x: 0, y: 500, w: 100, h: 100 });
    expect(connectedStickyRect(from, { x: -400, y: 50 }, 100, 100)).toEqual({ x: -500, y: 0, w: 100, h: 100 });
  });

  it('元の付箋の近くで離しても、矢印が見えるだけの間隔をあける', () => {
    expect(connectedStickyRect(from, { x: 130, y: 50 }, 100, 100).x).toBe(100 + CONNECT_MIN_GAP);
    expect(connectedStickyRect(from, { x: 50, y: -20 }, 100, 100).y).toBe(-CONNECT_MIN_GAP - 100);
  });
});

describe('矢印の向き（画面で見たまま）', () => {
  const c = objects.ab as never as Parameters<typeof connectorDirection>[0];

  it('横に近い矢印は、右向きが forward、左向きが backward', () => {
    expect(connectorDirection(c, { x1: 0, y1: 0, x2: 100, y2: 20 })).toEqual({ axis: 'x', direction: 'forward' });
    expect(connectorDirection(c, { x1: 100, y1: 0, x2: 0, y2: 20 })).toEqual({ axis: 'x', direction: 'backward' });
  });

  it('縦に近い矢印は、下向きが forward。両向きなら both', () => {
    expect(connectorDirection(c, { x1: 0, y1: 0, x2: 20, y2: 100 })).toEqual({ axis: 'y', direction: 'forward' });
    expect(connectorDirection(c, { x1: 0, y1: 100, x2: 20, y2: 0 })).toEqual({ axis: 'y', direction: 'backward' });
    expect(connectorDirection({ ...c, bothEnds: true }, { x1: 0, y1: 100, x2: 20, y2: 0 })).toEqual({ axis: 'y', direction: 'both' });
  });
});
