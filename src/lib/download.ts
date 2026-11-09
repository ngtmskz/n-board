// 書き出したファイルのダウンロード（CSV・画像で共通）
import { t } from '../i18n';

/** ファイル名：「ボード名_YYYYMMDD.拡張子」（ファイル名に使えない文字は除く） */
export function exportFileName(boardTitle: string, exportedAt: Date, extension: string) {
  const p = (n: number) => String(n).padStart(2, '0');
  const safe = boardTitle.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || t('common.board');
  return `${safe}_${exportedAt.getFullYear()}${p(exportedAt.getMonth() + 1)}${p(exportedAt.getDate())}.${extension}`;
}

/** URL（blob: や data:）の中身をファイルとしてダウンロードさせる */
export function downloadUrl(fileName: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
