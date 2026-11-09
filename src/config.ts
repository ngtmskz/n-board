// 環境ごとの設定。値は .env（共通）と .env.development / .env.production から読み込む。
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string,
  appId: env.VITE_FIREBASE_APP_ID as string,
  // 画像の置き場所（Cloud Storage）。エミュレーターではバケット名は何でもよいので、未設定ならプロジェクトから決める
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
    `${env.VITE_FIREBASE_PROJECT_ID as string}.firebasestorage.app`,
};

export const useEmulators = env.VITE_USE_EMULATORS === 'true';

/** アプリの名前と説明。使う組織ごとに .env で変えられる（アイコンは public/favicon.svg を差し替える） */
export const appName = String(env.VITE_APP_NAME || 'N-Board');
const taglines = {
  ja: String(env.VITE_APP_TAGLINE_JA || 'みんなのホワイトボード'),
  en: String(env.VITE_APP_TAGLINE_EN || 'Whiteboard for everyone'),
};

/** 説明は表示の言語に合わせる */
export function appTagline(lang: 'ja' | 'en') {
  return taglines[lang];
}

/**
 * ご意見・ご要望の連絡先。「このサービスについて」に出す。.env の VITE_APP_CONTACT で変えられ、空にすると出さない。
 */
export const appContact = String(import.meta.env.VITE_APP_CONTACT ?? '').trim();

/** もとになったオープンソースの N-Board。「このサービスについて」のいちばん下に出す */
export const poweredBy = {
  name: 'N-Board',
  url: 'https://github.com/ngtmskz/n-board',
  author: 'Masa Nagata',
};

/** 「Powered by N-Board」を出すか。.env の VITE_SHOW_POWERED_BY=false で消せる（消してもライセンス上の問題はない） */
export const showPoweredBy = String(env.VITE_SHOW_POWERED_BY ?? 'true').trim() !== 'false';

/** 使い方のページ（public/guide.html）。日本語のみ */
export const guideUrl = '/guide.html';

export const allowedDomains: string[] = String(env.VITE_ALLOWED_DOMAINS ?? '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** 画面側の表示用チェック。実際の制限は Firestore のセキュリティルールで行う。 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return allowedDomains.includes(domain);
}
