import { MessageSquare } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { initials } from '../auth';
import {
  SECTION_COLORS,
  STAMP_SIZE,
  STICKY_COLORS,
  STICKY_SIZE,
  TEXT_AUTO_MAX_WIDTH,
  TEXT_COLORS,
  TEXT_LINE_HEIGHT,
  TEXT_PADDING_Y,
  TEXT_WRITE_DEBOUNCE_MS,
} from '../constants';
import { loadImageUrl } from '../data/images';
import type { ImageObject, SectionObject, StampObject, StickyObject, TextObject } from '../types';
import { useT } from '../i18n';
import { isImeComposing } from '../lib/isTyping';
import { commitChanges, deleteObjects, saveDraft, setTextAutoWidth, syncTextSize } from './actions';
import { useCommentCount } from './comments';
import { LinkedText } from './LinkedText';
import { usePreview } from './PlacementPreview';
import { StampEmoji } from './StampEmoji';
import { setOverride, settleOverrides, useBoard } from './store';

export type ObjectPointerDown = (e: ReactPointerEvent, id: string) => void;

/** 文字の量に合わせて付箋の文字サイズを小さくする。横長の付箋は広い分だけ、同じ大きさで多く入る。 */
function stickyFontSize(text: string, width: number) {
  const n = (text.length * STICKY_SIZE) / width;
  if (n <= 12) return 22;
  if (n <= 30) return 18;
  if (n <= 60) return 15;
  if (n <= 120) return 13;
  return 11;
}

/**
 * 文字の編集。入力中は一定間隔で途中保存し、編集を終えたときに元に戻すへ記録する。
 * 入力欄から離れたときだけでなく、他の操作で編集画面が閉じたときも必ず保存する。
 * onFinish は入力欄から離れて編集を終えたときに、最後の文字を渡して呼ぶ。
 */
