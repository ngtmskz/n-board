import type { Timestamp } from 'firebase/firestore';

export const SCHEMA_VERSION = 1;

/**
 * ボードの共有範囲。
 * link: URL を知っている組織のメンバーなら誰でも。invited: 作成者と、招待したメールアドレスの人だけ。
 */
export type Visibility = 'link' | 'invited';

/** 招待できる人数の上限（Firestore のセキュリティルールと合わせる） */
export const MAX_BOARD_MEMBERS = 100;

export interface Board {
  id: string;
  title: string;
  ownerUid: string;
  ownerName: string;
  visibility: Visibility;
  /** 招待した人のメールアドレス（小文字）。visibility が invited のときに使う。古いボードにはない。 */
  memberEmails?: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  schemaVersion: number;
}

/**
 * users/{uid}：N-Board にログインしたことがある人。招待するときに名前で探せるようにする。
 * ログインするたびに本人が更新する。
 */
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}

export interface UserRef {
  uid: string;
  name: string;
  photoURL: string | null;
}

/** 将来: 'shape' | 'path' | 'timer' */
export type ObjectType = 'sticky' | 'section' | 'stamp' | 'text' | 'image' | 'connector';

export type StickyColor = 'yellow' | 'orange' | 'pink' | 'purple' | 'blue' | 'green' | 'gray';
export type SectionColor = 'gray' | 'blue' | 'green' | 'yellow' | 'pink' | 'purple';
export type TextColor = 'black' | 'gray' | 'red' | 'orange' | 'green' | 'blue' | 'purple';
/** テキストの文字の大きさ（px）。小・中・大・特大。 */
export type TextSize = 16 | 24 | 36 | 56;
export type StampKind =
  | 'like'
  | 'heart'
  | 'star'
  | 'hundred'
  | 'fire'
  | 'idea'
  | 'rofl'
  | 'eyes'
  | 'question'
  | 'face';

/** boards/{boardId}/objects/{objectId} の共通項目 */
interface BaseObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  /** 重なり順。大きいほど手前。 */
  z: number;
  createdBy: UserRef;
  createdAt: Timestamp | null;
  updatedBy: string;
  updatedAt: Timestamp | null;
  /** 論理削除。元に戻す（undo）で復活できるよう物理削除はしない。 */
  deleted: boolean;
  /** オブジェクトのロック（将来の機能）。現状は常に false。 */
  locked: boolean;
}

export interface StickyObject extends BaseObject {
  type: 'sticky';
  w: number;
  h: number;
  text: string;
  color: StickyColor;
  /** 所属しているセクションのID */
  parentId: string | null;
}

export interface SectionObject extends BaseObject {
  type: 'section';
  w: number;
  h: number;
  title: string;
  color: SectionColor;
}

export interface StampObject extends BaseObject {
  type: 'stamp';
  stampKind: StampKind;
  /** 押した先の付箋・セクション。null ならボードに直接。x, y は target からの相対位置。 */
  targetId: string | null;
}

/**
 * 背景のない文字（お題・見出しなど）。
 * autoWidth のときは文字の長さに合わせて横に伸び（上限あり）、そうでなければ w の幅で折り返す。
 * 高さは文字の量に合わせて決まる。
 */
export interface TextObject extends BaseObject {
  type: 'text';
  /** 表示上の幅。autoWidth のときは表示に合わせて保存する。 */
  w: number;
  /** 文字に合わせて横に伸びるか。この項目がない古いデータは false（幅を決めた状態）とみなす。 */
  autoWidth?: boolean;
  /** 表示上の高さ。セクションの所属判定や「全体を表示」に使う。 */
  h: number;
  text: string;
  fontSize: TextSize;
  color: TextColor;
  /** 所属しているセクションのID */
  parentId: string | null;
}

/**
 * 貼った画像。画像のファイルは Storage の src に置き、ここには表示の位置と大きさだけ持つ。
 * 付箋より奥、セクションより手前に表示する。大きさは縦横の比率を保って変える。
 */
export interface ImageObject extends BaseObject {
  type: 'image';
  w: number;
  h: number;
  /** Storage の置き場所（boards/{boardId}/images/{id}.webp など）。作ったあとは変えない。 */
  src: string;
  /** 所属しているセクションのID */
  parentId: string | null;
}

/**
 * 2つのもの（付箋・テキスト・画像・セクション）をつなぐ矢印。from から to に向く。
 * 位置は持たず、両端のものの位置から毎回描く（両端を動かすと矢印もついてくる）。x, y は使わない（常に 0）。
 * 両端のどちらかが削除されていれば表示しない（元に戻すと一緒に戻る。スタンプと同じ考え方）。
 */
export interface ConnectorObject extends BaseObject {
  type: 'connector';
  fromId: string;
  toId: string;
  /** 矢印に添える短いテキスト（「はい」「いいえ」など）。なければ空。 */
  label: string;
  /** 両向きの矢印か（from 側にも矢じりを付ける）。この項目がない古い矢印は片向き。 */
  bothEnds?: boolean;
}

export type BoardObject = StickyObject | SectionObject | StampObject | TextObject | ImageObject | ConnectorObject;

/** 矢印でつなげるもの（位置と大きさを持つもの） */
export type BoxObject = StickyObject | SectionObject | TextObject | ImageObject;

/** Firestore に保存する形（id はドキュメントIDなので含めない） */
export type ObjectData<T extends BoardObject = BoardObject> = Omit<T, 'id'>;

/** 位置・内容など、編集で変わる項目 */
export interface ObjectPatch {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
  h?: number;
  text?: string;
  title?: string;
  color?: StickyColor | SectionColor | TextColor;
  fontSize?: TextSize;
  autoWidth?: boolean;
  parentId?: string | null;
  targetId?: string | null;
  fromId?: string;
  toId?: string;
  label?: string;
  bothEnds?: boolean;
  deleted?: boolean;
}

/**
 * boards/{boardId}/comments/{commentId}：付箋へのコメント。
 * 返信の入れ子や「解決済み」はなし。本文の編集は書いた本人だけ、削除（論理削除）は本人とボード作成者。
 * 付箋が削除されたら、付箋と一緒に見えなくなる（元に戻すと一緒に戻る）。
 */
export interface BoardComment {
  id: string;
  /** コメントを付けた付箋の ID */
  targetId: string;
  text: string;
  createdBy: UserRef;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  /** 一度でも本文を直したか（「編集済み」と表示する） */
  edited: boolean;
  deleted: boolean;
}

export interface Presence {
  uid: string;
  name: string;
  photoURL: string | null;
  lastSeen: Timestamp | null;
}

export type TimerStatus = 'idle' | 'running' | 'paused';

/**
 * boards/{boardId}/state/timer。ボード全体で1つのタイマー。
 * 動いている間の残り時間 = remainingMs -（サーバーの今の時刻 - startedAt）。
 */
export interface TimerState {
  status: TimerStatus;
  /** 設定した長さ（+1分 を含む）。残り時間の割合の表示に使う。 */
  durationMs: number;
  /** startedAt の時点の残り時間。一時停止中はそのときの残り時間。 */
  remainingMs: number;
  /** 動かし始めた（再開した）サーバーの時刻。止まっている間は null。 */
  startedAt: Timestamp | null;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface HistoryEntry {
  boardId: string;
  title: string;
  ownerUid: string;
  lastOpenedAt: Timestamp | null;
  /** 最後に開いていたときの付箋とコメントの数（ほかの人があとで足した分は、次に開くまで反映されない） */
  stickyCount?: number;
  commentCount?: number;
}
