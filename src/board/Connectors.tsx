// 付箋などをつなぐ矢印。両端のものの位置から毎回描く。
import { useEffect, useRef } from 'react';
import { STICKY_COLORS, TEXT_COLORS, TEXT_LINE_HEIGHT } from '../constants';
import { useT } from '../i18n';
import { isImeComposing } from '../lib/isTyping';
import type { BoardObject, ConnectorObject } from '../types';
import { useTextEditing, type ObjectPointerDown } from './BoardObjects';
import { connectorLine, isBox, lineBetween, type Line } from './geometry';
import { usePreview } from './PlacementPreview';
import { useBoard } from './store';

/** 矢印のラベルの長さの上限（Firestore のルールと合わせる） */
export const CONNECTOR_LABEL_MAX = 50;

function midpoint(l: Line) {
  return { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
}

/** 矢じりの形（線の先端に付ける）。色は CSS で付ける。 */
function ArrowMarkers() {
  return (
    <defs>
      {['default', 'selected', 'preview'].map((kind) => (
        <marker
          key={kind}
          id={`connector-arrow-${kind}`}
          className={`connector-arrow connector-arrow-${kind}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          markerUnits="strokeWidth"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      ))}
    </defs>
  );
}

function startLabelEditing(id: string) {
  useBoard.setState({ selectedIds: [id], editingId: id });
}

function LabelEditor({ connector }: { connector: ConnectorObject }) {
  const t = useT();
  const { value, change, finish } = useTextEditing(connector.id, 'label', connector.label);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="connector-label connector-label-editor"
      value={value}
      maxLength={CONNECTOR_LABEL_MAX}
      placeholder={t('connector.labelPlaceholder')}
      size={Math.max(4, value.length + 1)}
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (isImeComposing(e)) return;
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/**
 * 矢印をまとめて描く層。線は SVG で、ラベルはその上に HTML で置く。
 * 細い線でも押しやすいよう、見えない太い線で押した場所を受け取る。ダブルクリックでラベルを書く。
 */
export function ConnectorLayer({
  connectors,
  objects,
  selectedIds,
  editingId,
  onPointerDown,
}: {
  connectors: ConnectorObject[];
  objects: Record<string, BoardObject>;
  selectedIds: Set<string>;
  editingId: string | null;
  onPointerDown: ObjectPointerDown;
}) {
  const t = useT();
  const drawn = connectors
    .map((c) => ({ c, line: connectorLine(c, objects) }))
    .filter((d): d is { c: ConnectorObject; line: Line } => d.line !== null);
  if (drawn.length === 0) return null;
  return (
    <>
      <svg className="connector-layer">
        <ArrowMarkers />
        {drawn.map(({ c, line }) => {
          const selected = selectedIds.has(c.id);
          return (
            <g key={c.id} className={`connector${selected ? ' selected' : ''}`} data-id={c.id}>
              <line
                className="connector-hit"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                onPointerDown={(e) => onPointerDown(e, c.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startLabelEditing(c.id);
                }}
              >
                <title>{t('connector.title')}</title>
              </line>
              <line
                className="connector-line"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                markerEnd={`url(#connector-arrow-${selected ? 'selected' : 'default'})`}
                markerStart={c.bothEnds ? `url(#connector-arrow-${selected ? 'selected' : 'default'})` : undefined}
              />
            </g>
          );
        })}
      </svg>
      {drawn.map(({ c, line }) => {
        const editing = editingId === c.id;
        if (!editing && !c.label) return null;
        const m = midpoint(line);
        return (
          <div
            key={c.id}
            className={`connector-label-box${selectedIds.has(c.id) ? ' selected' : ''}`}
            style={{ left: m.x, top: m.y }}
            onPointerDown={(e) => {
              if (!editing) onPointerDown(e, c.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startLabelEditing(c.id);
            }}
          >
            {editing ? <LabelEditor connector={c} /> : <span className="connector-label">{c.label}</span>}
          </div>
        );
      })}
    </>
  );
}

/**
 * 矢印を伸ばしている途中の線と、離したらつながる先の枠（なければ、離すとできる付箋を半透明で）。
 * 「矢印」のツールでは、押すと矢印を伸ばせるものに枠を出す。画像の書き出しには写さない。
 */
export function ConnectPreview({ objects }: { objects: Record<string, BoardObject> }) {
  const t = useT();
  const connect = usePreview((s) => s.connect);
  const hoverId = usePreview((s) => s.hover);
  const hover = !connect && hoverId ? objects[hoverId] : null;
  if (hover && isBox(hover)) {
    return (
      <div className="ghost connect-preview">
        <svg className="connector-layer">
          <rect className="connect-target" x={hover.x - 4} y={hover.y - 4} width={hover.w + 8} height={hover.h + 8} rx={8} />
        </svg>
      </div>
    );
  }
  if (!connect) return null;
  const from = objects[connect.fromId];
  if (!from || !isBox(from)) return null;
  const target = connect.targetId ? objects[connect.targetId] : null;
  const box = target && isBox(target) ? target : null;
  const to = box ?? (connect.ghost ? { x: connect.ghost.x, y: connect.ghost.y, w: connect.ghost.w, h: connect.ghost.h } : { x: connect.x, y: connect.y, w: 0, h: 0 });
  const line = lineBetween(from, to);
  return (
    <div className="ghost connect-preview">
      {!box && connect.ghost?.look.kind === 'sticky' && (
        <div
          className="ghost-sticky connect-ghost-sticky"
          style={{
            left: connect.ghost.x,
            top: connect.ghost.y,
            width: connect.ghost.w,
            height: connect.ghost.h,
            background: STICKY_COLORS[connect.ghost.look.color],
          }}
        />
      )}
      {!box && connect.ghost?.look.kind === 'text' && (
        <div
          className="ghost-text connect-ghost-text"
          style={{
            left: connect.ghost.x,
            top: connect.ghost.y,
            height: connect.ghost.h,
            fontSize: connect.ghost.look.fontSize,
            lineHeight: TEXT_LINE_HEIGHT,
            color: TEXT_COLORS[connect.ghost.look.color],
          }}
        >
          {t('text.placeholder')}
        </div>
      )}
      <svg className="connector-layer">
        <ArrowMarkers />
        {/* 矢印の始まり（線の枠だけ。先の枠は薄く塗って見分ける） */}
        <rect className="connect-source" x={from.x - 4} y={from.y - 4} width={from.w + 8} height={from.h + 8} rx={8} />
        {box && (
          <rect className="connect-target" x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} rx={8} />
        )}
        {line && (
          <line
            className="connector-line connector-preview-line"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            markerEnd="url(#connector-arrow-preview)"
          />
        )}
      </svg>
    </div>
  );
}

/** 矢印のツールを選んでいる間、画面の下に出す案内（始まりを選ぶ段階か、先を選ぶ段階か） */
export function ConnectorHint() {
  const t = useT();
  const pending = usePreview((s) => s.pendingConnect);
  return <div className="tool-hint">{t(pending ? 'connector.hintEnd' : 'connector.hintStart')}</div>;
}
