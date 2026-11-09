import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, MessageSquare, MoveHorizontal, MoveRight, MoveVertical, Trash2, Type } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SECTION_COLORS, STAMP_SIZE, STICKY_COLORS, STICKY_SIZE, STICKY_WIDE_WIDTH, TEXT_COLORS, TEXT_SIZES } from '../constants';
import type { BoardObject, SectionColor, StickyColor, TextColor } from '../types';
import { addConnector, duplicateInPlace, setColors, setConnectorDirection, setStickyWidth, setTextSize } from './actions';
import { confirmAndDelete, useCommentCount } from './comments';
import { useT } from '../i18n';
import { connectorDirection, connectorLine, isBox, isConnectable, stampPosition, type ArrowDirection } from './geometry';
import { useBoard } from './store';

const DIRECTIONS: ArrowDirection[] = ['forward', 'backward', 'both'];
/** 矢印の向きのボタンのアイコン。横に近い矢印は → ← ↔、縦に近い矢印は ↓ ↑ ↕ */
const DIRECTION_ICONS = {
  x: { forward: ArrowRight, backward: ArrowLeft, both: MoveHorizontal },
  y: { forward: ArrowDown, backward: ArrowUp, both: MoveVertical },
};

/** 画面の端からパネルを離しておく幅 */
const EDGE = 8;
/** パネルとオブジェクトの間隔。付箋は上の「＋」ボタンと重ならないよう広めにあける。 */
const GAP = 10;
const STICKY_TOOLBAR_GAP = 44;

/** 選んでいるものの左上（セクションは見出しの分だけ上）。スタンプの付け先が消えていれば null。 */
function topLeft(o: BoardObject, all: Record<string, BoardObject>) {
  if (o.type === 'stamp') return stampPosition(o, all);
  if (o.type === 'connector') {
    // 矢印は線の真ん中の少し上に出す
    const line = connectorLine(o, all);
    return line ? { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 - 12 } : null;
  }
  return { x: o.x, y: o.y - (o.type === 'section' ? 36 : 0) };
}

/**
 * 選択中のものの上に出す操作パネル（色の変更・削除）。画面の外にはみ出さないようにする。
 * 複数選んでいるときは全体の左上に出し、同じ種類どうしなら色もまとめて変えられる。
 */
