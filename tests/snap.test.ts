// 吸着と「＋」の位置のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { nextStickySlot, snapRect } from '../src/board/snap';
import { STICKY_GAP, STICKY_WIDE_WIDTH } from '../src/constants';

const box = (x: number, y: number, w = 160, h = 160) => ({ x, y, w, h });

describe('吸着', () => {
  it('近くのものと左端がそろう位置に吸い付き、縦のガイド線を1本出す', () => {
    const r = snapRect(box(104, 300), [box(100, 0)], 6);
    expect(r).toMatchObject({ dx: -4, dy: 0 });
    expect(r.guide).toEqual({ axis: 'x', at: 100, from: 0, to: 460 });
  });

  it('中心や右端でもそろう', () => {
    expect(snapRect(box(0, 300, 100, 100), [box(-28, 0)], 6).dx).toBe(2); // 中心 50 → 52
    expect(snapRect(box(237, 0), [box(400, 300, 200, 100)], 6).dx).toBe(3); // 右端 397 → 相手の左端 400
  });

  it('離れていれば吸い付かない', () => {
    expect(snapRect(box(110, 300), [box(100, 0)], 6)).toEqual({ dx: 0, dy: 0, guide: null });
  });

  it('縦横の両方でそろったら両方に吸い付き、線はより近くで吸い付いた方だけ出す', () => {
    const r = snapRect(box(102, 205), [box(100, 0), box(400, 200)], 6);
    expect(r).toMatchObject({ dx: -2, dy: -5 });
    expect(r.guide?.axis).toBe('x');
  });
});

describe('「＋」で足す付箋の位置', () => {
  const from = box(0, 0);

  it('決まった間隔をあけて隣に置く', () => {
    expect(nextStickySlot(from, 'right', [])).toEqual(box(160 + STICKY_GAP, 0));
    expect(nextStickySlot(from, 'up', [])).toEqual(box(0, -160 - STICKY_GAP));
  });

  it('横長の付箋の「＋」は、横長の付箋を同じ間隔で隣に置く', () => {
    const wide = box(0, 0, STICKY_WIDE_WIDTH);
    expect(nextStickySlot(wide, 'right', [])).toEqual(box(STICKY_WIDE_WIDTH + STICKY_GAP, 0, STICKY_WIDE_WIDTH));
  });

  it('横長の付箋の幅は、正方形2枚とすき間の幅にそろう', () => {
    expect(STICKY_WIDE_WIDTH).toBe(160 + STICKY_GAP + 160);
  });

  it('隣がふさがっていれば、その先の空いているところに置く', () => {
    const next = box(160 + STICKY_GAP, 0);
    expect(nextStickySlot(from, 'right', [from, next])).toEqual(box((160 + STICKY_GAP) * 2, 0));
  });
});
