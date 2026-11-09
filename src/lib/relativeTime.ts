import type { Lang } from '../i18n';

const p = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** コメントの時刻の表示。「たった今」「5分前」「3時間前」、それより前は日付と時刻（英語は Just now / 5 min ago など）。 */
export function relativeTime(date: Date, now: Date, lang: Lang = 'ja') {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  const ja = lang === 'ja';
  if (minutes < 1) return ja ? 'たった今' : 'Just now';
  if (minutes < 60) return ja ? `${minutes}分前` : `${minutes} min ago`;
  if (minutes < 24 * 60) return ja ? `${Math.floor(minutes / 60)}時間前` : `${Math.floor(minutes / 60)} hr ago`;
  const time = `${p(date.getHours())}:${p(date.getMinutes())}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  if (ja) {
    const day = `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
    return sameYear ? day : `${date.getFullYear()}年${day}`;
  }
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return sameYear ? `${day}, ${time}` : `${day}, ${date.getFullYear()}, ${time}`;
}

/** マウスを乗せたときに出す、正確な日時 */
export function fullTime(date: Date) {
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}