export function SelectionToolbar({ selected, objects }: { selected: BoardObject[]; objects: Record<string, BoardObject> }) {
  const t = useT();
  const v = useBoard((s) => s.viewport);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const types = [...new Set(selected.map((o) => o.type))];
  const type = types.length === 1 ? types[0] : null;
  const single = selected.length === 1 ? selected[0] : null;
  const commentCount = useCommentCount(single?.type === 'sticky' ? single.id : '');
  const commentOpen = useBoard((s) => single !== null && s.commentTargetId === single.id);
  useLayoutEffect(() => {
    if (ref.current) setSize({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, [type, single?.type]);

  const corners = selected.map((o) => topLeft(o, objects)).filter((p) => p !== null);
  if (corners.length === 0) return null;
  const pos = { x: Math.min(...corners.map((p) => p.x)), y: Math.min(...corners.map((p) => p.y)) };
  // スタンプを1つだけ選んだときは、小さいので真上の中央に出す（左端を揃えると右にずれて見えるため）
  const rawLeft =
    single?.type === 'stamp'
      ? (pos.x + STAMP_SIZE / 2) * v.zoom + v.offsetX - size.w / 2
      : pos.x * v.zoom + v.offsetX;
  const rawTop = pos.y * v.zoom + v.offsetY;
  const left = Math.max(EDGE, Math.min(rawLeft, window.innerWidth - size.w - EDGE));
  const gap = single?.type === 'sticky' ? STICKY_TOOLBAR_GAP : GAP;
  const top = Math.max(size.h + gap + EDGE, rawTop);
  const ids = selected.map((o) => o.id);
  const currentColors = new Set(
    selected.map((o) => (o.type === 'stamp' || o.type === 'image' || o.type === 'connector' ? null : o.color)),
  );
  const currentColor = currentColors.size === 1 ? [...currentColors][0] : null;
  const onlyStamps = type === 'stamp';
  // 矢印だけを選んでいるときは、向き（→ ← ↔）を選べる。アイコンの縦横は最初の矢印に合わせ、
  // 選ばれた表示は全部が同じ向きのときだけ出す
  const direction = (() => {
    if (type !== 'connector') return null;
    const dirs = selected.flatMap((o) => {
      if (o.type !== 'connector') return [];
      const line = connectorLine(o, objects);
      return line ? [connectorDirection(o, line)] : [];
    });
    if (dirs.length === 0) return null;
    const currents = new Set(dirs.map((d) => d.direction));
    return { axis: dirs[0].axis, current: currents.size === 1 ? dirs[0].direction : null };
  })();
  // 付箋などを2つだけ選んでいるときは、矢印でつなげる（先に選んだ方から）
  const pair = selected.length === 2 && selected.every(isConnectable) ? selected : null;
  // 付箋の形。正方形と横長が混ざっていれば、どちらのボタンも選ばれていない表示にする
  const widths = new Set(selected.map((o) => (o.type === 'sticky' ? o.w : null)));
  const currentWidth = widths.size === 1 ? [...widths][0] : null;

  const colors: [string, string][] =
    type === 'sticky'
      ? Object.entries(STICKY_COLORS)
      : type === 'section'
        ? Object.entries(SECTION_COLORS).map(([k, c]) => [k, c.border])
        : type === 'text'
          ? Object.entries(TEXT_COLORS)
          : [];

  return (
    <div
      ref={ref}
      className="selection-toolbar"
      style={{ left, top, '--toolbar-gap': `${gap}px` } as CSSProperties}
      onPointerDown={(e) => {
        e.stopPropagation();
        // 編集中の入力欄からフォーカスを外さない（文字を入れる前に大きさや色を選べるようにする）
        e.preventDefault();
      }}
      onMouseDown={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {single?.type === 'text' && (
        <>
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              className={`size-button${single.fontSize === size ? ' active' : ''}`}
              title={t('selection.textSize', { label: t(`size.${size}`) })}
              aria-pressed={single.fontSize === size}
              onClick={() => setTextSize(single.id, size)}
            >
              {t(`size.${size}`)}
            </button>
          ))}
          <span className="divider" />
        </>
      )}
      {colors.map(([key, color]) => (
        <button
          key={key}
          className={`swatch${currentColor === key ? ' active' : ''}`}
          style={{ background: color }}
          title={t('selection.color')}
          onClick={() => setColors(ids, key as StickyColor | SectionColor | TextColor)}
        />
      ))}
      {colors.length > 0 && <span className="divider" />}
      {type === 'sticky' && (
        <>
          {[
            { w: STICKY_SIZE, label: t('shape.square'), icon: 'square' },
            { w: STICKY_WIDE_WIDTH, label: t('shape.wide'), icon: 'wide' },
          ].map((shape) => (
            <button
              key={shape.w}
              className={`size-button shape-button${currentWidth === shape.w ? ' active' : ''}`}
              title={t('selection.shape', { shape: shape.label })}
              aria-pressed={currentWidth === shape.w}
              onClick={() => setStickyWidth(ids, shape.w)}
            >
              <span className={`shape-icon shape-icon-${shape.icon}`} />
              {shape.label}
            </button>
          ))}
          <span className="divider" />
        </>
      )}
      {single?.type === 'sticky' && (
        <>
          <button
            className={`size-button comment-button${commentOpen ? ' active' : ''}`}
            title={t('selection.commentTitle')}
            aria-pressed={commentOpen}
            onClick={() => useBoard.setState({ commentTargetId: commentOpen ? null : single.id })}
          >
            <MessageSquare size={14} />
            {t('selection.comment')}{commentCount > 0 && ` ${commentCount}`}
          </button>
          <span className="divider" />
        </>
      )}
      {pair && (
        <>
          <button
            className="size-button icon-text-button"
            title={t('selection.connectTitle')}
            onClick={() => addConnector(pair[0].id, pair[1].id)}
          >
            <MoveRight size={14} />
            {t('selection.connect')}
          </button>
          <span className="divider" />
        </>
      )}
      {single?.type === 'connector' && (
        <>
          <button
            className="size-button icon-text-button"
            title={t('selection.labelTitle')}
            onClick={() => useBoard.setState({ editingId: single.id })}
          >
            <Type size={14} />
            {t('selection.label')}
          </button>
        </>
      )}
      {direction && (
        <>
          {DIRECTIONS.map((d) => {
            const Icon = DIRECTION_ICONS[direction.axis][d];
            const label = t(`selection.direction.${direction.axis}.${d}`);
            return (
              <button
                key={d}
                className={`icon-button direction-button${direction.current === d ? ' active' : ''}`}
                title={t('selection.directionTitle', { label })}
                aria-label={label}
                aria-pressed={direction.current === d}
                onClick={() => setConnectorDirection(ids, d)}
              >
                <Icon size={16} />
              </button>
            );
          })}
          <span className="divider" />
        </>
      )}
      {selected.some((o) => isBox(o)) && (
        <button
          className="icon-button"
          title={t('selection.duplicateTitle')}
          aria-label={t('selection.duplicate')}
          onClick={duplicateInPlace}
        >
          <Copy size={16} />
        </button>
      )}
      <button
        className="icon-button delete-button"
        title={onlyStamps ? t('selection.removeStampTitle') : t('selection.deleteTitle')}
        aria-label={onlyStamps ? t('selection.removeStamp') : t('common.delete')}
        onClick={() => confirmAndDelete(ids)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
