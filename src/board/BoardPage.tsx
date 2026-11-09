import { ArrowLeft, ChevronDown, MoveUpRight, Image as ImageIcon, Lock, FileCode, FileDown, Hand, ImageDown, Maximize, MessageSquare, Minus, MousePointer2, Plus, Redo2, Type, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { currentUser } from '../auth';
import { Avatar } from '../components/Avatar';
import { toast } from '../components/Toast';
import { Totals } from '../components/Totals';
import { PRESENCE_TIMEOUT_MS, stampImageUrl, STAMPS, STICKY_COLORS, STICKY_SIZE, STICKY_WIDE_WIDTH } from '../constants';
import { deleteBoard, recordHistory, recordHistoryCounts, renameBoard, subscribeBoard } from '../data/boards';
import { subscribeComments } from '../data/comments';
import { subscribeObjects } from '../data/objects';
import { joinBoard, subscribePresence } from '../data/presence';
import { downloadUrl, exportFileName } from '../lib/download';
import { buildBoardCsv, csvFileName, downloadCsv } from '../lib/exportCsv';
import { buildBoardHtml, renderBoardSvg } from '../lib/exportHtml';
import { contentBounds, renderBoardPng, type Bounds } from '../lib/exportImage';
import { currentLang, useT } from '../i18n';
import { isImeComposing, isTyping } from '../lib/isTyping';
import { preloadSounds } from '../lib/sound';
import type { Board, Presence, StampKind } from '../types';
import { duplicateInPlace, setActiveBoard, useNextSticky } from './actions';
import { cancelPendingConnect } from './connectDrag';
import { confirmAndDelete, setComments, useComments } from './comments';
import { Canvas, fitToContent, zoomAt } from './Canvas';
import { getObjects, resetBoardState, setServerObjects, useBoard, type Viewport } from './store';
import { usePanHint } from './panHint';
import { IMAGE_ACCEPT, insertImageFiles } from './insert';
import { ShareButton } from './SharePanel';
import { TimerControl } from './TimerControl';
import { useBoardTotals } from './totals';
import { TimerEffects } from './TimerEffects';
import { redo, resetUndo, undo, useUndo } from './undo';

type LoadState = 'loading' | 'ready' | 'missing' | 'denied';

const viewportKey = (boardId: string) => `nboard:viewport:${boardId}`;

function loadViewport(boardId: string): Viewport {
  try {
    const saved = JSON.parse(localStorage.getItem(viewportKey(boardId)) ?? 'null');
    if (saved && typeof saved.zoom === 'number') return saved;
  } catch {
    // 保存されていない・読めない場合は初期位置
  }
  return { offsetX: window.innerWidth / 2 - 80, offsetY: window.innerHeight / 2 - 120, zoom: 1 };
}

export function BoardPage() {
  const t = useT();
  const { boardId = '' } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [load, setLoad] = useState<LoadState>('loading');
  const [people, setPeople] = useState<Presence[]>([]);
  const lastHistoryTitle = useRef<string | null>(null);

  // ボード本体・オブジェクト・参加者の購読
  useEffect(() => {
    resetBoardState();
    resetUndo(boardId);
    setActiveBoard(boardId);
    useBoard.setState({ viewport: loadViewport(boardId) });
    lastHistoryTitle.current = null;
    setLoad('loading');

    let stopObjects: (() => void) | null = null;
    let stopComments: (() => void) | null = null;
    let stopPresence: (() => void) | null = null;
    let leave: (() => void) | null = null;

    const stopBoard = subscribeBoard(
      boardId,
      (b) => {
        setBoard(b);
        if (!b) {
          setLoad('missing');
          stopObjects?.();
          stopComments?.();
          stopPresence?.();
          leave?.();
          stopObjects = stopComments = stopPresence = leave = null;
          return;
        }
        setLoad('ready');
        useBoard.setState({ boardOwnerUid: b.ownerUid });
        // 履歴は開いたとき・タイトルが変わったときに更新する
        if (lastHistoryTitle.current !== b.title) {
          lastHistoryTitle.current = b.title;
          recordHistory(b).catch(console.error);
        }
        if (!stopObjects) {
          // 共有範囲が変わって開けなくなったときは、ボードの購読の方で「開けませんでした」に切り替えるので知らせない
          stopObjects = subscribeObjects(boardId, setServerObjects, (e) => {
            console.error(e);
            if (e.code !== 'permission-denied') toast(t('board.loadFailed'));
          });
          stopComments = subscribeComments(boardId, setComments, (e) => {
            console.error(e);
            if (e.code !== 'permission-denied') toast(t('board.commentsLoadFailed'));
          });
          stopPresence = subscribePresence(boardId, setPeople);
          leave = joinBoard(boardId);
        }
      },
      (e) => {
        console.error(e);
        setLoad(e.code === 'permission-denied' ? 'denied' : 'missing');
      },
    );
    return () => {
      stopBoard();
      stopObjects?.();
      stopComments?.();
      setComments([]);
      stopPresence?.();
      leave?.();
    };
  }, [boardId]);

  // 付箋とコメントの数を自分の履歴に記録しておく（履歴一覧に出す）。数が変わってから少し待ってまとめて書く。
  const totals = useBoardTotals();
  const loaded = load === 'ready';
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      recordHistoryCounts(boardId, totals.stickyCount, totals.commentCount).catch(console.error);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [boardId, loaded, totals.stickyCount, totals.commentCount]);
  // 待っている間にボードを離れても、最後の数を記録する
  const latestTotals = useRef(totals);
  latestTotals.current = totals;
  useEffect(() => {
    if (!loaded) return;
    return () => {
      const { stickyCount, commentCount } = latestTotals.current;
      // ボードを削除したあとなどは履歴がないので書けない（そのままでよい）
      recordHistoryCounts(boardId, stickyCount, commentCount).catch(() => {});
    };
  }, [boardId, loaded]);

  // 効果音を先に読み込んでおく（最初の1回だけ鳴るのが遅れないように）
  useEffect(() => {
    void preloadSounds();
  }, []);

  // 表示位置をボードごとに覚えておく
  useEffect(
    () =>
      useBoard.subscribe((s, prev) => {
        if (s.viewport === prev.viewport) return;
        try {
          localStorage.setItem(viewportKey(boardId), JSON.stringify(s.viewport));
        } catch {
          // 保存できなくても動作に影響はない
        }
      }),
    [boardId],
  );

  // キーボード操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        // ボード上のものを全部選ぶ（範囲選択で全部を囲んだときと同じ。付け先と一緒に動くスタンプは選ばない）
        e.preventDefault();
        const objects = getObjects();
        const ids = Object.values(objects)
          .filter((o) => o.type !== 'stamp' || !o.targetId || !objects[o.targetId])
          .map((o) => o.id);
        useBoard.setState({ selectedIds: ids, editingId: null, tool: { kind: 'select' } });
      } else if (mod && e.key.toLowerCase() === 'd') {
        // 選んでいるものを少し右下にずらして複製する（ブラウザのブックマークは開かない）
        e.preventDefault();
        if (useBoard.getState().selectedIds.length) duplicateInPlace();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = useBoard.getState().selectedIds;
        if (ids.length) {
          e.preventDefault();
          confirmAndDelete(ids);
        }
      } else if (e.key === 'Escape') {
        // 矢印をクリックで伸ばしている途中なら、その矢印だけをやめる（ツールはそのまま）
        if (cancelPendingConnect()) return;
        useBoard.setState({ selectedIds: [], commentTargetId: null, tool: { kind: 'select' } });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'h') {
        useBoard.setState({ tool: { kind: 'hand' } });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'v') {
        useBoard.setState({ tool: { kind: 'select' } });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'l') {
        useBoard.setState({ tool: { kind: 'connector' } });
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'c') {
        useBoard.setState({ tool: { kind: 'comment' } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 保存失敗の通知
  useEffect(() => {
    const onError = (e: Event) => toast((e as CustomEvent<string>).detail);
    window.addEventListener('nboard:error', onError);
    return () => window.removeEventListener('nboard:error', onError);
  }, []);

  if (load === 'loading') return <div className="center-message">{t('common.loading')}</div>;
  if (load === 'missing' || load === 'denied' || !board) {
    return (
      <div className="center-message">
        <p>
          {load === 'denied' ? (
            <>
              <strong className="center-message-title">{t('board.deniedTitle')}</strong>
              <br />
              {t('board.denied')}
            </>
          ) : (
            t('board.missing')
          )}
        </p>
        <Link to="/">{t('board.backToHistory')}</Link>
      </div>
    );
  }

  const isOwner = board.ownerUid === currentUser().uid;

  const onDelete = async () => {
    if (!window.confirm(t('board.deleteConfirm', { title: board.title }))) return;
    try {
      await deleteBoard(board.id);
      navigate('/');
    } catch (e) {
      console.error(e);
      toast(t('board.deleteFailed'));
    }
  };

  // 付箋・テキストを CSV でダウンロードする（参加者なら誰でも）
  const onExportCsv = () => {
    const now = new Date();
    const objects = Object.values(useBoard.getState().server);
    downloadCsv(csvFileName(board.title, now), buildBoardCsv(board.title, objects, useComments.getState().list, now));
  };

  // 見た目を書き出す前の準備。選択の枠などが写らないよう選択を外し、描き直されるのを待ってから範囲を決める。
  const prepareExport = async (): Promise<{ world: HTMLElement; bounds: Bounds } | null> => {
    useBoard.setState({ selectedIds: [], editingId: null });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const world = document.querySelector<HTMLElement>('.world');
    const bounds = world && contentBounds(world, useBoard.getState().viewport.zoom);
    if (!world || !bounds) {
      toast(t('board.imageEmpty'));
      return null;
    }
    return { world, bounds };
  };

  // ボードの見た目を画像（PNG）でダウンロードする
  const onExportImage = async () => {
    const target = await prepareExport();
    if (!target) return;
    try {
      downloadUrl(exportFileName(board.title, new Date(), 'png'), await renderBoardPng(target.world, target.bounds));
    } catch (e) {
      console.error(e);
      toast(t('board.imageFailed'));
    }
  };

  // ボードの見た目を、拡大・縮小して見られる1つの HTML ファイルでダウンロードする（コメントは入れない）
  const onExportHtml = async () => {
    const target = await prepareExport();
    if (!target) return;
    try {
      const now = new Date();
      const html = buildBoardHtml(board.title, await renderBoardSvg(target.world, target.bounds), now);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      downloadUrl(exportFileName(board.title, now, 'html'), url);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      console.error(e);
      toast(t('board.htmlFailed'));
    }
  };

  return (
    <div className="board-page">
      <Canvas />
      <header className="board-header">
        <Link to="/" className="home-link" title={t('board.backToHistory')} aria-label={t('board.backToHistory')}>
          <ArrowLeft size={18} />
        </Link>
        <BoardTitle board={board} />
        <BoardMenu
          isOwner={isOwner}
          onDelete={onDelete}
          onExportCsv={onExportCsv}
          onExportImage={onExportImage}
          onExportHtml={onExportHtml}
        />
        <div className="header-center">
          <TimerControl boardId={board.id} />
        </div>
        <div className="header-right">
          <PresenceList people={people} />
          <ShareButton board={board} people={people} />
        </div>
      </header>
      <Toolbar />
      <div className="board-totals">
        <Totals stickyCount={totals.stickyCount} commentCount={totals.commentCount} />
      </div>
      <ZoomControls />
      <TimerEffects />
    </div>
  );
}

function BoardTitle({ board }: { board: Board }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(board.title);
  if (!editing) {
    return (
      <button
        className="board-title"
        title={t('board.editTitle')}
        onClick={() => {
          setValue(board.title);
          setEditing(true);
        }}
      >
        <span className="board-title-text">{board.title}</span>
        {/* 「招待した人だけ」のボードは鍵のマークで分かるようにする */}
        {board.visibility === 'invited' && (
          <Lock size={14} className="board-lock" aria-label={t('board.invitedOnly')} />
        )}
      </button>
    );
  }
  const save = () => {
    setEditing(false);
    const title = value.trim().slice(0, 100);
    if (title && title !== board.title) renameBoard(board.id, title).catch(() => toast(t('board.titleSaveFailed')));
  };
  return (
    <input
      className="board-title-input"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      value={value}
      maxLength={100}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        // 変換を確定する Enter では、ボード名の入力を終えない
        if (isImeComposing(e)) return;
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(board.title);
          setEditing(false);
        }
      }}
    />
  );
}

