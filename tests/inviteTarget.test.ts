// 招待の欄で Enter を押したときに招待する相手のテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { inviteTarget } from '../src/lib/inviteTarget';

describe('招待する相手', () => {
  it('名前の一部を入力して候補が1人なら、その人を招待する', () => {
    expect(inviteTarget('田中', [{ email: 'tanaka@example.com' }])).toBe('tanaka@example.com');
  });

  it('メールアドレスを最後まで入力したら、候補が別の人でも入力したとおりのアドレスを招待する', () => {
    expect(inviteTarget('tanaka@example.com', [{ email: 'xtanaka@example.com' }])).toBe('tanaka@example.com');
    expect(inviteTarget(' tanaka@example.com ', [{ email: 'attacker@example.com' }])).toBe('tanaka@example.com');
  });

  it('メールアドレスが途中までなら、候補が1人のときはその人を招待する', () => {
    expect(inviteTarget('tanaka@exa', [{ email: 'tanaka@example.com' }])).toBe('tanaka@example.com');
  });

  it('候補がいないか2人以上なら、入力したとおりにする', () => {
    expect(inviteTarget('suzuki@example.com', [])).toBe('suzuki@example.com');
    expect(inviteTarget('田中', [{ email: 'a@example.com' }, { email: 'b@example.com' }])).toBe('田中');
  });
});
