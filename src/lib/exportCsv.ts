// ボードの付箋・テキストを CSV に書き出す。
// 先頭に「#」で始まる説明の行を付け、AI に渡してもスプレッドシートで開いても読めるようにする。
// 列を増やすときは COLUMNS に足すだけでよい。見出しや説明は書き出した人の表示の言語で出す。
import { STAMPS } from '../constants';
import { t, type MessageKey } from '../i18n';
import { downloadUrl, exportFileName } from './download';
import type { BoardComment, BoardObject, ConnectorObject, SectionObject, StampKind, StampObject, StickyObject, TextObject } from '../types';

type Item = StickyObject | TextObject;

/** CSV の1行分の材料 */
interface Row {
  number: number;
  item: Item;
  section: SectionObject | null;
  stamps: Record<StampKind, number>;
  /** この付箋へのコメント（古い順） */
  comments: BoardComment[];
  /** 矢印でつないだ先の行（番号と、矢印に添えた言葉） */
  next: { number: number; label: string }[];
}

/** 色の名前（付箋とテキストの色。どちらも i18n の color.yellow などにある） */
function colorName(color: string) {
  const key = `color.${color}` as MessageKey;
  return key in COLOR_KEYS ? t(key) : color;
}
const COLOR_KEYS = Object.fromEntries(
  ['yellow', 'orange', 'pink', 'purple', 'blue', 'green', 'gray', 'black', 'red'].map((c) => [`color.${c}`, true]),
);

/** スタンプの列の見出し（顔のスタンプは写真なので文字で出す） */
function stampHeader(kind: StampKind) {
  return kind === 'face' ? t('csv.stampFace') : (STAMPS.find((s) => s.kind === kind)?.emoji ?? kind);
}