export function useTextEditing(id: string, field: 'text' | 'title' | 'label', initial: string, onFinish?: (text: string) => void) {
  const original = useRef(initial);
  const latest = useRef(initial);
  const done = useRef(false);
  const [value, setValue] = useState(initial);
  const timer = useRef<number | undefined>(undefined);

  const change = (next: string) => {
    setValue(next);
    latest.current = next;
    setOverride(id, { [field]: next });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveDraft(id, { [field]: next }), TEXT_WRITE_DEBOUNCE_MS);
  };

  const save = () => {
    if (done.current) return;
    done.current = true;
    window.clearTimeout(timer.current);
    if (latest.current !== original.current) {
      commitChanges([{ id, before: { [field]: original.current }, after: { [field]: latest.current } }]);
    }
    settleOverrides([id]);
  };

  const finish = () => {
    save();
    useBoard.setState({ editingId: null });
    onFinish?.(latest.current);
  };

  useEffect(() => {
    done.current = false;
    return save;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { value, change, finish };
}

function StickyEditor({ sticky }: { sticky: StickyObject }) {
  const t = useT();
  const { value, change, finish } = useTextEditing(sticky.id, 'text', sticky.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="sticky-text sticky-editor"
      style={{ fontSize: stickyFontSize(value, sticky.w) }}
      value={value}
      maxLength={2000}
      placeholder={t('sticky.placeholder')}
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (isImeComposing(e)) return;
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** ダブルクリックで文字の編集を始める。画面移動のツールのときは「選択」に戻す。 */
function startEditing(id: string) {
  useBoard.setState((s) => ({
    selectedIds: [id],
    editingId: id,
    tool: s.tool.kind === 'hand' ? { kind: 'select' } : s.tool,
  }));
}

export function Sticky({
  sticky,
  selected,
  editing,
  onPointerDown,
}: {
  sticky: StickyObject;
  selected: boolean;
  editing: boolean;
  onPointerDown: ObjectPointerDown;
}) {
  const t = useT();
  // スタンプを押す・動かすとき（コメントのツールで付箋を指しているときも）、この付箋が対象なら光らせる
  const stampTarget = usePreview((s) => s.target === sticky.id);
  const commentCount = useCommentCount(sticky.id);
  const commentOpen = useBoard((s) => s.commentTargetId === sticky.id);
  return (
    <div
      className={`sticky${selected ? ' selected' : ''}${stampTarget ? ' stamp-target' : ''}`}
      data-id={sticky.id}
      style={{
        left: sticky.x,
        top: sticky.y,
        width: sticky.w,
        height: sticky.h,
        background: STICKY_COLORS[sticky.color],
      }}
      onPointerDown={(e) => onPointerDown(e, sticky.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing(sticky.id);
      }}
    >
      {editing ? (
        <StickyEditor sticky={sticky} />
      ) : (
        <div className="sticky-text" style={{ fontSize: stickyFontSize(sticky.text, sticky.w) }}>
          {sticky.text ? <LinkedText text={sticky.text} /> : <span className="placeholder">{t('sticky.empty')}</span>}
        </div>
      )}
      <div className="sticky-author">{sticky.createdBy.name}</div>
      {commentCount > 0 && (
        <button
          className={`comment-badge${commentOpen ? ' active' : ''}`}
          title={t('sticky.commentsTitle')}
          aria-label={t('board.comments', { count: commentCount })}
          // 付箋の選択・移動にしない
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => useBoard.setState({ commentTargetId: commentOpen ? null : sticky.id })}
        >
          <MessageSquare size={12} strokeWidth={2.5} />
          {commentCount}
        </button>
      )}
    </div>
  );
}

function TextBoxEditor({ item }: { item: TextObject }) {
  const t = useT();
  // 空のまま編集を終えたら消す（見えないテキストを残さない）
  const { value, change, finish } = useTextEditing(item.id, 'text', item.text, (text) =>
    text.trim() ? syncTextSize(item.id) : deleteObjects([item.id]),
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  // 入力欄の大きさは、同じ位置に重ねた見えない文字（textbox-mirror）の大きさで決まる。
  // 文字に合わせて伸びるテキストでは横に、幅を決めたテキストでは縦に広がる。
  return (
    <div className="textbox-autosize">
      <div className="textbox-content textbox-mirror" aria-hidden="true">
        {value || t('text.placeholder')}
        {'\u200b'}
      </div>
      <textarea
        ref={ref}
        className="textbox-content textbox-editor"
        rows={1}
        value={value}
        maxLength={2000}
        placeholder={t('text.placeholder')}
        onChange={(e) => change(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (isImeComposing(e)) return;
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function TextBox({
  item,
  selected,
  resizable,
  editing,
  onPointerDown,
  onResizeStart,
}: {
  item: TextObject;
  selected: boolean;
  /** 1つだけ選んでいるとき、幅の取っ手を出す */
  resizable: boolean;
  editing: boolean;
  onPointerDown: ObjectPointerDown;
  onResizeStart: ObjectPointerDown;
}) {
  const t = useT();
  return (
    <div
      className={`textbox${selected ? ' selected' : ''}`}
      data-id={item.id}
      style={{
        left: item.x,
        top: item.y,
        ...(item.autoWidth ? { width: 'max-content', maxWidth: TEXT_AUTO_MAX_WIDTH } : { width: item.w }),
        fontSize: item.fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        paddingTop: TEXT_PADDING_Y,
        paddingBottom: TEXT_PADDING_Y,
        color: TEXT_COLORS[item.color],
      }}
      onPointerDown={(e) => onPointerDown(e, item.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing(item.id);
      }}
    >
      {editing ? (
        <TextBoxEditor item={item} />
      ) : (
        <div className="textbox-content">
          {item.text ? <LinkedText text={item.text} /> : <span className="placeholder">{t('text.placeholder')}</span>}
        </div>
      )}
      {resizable && !editing && (
        <div
          className="text-width-handle"
          title={item.autoWidth ? t('text.setWidth') : t('text.changeWidth')}
          onPointerDown={(e) => onResizeStart(e, item.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setTextAutoWidth(item.id);
          }}
        />
      )}
    </div>
  );
}

function SectionTitleEditor({ section }: { section: SectionObject }) {
  const { value, change, finish } = useTextEditing(section.id, 'title', section.title);
  return (
    <input
      className="section-title-input"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      value={value}
      maxLength={100}
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        // 変換を確定する Enter では、セクション名の入力を終えない
        if (isImeComposing(e)) return;
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

export function Section({
  section,
  selected,
  resizable,
  editing,
  onPointerDown,
  onResizeStart,
}: {
  section: SectionObject;
  selected: boolean;
  /** 1つだけ選んでいるとき、大きさの取っ手を出す */
  resizable: boolean;
  editing: boolean;
  onPointerDown: ObjectPointerDown;
  /** axis：右の辺（x）・下の辺（y）をつかんだときはその向きだけ。角なら省略。 */
  onResizeStart: (e: ReactPointerEvent, id: string, axis?: 'x' | 'y') => void;
}) {
  const t = useT();
  const colors = SECTION_COLORS[section.color];
  return (
    <div
      className={`section${selected ? ' selected' : ''}`}
      data-id={section.id}
      data-kind="section-body"
      style={{
        left: section.x,
        top: section.y,
        width: section.w,
        height: section.h,
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      {/* セクションは見出しをつかんで動かす。中の何もないところからのドラッグは範囲選択になる。 */}
      <div
        className="section-title"
        style={{ background: colors.border }}
        onPointerDown={(e) => onPointerDown(e, section.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(section.id);
        }}
      >
        {editing ? <SectionTitleEditor section={section} /> : section.title || t('section.untitled')}
      </div>
      {resizable && (
        <>
          {/* 右の辺は横だけ、下の辺は縦だけ、右下の角は両方を変える */}
          <div className="resize-edge resize-edge-x" title={t('section.resizeWidth')} onPointerDown={(e) => onResizeStart(e, section.id, 'x')} />
          <div className="resize-edge resize-edge-y" title={t('section.resizeHeight')} onPointerDown={(e) => onResizeStart(e, section.id, 'y')} />
          <div className="resize-handle" title={t('section.resize')} onPointerDown={(e) => onResizeStart(e, section.id)} />
        </>
      )}
    </div>
  );
}

/**
 * 画面に入ってから画像を読み込む（画面の外の画像は、近くまで来るまで読み込まない）。
 * 一度読み込んだ画像は、画面の外に出ても表示したままにする。
 */
function useImageUrl(src: string, el: RefObject<HTMLElement | null>) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        loadImageUrl(src)
          .then((u) => !cancelled && setUrl(u))
          .catch((e) => {
            console.error(e);
            if (!cancelled) setFailed(true);
          });
      },
      // 画面の少し外にあるものも先に読み込んでおく
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src, el]);
  return { url, failed };
}

export function ImageBox({
  image,
  selected,
  resizable,
  onPointerDown,
  onResizeStart,
}: {
  image: ImageObject;
  selected: boolean;
  /** 1つだけ選んでいるとき、大きさの取っ手を出す */
  resizable: boolean;
  onPointerDown: ObjectPointerDown;
  onResizeStart: ObjectPointerDown;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const { url, failed } = useImageUrl(image.src, ref);
  return (
    <div
      ref={ref}
      className={`image-object${selected ? ' selected' : ''}${url ? '' : ' loading'}`}
      data-id={image.id}
      style={{ left: image.x, top: image.y, width: image.w, height: image.h }}
      onPointerDown={(e) => onPointerDown(e, image.id)}
    >
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <span className="image-status">{failed ? t('image.loadFailed') : t('common.loading')}</span>
      )}
      {resizable && (
        <div className="resize-handle" title={t('image.resize')} onPointerDown={(e) => onResizeStart(e, image.id)} />
      )}
    </div>
  );
}

/** アップロード中の画像の枠（貼った本人の画面だけ） */
export function PendingImageBox({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = useT();
  return (
    <div className="image-object loading pending" style={{ left: x, top: y, width: w, height: h }}>
      <span className="image-status">{t('image.uploading')}</span>
    </div>
  );
}

/** 顔のスタンプ（写真、なければ名前の頭文字）。貼ったばかりのときは一度だけ弾ませる（boing）。 */
function FaceStamp({ stamp, boing }: { stamp: StampObject; boing: boolean }) {
  const [broken, setBroken] = useState(false);
  const { photoURL, name } = stamp.createdBy;
  const className = `face${boing ? ' face-boing' : ''}`;
  if (photoURL && !broken) {
    return <img className={className} src={photoURL} alt={name} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <span className={`${className} face-initials`}>{initials(name)}</span>;
}

/** 貼ったばかりとみなす長さ。端末どうしの時計のずれも見込んで、少し長めにする。 */
const JUST_CREATED_MS = 10_000;

/** 作られたばかりか（自分の書き込みがまだサーバーに届いていない間は createdAt が null） */
function isJustCreated(o: StampObject) {
  return o.createdAt === null || Date.now() - o.createdAt.toMillis() < JUST_CREATED_MS;
}

export function Stamp({
  stamp,
  x,
  y,
  selected,
  onPointerDown,
}: {
  stamp: StampObject;
  x: number;
  y: number;
  selected: boolean;
  onPointerDown: ObjectPointerDown;
}) {
  const t = useT();
  // 貼ったばかりのスタンプ（自分が押した直後、または誰かが押したのが届いたとき）だけ動かす。
  // あとからボードを開いたときや、元に戻すで復活したときは動かさない。
  const [fresh] = useState(() => isJustCreated(stamp));
  return (
    <div
      className={`stamp${selected ? ' selected' : ''}`}
      data-id={stamp.id}
      style={{ left: x, top: y, width: STAMP_SIZE, height: STAMP_SIZE }}
      title={stamp.createdBy.name}
      aria-label={`${t('toolbar.stampLabel', { name: t(`stamp.${stamp.stampKind}`) })} (${stamp.createdBy.name})`}
      onPointerDown={(e) => onPointerDown(e, stamp.id)}
    >
      {stamp.stampKind === 'face' ? (
        <FaceStamp stamp={stamp} boing={fresh} />
      ) : (
        <StampEmoji kind={stamp.stampKind} animate={fresh} />
      )}
    </div>
  );
}
