import type { SectionColor, StampKind, StickyColor, TextColor, TextSize } from './types';

/** ドラッグ中に Firestore へ位置を書き込む間隔（ミリ秒）。手を離した時点の位置は必ず書き込む。 */
export const DRAG_WRITE_INTERVAL_MS = 250;
/** 文字入力中に書き込むまでの待ち時間（ミリ秒） */
export const TEXT_WRITE_DEBOUNCE_MS = 500;
/** 参加中の表示：ハートビートの間隔と、参加中とみなす期間 */
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_TIMEOUT_MS = 75_000;
export const UNDO_LIMIT = 100;

export const STICKY_SIZE = 160;
/** 「＋」で足す付箋と元の付箋の間隔（点の模様の間隔と同じ） */
export const STICKY_GAP = 24;
/** 横長の付箋の幅。正方形2枚とそのあいだのすき間にそろえ、混ぜて並べても横幅がそろうようにする。 */
export const STICKY_WIDE_WIDTH = STICKY_SIZE * 2 + STICKY_GAP;
export const SECTION_DEFAULT = { w: 560, h: 380 };
export const STAMP_SIZE = 32;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;

export const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: '#fff2a8',
  orange: '#ffd3a1',
  pink: '#ffc7d9',
  purple: '#dcc9ff',
  blue: '#c3e2ff',
  green: '#c8efc1',
  gray: '#e4e4e4',
};

export const SECTION_COLORS: Record<SectionColor, { bg: string; border: string }> = {
  gray: { bg: 'rgba(120,120,130,0.08)', border: '#9a9aa3' },
  blue: { bg: 'rgba(60,130,240,0.08)', border: '#5c8fe6' },
  green: { bg: 'rgba(50,170,90,0.08)', border: '#4fa86a' },
  yellow: { bg: 'rgba(230,180,20,0.10)', border: '#d1a51e' },
  pink: { bg: 'rgba(230,80,140,0.08)', border: '#d9649a' },
  purple: { bg: 'rgba(140,90,230,0.08)', border: '#9471dc' },
};

/**
 * スタンプはビジュアルでのコミュニケーションなので、意味を表すラベルは画面に出さない。
 * name は形を表す呼び名で、画面読み上げ用にだけ使う。
 */
export const TEXT_COLORS: Record<TextColor, string> = {
  black: '#1d1d22',
  gray: '#6b6b76',
  red: '#d6384a',
  orange: '#e07b16',
  green: '#2f8f4e',
  blue: '#3b6cf6',
  purple: '#7c4ddb',
};

/** テキストの文字の大きさ（表示名は i18n の size.16 など） */
export const TEXT_SIZES: TextSize[] = [16, 24, 36, 56];

export const TEXT_DEFAULT = { w: 240, fontSize: 24 as TextSize, color: 'black' as TextColor };
/** テキストの行の高さ（文字の大きさに対する倍率）と上下の余白。styles.css の .textbox と合わせる。 */
export const TEXT_LINE_HEIGHT = 1.35;
export const TEXT_PADDING_Y = 4;
export const TEXT_MIN_WIDTH = 60;
/** 自動で伸びるテキストの幅の上限。日本語の長い文を貼り付けても画面の外まで伸びないようにする。 */
export const TEXT_AUTO_MAX_WIDTH = 800;

/**
 * スタンプの種類（パネルに出す順。表示名は i18n の stamp.like など）。id は Firestore のセキュリティルール（validStamp）と合わせる。
 * 絵は Noto Emoji（Google）。止まった絵は public/stamps/*.svg、貼ったときの動きは public/stamps/anim/*.json（Lottie）。
 * emoji は CSV の見出しなど、文字で書くときに使う。
 */
export const STAMPS: { kind: StampKind; emoji: string }[] = [
  { kind: 'like', emoji: '👍' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'star', emoji: '⭐' },
  { kind: 'hundred', emoji: '💯' },
  { kind: 'fire', emoji: '🔥' },
  { kind: 'idea', emoji: '💡' },
  { kind: 'rofl', emoji: '🤣' },
  { kind: 'eyes', emoji: '👀' },
  { kind: 'question', emoji: '❓' },
  { kind: 'face', emoji: '🙂' },
];

/** 絵文字のスタンプ（顔のスタンプは名前の頭文字や写真を出すので絵はない） */
export type EmojiStampKind = Exclude<StampKind, 'face'>;

/** スタンプの止まった絵 */
export function stampImageUrl(kind: EmojiStampKind) {
  return `/stamps/${kind}.svg`;
}

/** スタンプを貼ったときの動き（Lottie） */
export function stampAnimationUrl(kind: EmojiStampKind) {
  return `/stamps/anim/${kind}.json`;
}

/** 貼ったときに動かす長さの目安。短い動きは繰り返して、どれもだいたいこのくらい動くようにする。 */
export const STAMP_ANIMATION_SECONDS = 2;

/**
 * 動きのファイルに止まる位置（rest の目印）がない、または最後まで再生すると消えてしまうもの：
 * end のコマまで再生して、rest のコマで止める。
 */
export const STAMP_ANIMATION_OVERRIDES: Partial<Record<EmojiStampKind, { end: number; rest: number }>> = {
  question: { end: 60, rest: 60 },
};

/**
 * BGM の曲（パネルには落ち着いた順に並べる。表示名は i18n の bgm.relax など）。id は Firestore のセキュリティルール（validBgm）と合わせる。
 * 音源は public/music に置く（OtoLogic の曲をループ用に編集したもの。出典は public/music/CREDITS.md）。
 */
export const BGM_TRACKS = [
  { id: 'relax', file: '/music/relax.mp3' },
  { id: 'focus', file: '/music/focus.mp3' },
  { id: 'happy', file: '/music/happy.mp3' },
  { id: 'groove', file: '/music/groove.mp3' },
] as const;

export type BgmTrackId = (typeof BGM_TRACKS)[number]['id'];
