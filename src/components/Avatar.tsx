import { useState } from 'react';
import { initials } from '../auth';

/**
 * Google アカウントの写真。写真がない・読み込めない場合はイニシャルを出す。
 * stamp のときは、ボードに貼った顔のスタンプと同じ色のイニシャルにする（スタンプのパレットや押す前の見本で使う）。
 */
export function Avatar({
  name,
  photoURL,
  size = 30,
  stamp = false,
}: {
  name: string;
  photoURL: string | null;
  size?: number;
  stamp?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (photoURL && !broken) {
    return (
      <img
        className="avatar"
        style={style}
        src={photoURL}
        alt={name}
        title={name}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`avatar avatar-initials${stamp ? ' avatar-stamp' : ''}`} style={style} title={name}>
      {initials(name)}
    </span>
  );
}
