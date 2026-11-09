// スタンプの付け先の決め方のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { findStampTarget, STAMP_ATTACH_MARGIN } from '../src/board/geometry';
import type { SectionObject, StickyObject } from '../src/types';

function sticky(id: string, x: number, y: number, z = 1): StickyObject {
  return {
    id,
    type: 'sticky',
    x,
    y,
    z,
    w: 160,
    h: 160,
    text: '',
    color: 'yellow',
    parentId: null,
    createdBy: { uid: 'u', name: 'u', photoURL: null },
    createdAt: null,
    updatedBy: 'u',
    updatedAt: null,
    deleted: false,
    locked: false,
  };
}

const section: SectionObject = {
  id: 'sec',
  type: 'section',
  x: -100,
  y: -100,
  w: 1000,
  h: 600,
  z: 1,
  title: '',
  color: 'gray',
  createdBy: { uid: 'u', name: 'u', photoURL: null },
  createdAt: null,
  updatedBy: 'u',
  updatedAt: null,
  deleted: false,
  locked: false,
};

// A: x 0〜160、B: x 180〜340（すき間 20）
const a = sticky('a', 0, 0);
const b = sticky('b', 180, 0);

describe('スタンプの付け先', () => {
  it('付箋の上なら、その付箋', () => {
    expect(findStampTarget(80, 80, [a, b], [section])?.id).toBe('a');
  });

  it('重なっていれば一番手前の付箋', () => {
    const top = sticky('top', 100, 0, 5);
    expect(findStampTarget(120, 80, [a, top], [])?.id).toBe('top');
  });

  it(`付箋の縁から ${STAMP_ATTACH_MARGIN}px 以内なら、はみ出していてもその付箋`, () => {
    expect(findStampTarget(-STAMP_ATTACH_MARGIN, 80, [a], [])?.id).toBe('a');
    expect(findStampTarget(80, 160 + STAMP_ATTACH_MARGIN, [a], [])?.id).toBe('a');
  });

  it('2枚の付箋のすき間では、近い方の付箋', () => {
    expect(findStampTarget(165, 80, [a, b], [])?.id).toBe('a');
    expect(findStampTarget(176, 80, [a, b], [])?.id).toBe('b');
  });

  it('付箋から離れていればセクション、それもなければボード', () => {
    expect(findStampTarget(600, 300, [a, b], [section])?.id).toBe('sec');
    expect(findStampTarget(2000, 2000, [a, b], [section])).toBeNull();
    expect(findStampTarget(80, 160 + STAMP_ATTACH_MARGIN + 1, [a], [])).toBeNull();
  });
});
