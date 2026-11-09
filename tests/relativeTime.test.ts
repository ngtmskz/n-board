// コメントの時刻の表示のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { relativeTime } from '../src/lib/relativeTime';

const now = new Date('2026-10-25T15:30:00');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('コメントの時刻（英語）', () => {
  it('Just now / min ago / hr ago、それより前は月と日', () => {
    expect(relativeTime(ago(0.5), now, 'en')).toBe('Just now');
    expect(relativeTime(ago(5), now, 'en')).toBe('5 min ago');
    expect(relativeTime(ago(60), now, 'en')).toBe('1 hr ago');
    expect(relativeTime(new Date('2026-10-23T09:05:00'), now, 'en')).toBe('Oct 23, 09:05');
    expect(relativeTime(new Date('2025-12-31T18:00:00'), now, 'en')).toBe('Dec 31, 2025, 18:00');
  });
});

describe('コメントの時刻', () => {
  it('1分未満は「たった今」、1時間未満は「○分前」、1日未満は「○時間前」', () => {
    expect(relativeTime(ago(0.5), now)).toBe('たった今');
    expect(relativeTime(ago(5), now)).toBe('5分前');
    expect(relativeTime(ago(59), now)).toBe('59分前');
    expect(relativeTime(ago(60), now)).toBe('1時間前');
    expect(relativeTime(ago(23 * 60 + 59), now)).toBe('23時間前');
  });

  it('それより前は日付と時刻。年が違えば年も付ける', () => {
    expect(relativeTime(new Date('2026-10-23T09:05:00'), now)).toBe('10月23日 09:05');
    expect(relativeTime(new Date('2025-12-31T18:00:00'), now)).toBe('2025年12月31日 18:00');
  });
});
