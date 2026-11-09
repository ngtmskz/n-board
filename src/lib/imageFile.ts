// 貼る画像の準備：形式と大きさを確かめ、大きい画像は縮めてから保存する

/** 貼れる画像の形式（SVG は中にスクリプトを含められるので貼れない） */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** 貼れる画像の大きさの上限（元のファイル） */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 保存する画像の大きさの上限（Storage のルールと合わせる）。GIF は縮めないので、そのままこの大きさまで。 */
export const MAX_STORED_BYTES = 5 * 1024 * 1024;
/** 保存するときの長い辺の上限（px）。ブレストで貼る画面のスクリーンショットの文字が読める大きさ。 */
const MAX_SIDE = 1600;

export type ImageError = 'type' | 'tooLarge' | 'unreadable';

export interface PreparedImage {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 画像のファイルを保存できる形にする。
 * 長い辺が 1600px を超えるものは縮め、WebP（使えないブラウザでは PNG か JPEG）にする。
 * GIF はアニメーションを残すため縮めずにそのまま保存する。
 */
export async function prepareImage(file: File): Promise<PreparedImage | ImageError> {
  if (!IMAGE_TYPES.includes(file.type)) return 'type';
  if (file.size > MAX_IMAGE_BYTES) return 'tooLarge';
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return 'unreadable';
  }
  const { width, height } = bitmap;
  if (file.type === 'image/gif') {
    bitmap.close();
    if (file.size > MAX_STORED_BYTES) return 'tooLarge';
    return { blob: file, contentType: file.type, width, height };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let blob = await toBlob(canvas, 'image/webp', 0.85);
  // WebP で書き出せないブラウザ（Safari の一部）では、透明を使う PNG は PNG のまま、それ以外は JPEG にする
  if (!blob || blob.type !== 'image/webp') {
    blob = file.type === 'image/png' ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', 0.85);
  }
  if (!blob) return 'unreadable';
  if (blob.size > MAX_STORED_BYTES) return 'tooLarge';
  return { blob, contentType: blob.type, width: w, height: h };
}