/**
 * タイトル横の「▾」メニュー。めったに使わない操作・取り返しのつかない操作をまとめる。
 */
function BoardMenu({
  isOwner,
  onDelete,
  onExportCsv,
  onExportImage,
  onExportHtml,
}: {
  isOwner: boolean;
  onDelete: () => void;
  onExportCsv: () => void;
  onExportImage: () => void;
  onExportHtml: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // メニューの外をクリックするか Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="board-menu" ref={ref}>
      <button
        className="board-menu-button"
        title={t('board.menu')}
        aria-label={t('board.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            className="menu-item"
            role="menuitem"
            title={t('board.csvTitle')}
            onClick={() => {
              setOpen(false);
              onExportCsv();
            }}
          >
            <FileDown size={15} />
            {t('board.csv')}
          </button>
          <button
            className="menu-item"
            role="menuitem"
            title={t('board.imageTitle')}
            onClick={() => {
              setOpen(false);
              onExportImage();
            }}
          >
            <ImageDown size={15} />
            {t('board.image')}
          </button>
          <button
            className="menu-item"
            role="menuitem"
            title={t('board.htmlTitle')}
            onClick={() => {
              setOpen(false);
              onExportHtml();
            }}
          >
            <FileCode size={15} />
            {t('board.html')}
          </button>
          <div className="menu-separator" role="separator" />
          <button
            className="menu-item danger"
            role="menuitem"
            disabled={!isOwner}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            {t('board.delete')}
            {!isOwner && <span className="menu-note">{t('board.deleteOwnerOnly')}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

/** 参加中の人の並び順：自分を先頭に、ほかの人は名前順 */
function sortPeople(people: Presence[], myUid: string) {
  return [...people].sort((a, b) => {
    if (a.uid === myUid) return -1;
    if (b.uid === myUid) return 1;
    return a.name.localeCompare(b.name, currentLang());
  });
}

/**
 * 右上の「○人が参加中」。押すと参加中の人の一覧（アイコンと名前）が開く。
 * イニシャルが同じ人も、一覧なら名前で見分けられる。
 */
function PresenceList({ people }: { people: Presence[] }) {
  const t = useT();
  const myUid = currentUser().uid;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 一定時間ハートビートがない人は外す。時間の経過で表示を更新する。
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // 一覧の外をクリックするか Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = sortPeople(
    people.filter((p) => !p.lastSeen || now - p.lastSeen.toMillis() < PRESENCE_TIMEOUT_MS),
    myUid,
  );
  return (
    <div className="presence-menu" ref={ref}>
      <button
        className="presence"
        title={t('presence.listTitle')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {active.slice(0, 8).map((p) => (
          <Avatar key={p.uid} name={p.name} photoURL={p.photoURL} />
        ))}
        {active.length > 8 && <span className="presence-more">+{active.length - 8}</span>}
        <span className="presence-count">{t('presence.count', { count: active.length })}</span>
      </button>
      {open && (
        <div className="menu presence-dropdown" role="menu" aria-label={t('presence.people')}>
          <div className="presence-dropdown-title">{t('presence.header', { count: active.length })}</div>
          <ul className="presence-people">
            {active.map((p) => (
              <li key={p.uid} className="presence-person">
                <Avatar name={p.name} photoURL={p.photoURL} size={28} />
                <span className="presence-person-name">{p.name}</span>
                {p.uid === myUid && <span className="presence-you">{t('presence.you')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Toolbar() {
  const t = useT();
  const tool = useBoard((s) => s.tool);
  const canUndo = useUndo((s) => s.undoStack.length > 0);
  const canRedo = useUndo((s) => s.redoStack.length > 0);
  return (
    <nav className="toolbar" aria-label={t('toolbar.label')}>
      <button
        className={tool.kind === 'select' ? 'active' : ''}
        title={t('toolbar.selectTitle')}
        onClick={() => useBoard.setState({ tool: { kind: 'select' } })}
      >
        <span className="tool-icon">
          <MousePointer2 size={20} />
        </span>
        <span className="tool-label">{t('toolbar.select')}</span>
      </button>
      <button
        className={tool.kind === 'hand' ? 'active' : ''}
        title={t('toolbar.handTitle')}
        aria-pressed={tool.kind === 'hand'}
        onClick={() => useBoard.setState({ tool: tool.kind === 'hand' ? { kind: 'select' } : { kind: 'hand' } })}
      >
        <span className="tool-icon">
          <Hand size={20} />
        </span>
        <span className="tool-label">{t('toolbar.hand')}</span>
      </button>
      <StickyPicker />
      <button
        className={tool.kind === 'text' ? 'active' : ''}
        title={t('toolbar.textTitle')}
        aria-pressed={tool.kind === 'text'}
        onClick={() => useBoard.setState({ tool: tool.kind === 'text' ? { kind: 'select' } : { kind: 'text' } })}
      >
        <span className="tool-icon">
          <Type size={20} />
        </span>
        <span className="tool-label">{t('toolbar.text')}</span>
      </button>
      <button
        className={tool.kind === 'section' ? 'active' : ''}
        title={t('toolbar.sectionTitle')}
        aria-pressed={tool.kind === 'section'}
        onClick={() => useBoard.setState({ tool: tool.kind === 'section' ? { kind: 'select' } : { kind: 'section' } })}
      >
        <span className="tool-icon">
          <SectionIcon />
        </span>
        <span className="tool-label">{t('toolbar.section')}</span>
      </button>
      <button
        className={tool.kind === 'connector' ? 'active' : ''}
        title={t('toolbar.connectorTitle')}
        aria-pressed={tool.kind === 'connector'}
        onClick={() => useBoard.setState({ tool: tool.kind === 'connector' ? { kind: 'select' } : { kind: 'connector' } })}
      >
        <span className="tool-icon">
          <MoveUpRight size={20} />
        </span>
        <span className="tool-label">{t('toolbar.connector')}</span>
      </button>
      <ImageButton />
      <StampPicker />
      <button
        className={tool.kind === 'comment' ? 'active' : ''}
        title={t('toolbar.commentTitle')}
        aria-pressed={tool.kind === 'comment'}
        onClick={() => useBoard.setState({ tool: tool.kind === 'comment' ? { kind: 'select' } : { kind: 'comment' } })}
      >
        <span className="tool-icon">
          <MessageSquare size={20} />
        </span>
        <span className="tool-label">{t('toolbar.comment')}</span>
      </button>
      <span className="toolbar-divider" />
      <button title={t('toolbar.undoTitle')} disabled={!canUndo} onClick={undo}>
        <span className="tool-icon">
          <Undo2 size={20} />
        </span>
        <span className="tool-label">{t('toolbar.undo')}</span>
      </button>
      <button title={t('toolbar.redoTitle')} disabled={!canRedo} onClick={redo}>
        <span className="tool-icon">
          <Redo2 size={20} />
        </span>
        <span className="tool-label">{t('toolbar.redo')}</span>
      </button>
    </nav>
  );
}

/**
 * セクションのアイコン。枠の左上に見出しがある形で、ほかのアイコン（lucide）と同じ線の太さ・大きさにそろえる。
 * 見出しを枠の中に入れて、ほかのアイコンと同じ正方形に収める（外に出すとフォルダのアイコンに見えやすい）。
 */
function SectionIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="6" y="6" width="7" height="3.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const STICKY_SHAPES = [
  { w: STICKY_SIZE, label: 'shape.square', icon: 'square' },
  { w: STICKY_WIDE_WIDTH, label: 'shape.wide', icon: 'wide' },
] as const;

/**
 * 付箋のボタン。押すと付箋を置ける状態になり、置くまでの間は横に形（正方形・横長）を選ぶパネルを開く。
 * 選んだ形は次に置く付箋とキャンバスのダブルクリックに使う。最初は正方形。
 */
function StickyPicker() {
  const t = useT();
  const tool = useBoard((s) => s.tool);
  // 次に置く付箋の色と形を、アイコンにそのまま出す
  const { color, w: width } = useNextSticky();
  const placing = tool.kind === 'sticky';
  const choose = (w: number) => {
    useNextSticky.setState({ w });
    useBoard.setState({ tool: { kind: 'sticky' } });
  };
  return (
    <div className="stamp-picker">
      <button
        className={placing ? 'active' : ''}
        title={t('toolbar.stickyTitle')}
        aria-pressed={placing}
        aria-expanded={placing}
        onClick={() => useBoard.setState({ tool: placing ? { kind: 'select' } : { kind: 'sticky' } })}
      >
        <span className="tool-icon">
          <span
            className={`sticky-icon${width === STICKY_WIDE_WIDTH ? ' sticky-icon-wide' : ''}`}
            style={{ background: STICKY_COLORS[color] }}
          />
        </span>
        <span className="tool-label">{t('toolbar.sticky')}</span>
      </button>
      {placing && (
        <div className="stamp-flyout" role="group" aria-label={t('toolbar.stickyShapes')}>
          {STICKY_SHAPES.map((shape) => (
            <button
              key={shape.w}
              className={width === shape.w ? 'active' : ''}
              title={t(shape.label)}
              aria-label={t('toolbar.stickyShapeLabel', { shape: t(shape.label) })}
              aria-pressed={width === shape.w}
              onClick={() => choose(shape.w)}
            >
              <span className="tool-icon">
                <span className={`sticky-icon sticky-icon-${shape.icon}`} style={{ background: STICKY_COLORS[color] }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 画像のボタン。ファイルを選ぶ画面を開き、選んだ画像を画面の真ん中に貼る。 */
function ImageButton() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button title={t('toolbar.imageTitle')} onClick={() => input.current?.click()}>
        <span className="tool-icon">
          <ImageIcon size={20} />
        </span>
        <span className="tool-label">{t('toolbar.image')}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // 同じファイルをもう一度選んでも反応するよう、選んだものを空にしておく
          e.target.value = '';
          useBoard.setState({ tool: { kind: 'select' } });
          insertImageFiles(files);
        }}
      />
    </>
  );
}

/**
 * スタンプのボタン。最後に使ったスタンプを表示し、押すとそのスタンプで押せる状態になる。
 * スタンプを押せる間は、横に全種類のパネルを開いておく。
 */
function StampPicker() {
  const t = useT();
  const tool = useBoard((s) => s.tool);
  const [last, setLast] = useState<StampKind>('like');
  const stamping = tool.kind === 'stamp';
  const current = stamping ? tool.stamp : last;
  const choose = (kind: StampKind) => {
    setLast(kind);
    useBoard.setState({ tool: { kind: 'stamp', stamp: kind } });
  };
  return (
    <div className="stamp-picker">
      <button
        className={stamping ? 'active' : ''}
        title={t('toolbar.stampTitle')}
        aria-pressed={stamping}
        aria-expanded={stamping}
        onClick={() => (stamping ? useBoard.setState({ tool: { kind: 'select' } }) : choose(last))}
      >
        <span className="tool-icon">
          <StampIcon kind={current} />
        </span>
        <span className="tool-label">{t('toolbar.stamp')}</span>
      </button>
      {stamping && (
        <div className="stamp-flyout" role="group" aria-label={t('toolbar.stampKinds')}>
          {STAMPS.map((s) => (
            <button
              key={s.kind}
              className={current === s.kind ? 'active' : ''}
              aria-label={t('toolbar.stampLabel', { name: t(`stamp.${s.kind}`) })}
              aria-pressed={current === s.kind}
              onClick={() => choose(s.kind)}
            >
              <span className="tool-icon">
                <StampIcon kind={s.kind} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StampIcon({ kind }: { kind: StampKind }) {
  if (kind === 'face') return <FaceIcon />;
  return <img className="stamp-image" src={stampImageUrl(kind)} alt="" draggable={false} />;
}

/**
 * 顔のスタンプのボタンの絵。写真は顔のまわりに余白があって小さく見えるので、絵文字のスタンプの絵（26px）より少し大きくする。
 * 白い背景の上なので、白い枠は付けない（styles.css の .tool-icon .avatar）。
 */
function FaceIcon() {
  const user = currentUser();
  return <Avatar name={user.displayName || user.email || '?'} photoURL={user.photoURL} size={28} stamp />;
}

function ZoomControls() {
  const t = useT();
  const zoom = useBoard((s) => s.viewport.zoom);
  // タッチ操作の端末では指でそのまま動かせるので出さない
  const showPanHint = !usePanHint((s) => s.used) && !window.matchMedia('(pointer: coarse)').matches;
  const hand = useBoard((s) => s.tool.kind === 'hand');
  const [handCount, setHandCount] = useState(0);
  useEffect(() => {
    if (hand) setHandCount((n) => n + 1);
  }, [hand]);
  const at = (factor: number) => zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor);
  return (
    <div className="zoom-controls">
      {showPanHint && (
        // 画面移動のツールを選んだときは、1回だけふわっと目立たせる（key を変えてアニメーションをやり直す）
        <span key={handCount} className={`pan-hint${handCount > 0 ? ' pan-hint-emphasis' : ''}`}>
          {t('board.panHint')}
        </span>
      )}
      <button title={t('board.fit')} aria-label={t('board.fit')} onClick={fitToContent}>
        <Maximize size={16} />
      </button>
      <span className="zoom-divider" />
      <button title={t('board.zoomOut')} aria-label={t('board.zoomOut')} onClick={() => at(1 / 1.2)}>
        <Minus size={16} />
      </button>
      <button
        className="zoom-value"
        title={t('board.zoomReset')}
        onClick={() => at(1 / useBoard.getState().viewport.zoom)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button title={t('board.zoomIn')} aria-label={t('board.zoomIn')} onClick={() => at(1.2)}>
        <Plus size={16} />
      </button>
    </div>
  );
}
