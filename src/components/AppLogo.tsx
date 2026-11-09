import { appName, appTagline } from '../config';
import { useLang } from '../i18n';

/**
 * アプリのアイコン。ブラウザのタブのアイコンと同じ public/favicon.svg を使うので、
 * 差し替えればヘッダーやログイン画面のアイコンも変わる。
 * 標準のアイコンは、4色の付箋を2×2に貼り、右下の1枚を少し右にずらして左に傾けた形。
 */
export function AppIcon({ size = 28 }: { size?: number }) {
  return <img className="app-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size} alt="" />;
}

/** ヘッダーのロゴ：アイコン＋太字の名前＋通常の文字の説明 */
export function AppLogo() {
  const lang = useLang((s) => s.lang);
  return (
    <div className="app-logo">
      <AppIcon />
      <h1 className="app-logo-name">{appName}</h1>
      <span className="app-logo-tagline">{appTagline(lang)}</span>
    </div>
  );
}
