// 画像の書き出しのテスト（エミュレーター不要）
import { describe, expect, it } from 'vitest';
import { exportFileName } from '../src/lib/download';
import { imageScale } from '../src/lib/exportImage';

describe('画像の倍率', () => {
  it('ふつうの大きさのボードは2倍', () => {
    expect(imageScale(2000, 700)).toBe(2);
  });

  it('大きなボードは、画像の面積がブラウザの上限に収まるまで下げる', () => {
    const scale = imageScale(6000, 4000);
    expect(scale).toBeLessThan(2);
    expect(6000 * scale * 4000 * scale).toBeLessThanOrEqual(16_777_216 + 1);
  });

  it('横に長いボードは、1辺の上限に収まるまで下げる', () => {
    expect(20000 * imageScale(20000, 300)).toBeLessThanOrEqual(16_384);
  });
});

describe('ファイル名', () => {
  it('CSV と同じ「ボード名_日付」で、拡張子だけ変わる', () => {
    expect(exportFileName('10月の/振り返り?', new Date('2026-10-25T15:30:00'), 'png')).toBe('10月の 振り返り_20261025.png');
  });
});
