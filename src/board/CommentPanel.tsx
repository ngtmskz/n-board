import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { currentUser } from '../auth';
import { Avatar } from '../components/Avatar';
import { COMMENT_MAX_LENGTH } from '../data/comments';
import { useLang, useT } from '../i18n';
import { isImeComposing } from '../lib/isTyping';
import { fullTime, relativeTime } from '../lib/relativeTime';
import type { BoardComment, StickyObject } from '../types';
import { commentsOf, postComment, removeComment, updateComment, useComments } from './comments';
import { useBoard } from './store';

/** パネルの幅と、付箋・画面の端との間隔（画面上の px） */
const PANEL_WIDTH = 300;
const GAP = 16;
const EDGE = 12;
/** 画面上部のボード名などに重ならないよう空けておく高さ */
const TOP_MARGIN = 64;

/** Enter で確定（Shift＋Enter は改行、日本語の変換中は確定しない） */
function isSubmit(e: KeyboardEvent) {
  return e.key === 'Enter' && !e.shiftKey && !isImeComposing(e);
}

/** 入力欄の高さを文字の量に合わせる（上限あり） */
function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

/**
 * 付箋の横に開くコメントのパネル。コメントの一覧（古い順）と入力欄を出す。
 * 本文の編集は書いた本人だけ、削除は本人とボード作成者。
 */
export function CommentPanel({ sticky }: { sticky: StickyObject }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const v = useBoard((s) => s.viewport);
  const ownerUid = useBoard((s) => s.boardOwnerUid);
  const all = useComments((s) => s.list);
  const comments = commentsOf(all, sticky.id);
  const me = currentUser().uid;
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [height, setHeight] = useState(0);
  // 「5分前」などの表示を更新するため、30秒ごとに描き直す
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // パネルの中でのスクロールで、キャンバスが動かないようにする
  useEffect(() => {
    const el = ref.current!;
    const stop = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: true });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  // 開いたら入力欄にフォーカス。付箋を切り替えたら書きかけを消す
  useEffect(() => {
    setDraft('');
    setEditing(null);
    inputRef.current?.focus();
  }, [sticky.id]);

  // コメントが増えたら一番下（新しいもの）まで送る
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length, sticky.id]);

  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  });

  // 付箋の右に出す。右に入らなければ左に出す。上下は画面の中に収める
  const left = sticky.x * v.zoom + v.offsetX;
  const right = (sticky.x + sticky.w) * v.zoom + v.offsetX;
  const x =
    right + GAP + PANEL_WIDTH <= window.innerWidth - EDGE
      ? right + GAP
      : Math.max(EDGE, left - GAP - PANEL_WIDTH);
  const y = Math.min(
    Math.max(TOP_MARGIN, sticky.y * v.zoom + v.offsetY),
    Math.max(TOP_MARGIN, window.innerHeight - height - EDGE),
  );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    postComment(sticky.id, text);
    setDraft('');
    requestAnimationFrame(() => autosize(inputRef.current));
  };

  const saveEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    const original = comments.find((c) => c.id === editing.id)?.text;
    if (text && text !== original) updateComment(editing.id, text);
    setEditing(null);
  };

  const remove = (c: BoardComment) => {
    if (window.confirm(t('comment.deleteConfirm'))) removeComment(c.id);
  };

  return (
    <div
      ref={ref}
      className="comment-panel"
      style={{ left: x, top: y, width: PANEL_WIDTH }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="comment-panel-header">
        <span className="comment-panel-title">{t('comment.title')}</span>
        <span className="comment-panel-count">{t('comment.count', { count: comments.length })}</span>
        <button
          className="icon-button comment-panel-close"
          title={t('common.closeEsc')}
          aria-label={t('common.close')}
          onClick={() => useBoard.setState({ commentTargetId: null })}
        >
          <X size={16} />
        </button>
      </div>
      <div className="comment-list" ref={listRef}>
        {comments.length === 0 && <p className="comment-empty">{t('comment.empty')}</p>}
        {comments.map((c) => {
          const date = c.createdAt?.toDate() ?? now;
          const mine = c.createdBy.uid === me;
          return (
            <div key={c.id} className="comment">
              <Avatar name={c.createdBy.name} photoURL={c.createdBy.photoURL} size={24} />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-name">{c.createdBy.name}</span>
                  <span className="comment-time" title={fullTime(date)}>
                    {relativeTime(date, now, lang)}
                    {c.edited && t('comment.edited')}
                  </span>
                  {editing?.id !== c.id && (
                    <span className="comment-actions">
                      {mine && (
                        <button onClick={() => setEditing({ id: c.id, text: c.text })}>{t('common.edit')}</button>
                      )}
                      {(mine || ownerUid === me) && (
                        <button className="danger" onClick={() => remove(c)}>
                          {t('common.delete')}
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {editing?.id === c.id ? (
                  <textarea
                    className="comment-edit"
                    autoFocus
                    value={editing.text}
                    maxLength={COMMENT_MAX_LENGTH}
                    ref={autosize}
                    onChange={(e) => {
                      setEditing({ id: c.id, text: e.target.value });
                      autosize(e.target);
                    }}
                    onKeyDown={(e) => {
                      if (isSubmit(e)) {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === 'Escape' && !isImeComposing(e)) {
                        e.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    onBlur={saveEdit}
                  />
                ) : (
                  <p className="comment-text">{c.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="comment-input">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={t('comment.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={(e) => {
            if (isSubmit(e)) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape' && !isImeComposing(e)) {
              useBoard.setState({ commentTargetId: null });
            }
          }}
        />
        <button className="comment-send" disabled={!draft.trim()} onClick={send}>
          {t('comment.send')}
        </button>
      </div>
      <p className="comment-hint">{t('comment.hint')}</p>
    </div>
  );
}