function formatDate(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function totalStamps(row: Row) {
  return Object.values(row.stamps).reduce((a, b) => a + b, 0);
}

/** 列の定義。左から順に並ぶ。見出しは書き出すときの言語で出す。 */
const COLUMNS: { header: () => string; value: (row: Row) => string | number }[] = [
  { header: () => t('csv.colNumber'), value: (r) => r.number },
  { header: () => t('csv.colSection'), value: (r) => r.section?.title ?? '' },
  { header: () => t('csv.colKind'), value: (r) => (r.item.type === 'sticky' ? t('csv.kindSticky') : t('csv.kindText')) },
  { header: () => t('csv.colText'), value: (r) => r.item.text },
  { header: () => t('csv.colColor'), value: (r) => colorName(r.item.color) },
  { header: () => t('csv.colAuthor'), value: (r) => r.item.createdBy.name },
  { header: () => t('csv.colCreatedAt'), value: (r) => (r.item.createdAt ? formatDate(r.item.createdAt.toDate()) : '') },
  ...STAMPS.map((s) => ({ header: () => stampHeader(s.kind), value: (r: Row) => r.stamps[s.kind] })),
  { header: () => t('csv.colStampTotal'), value: totalStamps },
  { header: () => t('csv.colCommentCount'), value: (r) => r.comments.length },
  {
    header: () => t('csv.colComments'),
    value: (r) => r.comments.map((c) => t('csv.commentLine', { name: c.createdBy.name, text: c.text })).join('\n'),
  },
  {
    header: () => t('csv.colNext'),
    value: (r) => r.next.map((n) => (n.label.trim() ? `${n.number}（${n.label.trim()}）` : String(n.number))).join(', '),
  },
];

const EXPLANATION: MessageKey[] = [
  'csv.explain1',
  'csv.explain2',
  'csv.explain3',
  'csv.explain4',
  'csv.explain5',
  'csv.explain6',
  'csv.explain7',
  'csv.explain8',
];

/** 「上から下、左から右」に読む順の並べ替え。ほぼ同じ高さ（この幅以内）のものは同じ行として左から並べる。 */
const ROW_TOLERANCE = 80;

/**
 * 上から順に見て、行の一番上のものから ROW_TOLERANCE 以内にあるものを同じ行にまとめ、行の中は左から並べる。
 * （高さを一定の幅で区切る方法だと、数px しか違わないものが区切りをまたいで別の行になってしまうため）
 */
export function inReadingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  const rows: T[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1];
    if (row && item.y - row[0].y <= ROW_TOLERANCE) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** セクションをひとまとまりとして、ボードの左上から読む順に付箋・テキストを並べる */
export function orderRows(objects: BoardObject[], comments: BoardComment[] = []): Row[] {
  const live = objects.filter((o) => !o.deleted);
  const sections = new Map(live.filter((o): o is SectionObject => o.type === 'section').map((s) => [s.id, s]));
  const items = live.filter((o): o is Item => o.type === 'sticky' || o.type === 'text');
  const stamps = live.filter((o): o is StampObject => o.type === 'stamp');

  const members = new Map<string, Item[]>();
  const blocks: ({ x: number; y: number } & ({ section: SectionObject } | { item: Item }))[] = [];
  for (const item of items) {
    const section = item.parentId ? sections.get(item.parentId) : undefined;
    if (section) {
      if (!members.has(section.id)) members.set(section.id, []);
      members.get(section.id)!.push(item);
    } else {
      blocks.push({ x: item.x, y: item.y, item });
    }
  }
  for (const section of sections.values()) {
    if (members.has(section.id)) blocks.push({ x: section.x, y: section.y, section });
  }
  const ordered = inReadingOrder(blocks);

  const stampCounts = (id: string) => {
    const counts = Object.fromEntries(STAMPS.map((s) => [s.kind, 0])) as Record<StampKind, number>;
    for (const s of stamps) if (s.targetId === id) counts[s.stampKind] += 1;
    return counts;
  };

  const commentsOf = (id: string) =>
    comments
      .filter((c) => !c.deleted && c.targetId === id)
      .sort((a, b) => (a.createdAt?.toDate().getTime() ?? 0) - (b.createdAt?.toDate().getTime() ?? 0));

  const rows: Row[] = [];
  for (const block of ordered) {
    const group = 'section' in block ? inReadingOrder(members.get(block.section.id)!) : [block.item];
    for (const item of group) {
      rows.push({
        number: rows.length + 1,
        item,
        section: 'section' in block ? block.section : null,
        stamps: stampCounts(item.id),
        comments: commentsOf(item.id),
        next: [],
      });
    }
  }
  // 矢印のつなぎ先（両端とも表にあるものだけ）。つなぎ先の番号の順に並べる。
  const numberOf = new Map(rows.map((r) => [r.item.id, r.number]));
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  for (const c of live.filter((o): o is ConnectorObject => o.type === 'connector')) {
    const from = byId.get(c.fromId);
    const to = numberOf.get(c.toId);
    if (from && to !== undefined) from.next.push({ number: to, label: c.label });
    // 両向きの矢印は、つなぎ先の行にも書く
    const back = byId.get(c.toId);
    const fromNumber = numberOf.get(c.fromId);
    if (c.bothEnds && back && fromNumber !== undefined) back.next.push({ number: fromNumber, label: c.label });
  }
  for (const r of rows) r.next.sort((a, b) => a.number - b.number);
  return rows;
}

/**
 * 表計算ソフトで開いたときに、=・+・-・@ などで始まる文章が数式として動かないよう、先頭に「'」を付ける。
 * 「-」で始まるものは、ただの数値（-3、-0.5）と「-」1文字だけはそのままにする。
 * 「- 箇条書き」も Excel では数式として扱われる（「- 2+3」は計算され、文章は #NAME? になる）ので対象にする。
 */
function neutralize(value: string) {
  if (/^[=+@\t\r]/.test(value)) return `'${value}`;
  if (value.startsWith('-') && value !== '-' && !/^-\d+(\.\d+)?$/.test(value)) return `'${value}`;
  return value;
}

function cell(value: string | number) {
  const s = typeof value === 'number' ? String(value) : neutralize(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * どの付箋・テキストにも付いていないスタンプ（ボードやセクションに押されたもの）の数の説明。
 * 表の数え漏れに気づけるよう、説明の行に入れる。
 */
function unattachedStampsLine(objects: BoardObject[]) {
  const live = objects.filter((o) => !o.deleted);
  const itemIds = new Set(live.filter((o) => o.type === 'sticky' || o.type === 'text').map((o) => o.id));
  const counts = new Map<StampKind, number>();
  for (const o of live) {
    if (o.type === 'stamp' && !(o.targetId && itemIds.has(o.targetId))) {
      counts.set(o.stampKind, (counts.get(o.stampKind) ?? 0) + 1);
    }
  }
  const parts = STAMPS.filter((s) => counts.get(s.kind)).map((s) => `${stampHeader(s.kind)} ${counts.get(s.kind)}`);
  return t('csv.unattached', { list: parts.length ? parts.join(t('csv.listSeparator')) : t('common.none') });
}

/**
 * 先頭の説明の行（ボード名と書き出した日時）。
 * ボード名のカンマや改行で行が別のセルや行に分かれ、「=」などで始まるセルができないよう、
 * 改行は空白にし、カンマを含むときは行全体を1つのセルに収める（先頭が「#」なので数式にはならない）。
 */
function headingLine(boardTitle: string, exportedAt: Date) {
  const title = boardTitle.replace(/[\r\n]+/g, ' ');
  const line = `# ${t('csv.heading', { title, date: formatDate(exportedAt) })}`;
  return line.includes(',') ? `"${line.replace(/"/g, '""')}"` : line;
}

/** CSV の中身を作る。Excel で文字化けしないよう、ダウンロード時に先頭に BOM を付ける。 */
export function buildBoardCsv(
  boardTitle: string,
  objects: BoardObject[],
  comments: BoardComment[],
  exportedAt: Date,
): string {
  const lines = [
    headingLine(boardTitle, exportedAt),
    ...EXPLANATION.map((key) => `# ${t(key)}`),
    `# ${unattachedStampsLine(objects)}`,
    '#',
    COLUMNS.map((c) => cell(c.header())).join(','),
    ...orderRows(objects, comments).map((row) => COLUMNS.map((c) => cell(c.value(row))).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}

/** ファイル名：「ボード名_YYYYMMDD.csv」 */
export function csvFileName(boardTitle: string, exportedAt: Date) {
  return exportFileName(boardTitle, exportedAt, 'csv');
}

export function downloadCsv(fileName: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  downloadUrl(fileName, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
