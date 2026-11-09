// 範囲選択で選ぶもののテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { marqueeHits } from '../src/board/geometry';
import type { BoardObject } from '../src/types';

const base = (id: string, x: number, y: number) => ({
  id,
  x,
  y,
  z: 1,
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
      { ...base('sec', 0, 0), type: 'section', w: 600, h: 400, title: '', color: 'gray' },
      { ...base('a', 40, 40), type: 'sticky', w: 160, h: 160, text: '', color: 'yellow', parentId: 'sec' },
      { ...base('b', 240, 40), type: 'sticky', w: 160, h: 160, text: '', color: 'yellow', parentId: 'sec' },
      // a に付いたスタンプ（a の右下）と、ボードに直接押したスタンプ
      { ...base('st1', 120, 120), type: 'stamp', stampKind: 'like', targetId: 'a' },
      { ...base('st2', 700, 50), type: 'stamp', stampKind: 'like', targetId: null },
    ] as BoardObject[]
  ).map((o) => [o.id, o]),
);

describe('範囲選択', () => {
  it('付箋は枠に少しでもかかれば選ぶ。セクションは全体が入っていなければ選ばない', () => {
    expect(marqueeHits({ x: 20, y: 20, w: 60, h: 60 }, objects)).toEqual(['a']);
    expect(marqueeHits({ x: 150, y: 20, w: 120, h: 60 }, objects).sort()).toEqual(['a', 'b']);
  });

  it('セクションは全体が枠に入ったときだけ選ぶ', () => {
    expect(marqueeHits({ x: -10, y: -10, w: 620, h: 420 }, objects).sort()).toEqual(['a', 'b', 'sec']);
  });

  it('スタンプは付け先からの位置で判定し、付け先も選ばれるときは選ばない', () => {
    expect(marqueeHits({ x: 155, y: 155, w: 20, h: 20 }, objects)).toEqual(['a']);
    expect(marqueeHits({ x: 690, y: 40, w: 20, h: 20 }, objects)).toEqual(['st2']);
  });
});
