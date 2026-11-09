// 画像・文字を貼る（⌘V・ドラッグ＆ドロップ・ツールバーの「画像」ボタン）
import { toast } from '../components/Toast';
import { t } from '../i18n';
import { IMAGE_TYPES, type ImageError } from '../lib/imageFile';
import { addImages, addPastedText, pasteClip } from './actions';
import { decodeClip } from './clipboard';
import { useBoard } from './store';

/** いま画面に見えている範囲の真ん中（キャンバス上の座標） */
export function viewportCenter() {
  const el = document.querySelector<HTMLElement>('.canvas');
  const v = useBoard.getState().viewport;
  const w = el?.clientWidth ?? window.innerWidth;
  const h = el?.clientHeight ?? window.innerHeight;
  return { x: (w / 2 - v.offsetX) / v.zoom, y: (h / 2 - v.offsetY) / v.zoom };
}

/** キャンバスの上にあるマウスの位置（画面の座標）。キャンバスの外にあるときは null。 */
let pointer: { clientX: number; clientY: number } | null = null;

export function setPastePointer(p: { clientX: number; clientY: number } | null) {
  pointer = p ? { clientX: p.clientX, clientY: p.clientY } : null;
}

/**
 * ⌘V で貼る位置（キャンバス上の座標）。マウスがキャンバスの上にあればその位置、なければ画面の真ん中。
 * 画面の座標で覚えておき、貼るときに変換するので、マウスを動かさずに画面を動かしても、いま指している場所に貼る。
 */
export function pastePoint() {
  const el = document.querySelector<HTMLElement>('.canvas');
  if (!pointer || !el) return viewportCenter();
  const r = el.getBoundingClientRect();
  const v = useBoard.getState().viewport;
  return { x: (pointer.clientX - r.left - v.offsetX) / v.zoom, y: (pointer.clientY - r.top - v.offsetY) / v.zoom };
}

const ERROR_MESSAGES: Record<ImageError, () => string> = {
  type: () => t('image.errorType'),
  tooLarge: () => t('image.errorTooLarge'),
  unreadable: () => t('image.errorUnreadable'),
};

/** 画像のファイルを (x, y) を中心に貼る。貼れなかったものがあれば知らせる。 */
export async function insertImageFiles(files: File[], at = viewportCenter()) {
  if (files.length === 0) return;
  const errors = await addImages(files, at.x, at.y);
  // 同じ理由で貼れなかったものは、まとめて1回だけ知らせる
  for (const e of new Set(errors)) toast(ERROR_MESSAGES[e]());
}

/** ドロップ・貼り付けで渡されたファイルのうち、画像らしいもの（形式の確認は貼るときに行う） */
export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
}

/** 一度に取りに行く画像の数の上限（HTML の中の画像） */
const MAX_HTML_IMAGES = 10;

/** コピーされた HTML の中の画像のありか（http(s) か data:）。Google スライドなどは画像そのものではなくこれが入る。 */
function imageUrlsInHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('img')]
    .map((img) => img.getAttribute('src') ?? '')
    .filter((src) => /^(https?:|data:image\/)/.test(src))
    .slice(0, MAX_HTML_IMAGES);
}

/**
 * HTML の中の画像を取りに行って貼る。画像のサイトがほかのサイトからの読み込みを許していないときは取れないので、
 * スクリーンショットで貼るよう案内する。
 */
async function insertImagesFromHtml(urls: string[], at: { x: number; y: number }) {
  const files: File[] = [];
  let failed = false;
  for (const [i, url] of urls.entries()) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      files.push(new File([blob], `pasted-${i}`, { type: blob.type }));
    } catch (e) {
      console.error(e);
      failed = true;
    }
  }
  if (failed) toast(t('image.errorRemote'));
  await insertImageFiles(files, at);
}

/**
 * ⌘V で、マウスの位置（キャンバスの外なら画面の真ん中）に貼る。N-Board でコピーした付箋・セクションなどが入っていれば、それを貼る（別のボードからでもよい）。
 * そうでなく文字が入っていれば文字（テキスト）として、文字がなく画像だけなら画像として貼る。
 * Excel のセルのように文字と画像の両方が入っているときは、文字を優先する。
 * 画像のデータがなく、HTML の中に画像のありかだけがあるとき（Google スライドなど）は、それを取りに行って貼る。
 * 貼るものがあれば true（ブラウザの既定の貼り付けを止める）。
 */
export function pasteFromClipboard(data: DataTransfer | null): boolean {
  if (!data) return false;
  const clip = decodeClip(data.getData('text/html'));
  if (clip) {
    const at = pastePoint();
    void pasteClip(clip, at.x, at.y);
    return true;
  }
  const text = data.getData('text/plain');
  if (text.trim()) {
    const at = pastePoint();
    if (addPastedText(text, at.x, at.y)) toast(t('text.pasteCut'));
    return true;
  }
  const files = imageFiles(data.files);
  if (files.length > 0) {
    insertImageFiles(files, pastePoint());
    return true;
  }
  const urls = imageUrlsInHtml(data.getData('text/html'));
  if (urls.length > 0) {
    insertImagesFromHtml(urls, pastePoint());
    return true;
  }
  // 何か入っているのに貼れなかったときは、何も起きないと戸惑うので知らせる（入っていた形式は調べるために残す）
  if (data.types.length > 0) {
    console.info('貼れなかったクリップボードの形式', [...data.types]);
    toast(t('image.errorRemote'));
  }
  return false;
}

/** ファイルを選ぶ画面の「選べる形式」 */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
