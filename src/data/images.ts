// 貼った画像のファイル（Cloud Storage の boards/{boardId}/images/）
import { deleteObject, getBlob, listAll, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';

/** 画像の形式ごとのファイルの拡張子（Storage のルールと Firestore のルールで許している形式） */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function imagePath(boardId: string, imageId: string, contentType: string) {
  return `boards/${boardId}/images/${imageId}.${EXTENSIONS[contentType]}`;
}

export function uploadImage(path: string, blob: Blob, contentType: string) {
  return uploadBytes(ref(storage, path), blob, { contentType, cacheControl: 'private, max-age=31536000' });
}

/**
 * 画像を読み込み、画面に出せる URL（blob:）にする。同じ画像は一度だけ読み込む。
 * ダウンロード用の URL（URL を知っていれば誰でも見られる）は使わず、ルールで守られた読み込みにする。
 */
const urls = new Map<string, Promise<string>>();
export function loadImageUrl(path: string): Promise<string> {
  let p = urls.get(path);
  if (!p) {
    p = getBlob(ref(storage, path)).then((blob) => URL.createObjectURL(blob));
    // 失敗したときは、次に表示するときにもう一度読み込む
    p.catch(() => urls.delete(path));
    urls.set(path, p);
  }
  return p;
}

/** 貼ったばかりの画像は、読み込み直さずに手元のファイルをそのまま使う */
export function rememberImage(path: string, blob: Blob) {
  urls.set(path, Promise.resolve(URL.createObjectURL(blob)));
}

/** ボードの画像をすべて消す（ボードの削除時、作成者のみ） */
export async function deleteBoardImages(boardId: string) {
  const list = await listAll(ref(storage, `boards/${boardId}/images`));
  await Promise.all(list.items.map((item) => deleteObject(item)));
}
