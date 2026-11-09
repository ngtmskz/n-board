import { Minus, Pause, Play, Plus, Square, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from '../components/Toast';
import {
  addMinute,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  subscribeTimer,
  TIMER_MAX_MINUTES,
  timerRemaining,
} from '../data/timer';
import type { TimerState } from '../types';
import { t as translate, useT } from '../i18n';
import { SoundControl } from './SoundControl';
import { celebrateTimerEnd, showCountdown } from './TimerEffects';

/** ワークショップでよく使う時間。押すと時間を入れるだけで、開始は「開始」ボタンで行う。 */
const PRESET_MINUTES = [3, 5, 10, 15];
/** 初めて使うとき（前回の時間がないとき）に入れておく時間 */
const DEFAULT_MINUTES = 10;
/** 時間になったことを知らせる点滅（ゆっくり2回）の長さ。過ぎたら止まっている状態の表示に戻す。 */
const FINISHED_FLASH_MS = 2_000;
/** 動いているタイマーの操作メニューを、最後に操作してから自動で閉じるまでの時間 */
const MENU_AUTO_CLOSE_MS = 5_000;
/** カウントダウンを出す残り秒数 */
const COUNTDOWN_SECONDS = [3, 2, 1];
/** 区切りを過ぎてからこの時間を超えて気づいた場合（ボードを開いた直後・裏側で遅れたときなど）は演出を出さない */
const EFFECT_GRACE_MS = 1_500;
const LAST_MINUTES_KEY = 'nboard:timerMinutes';

/** 前回使った時間（分）。初めてのとき・保存できない環境では DEFAULT_MINUTES。 */
function loadLastMinutes() {
  try {
    const m = Number(localStorage.getItem(LAST_MINUTES_KEY));
    if (Number.isInteger(m) && m >= 1 && m <= TIMER_MAX_MINUTES) return m;
  } catch {
    // 読めなくても動作に影響はない
  }
  return DEFAULT_MINUTES;
}

function saveLastMinutes(m: number) {
  try {
    localStorage.setItem(LAST_MINUTES_KEY, String(m));
  } catch {
    // 保存できなくても動作に影響はない
  }
}

/** 「分:秒」で表す（上限が 99:59 なので、時間の桁は出さない） */
function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** 残りの割合に応じた色の段階（青 → 黄 → オレンジ → 赤） */
function level(ratio: number) {
  if (ratio > 0.5) return 'calm';
  if (ratio > 0.25) return 'mid';
  if (ratio > 0.1) return 'warn';
  return 'low';
}

function report(e: unknown) {
  console.error(e);
  toast(translate('timer.failed'));
}

/**
 * 上部の中央に出すタイマー。ボード全体で1つを共有し、参加者は誰でも操作できる。
 * 残り時間は、タイマーの背景の色が右から減っていくことでも表す。
 */
export function TimerControl({ boardId }: { boardId: string }) {
  return (
    <div className="timer-area">
      <TimerMain boardId={boardId} />
      <SoundControl boardId={boardId} />
    </div>
  );
}

function TimerMain({ boardId }: { boardId: string }) {
  const t = useT();
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(loadLastMinutes);
  const [, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeTimer(boardId, setTimer, (e) => console.error(e)), [boardId]);

  // 動いている間は表示を更新し、残り3・2・1秒と0秒を過ぎた瞬間に演出を出す。
  // その瞬間を自分の画面で見ていたときだけ出す（時間を過ぎてから開いた人には出さない）。
  const timerRef = useRef(timer);
  timerRef.current = timer;
  useEffect(() => {
    if (timer?.status !== 'running') return;
    let last: number | null = null;
    const check = () => {
      const now = timerRemaining(timerRef.current);
      const prev = last;
      last = now;
      if (prev === null) return;
      const crossed = (at: number) => prev > at && now <= at && now > at - EFFECT_GRACE_MS;
      for (const s of COUNTDOWN_SECONDS) if (crossed(s * 1000)) showCountdown(s);
      if (crossed(0)) celebrateTimerEnd();
    };
    check();
    const t = setInterval(() => {
      setTick((n) => n + 1);
      check();
    }, 100);
    return () => clearInterval(t);
  }, [timer?.status, timer?.startedAt, timer?.remainingMs]);

  // 時間を選ぶパネルは、外をクリックするか Esc で閉じる
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

  const remaining = timerRemaining(timer);
  const running = timer?.status === 'running';
  const finished = running && remaining <= 0;
  const active = !!timer && timer.status !== 'idle' && !(finished && remaining < -FINISHED_FLASH_MS);

  // タイマーの状態が変わったら（誰かが開始・終了した、時間になった）、開いているパネルやメニューを閉じる
  const phase = !active ? 'idle' : finished ? 'finished' : 'active';
  useEffect(() => setOpen(false), [phase]);

  // 操作メニューは、最後に操作してから5秒で自動で閉じる。マウスを乗せている間は閉じない。
  // （時間を選ぶパネルは、考えている途中で閉じないよう自動では閉じない）
  const [menuActivity, setMenuActivity] = useState(0);
  const [hovering, setHovering] = useState(false);
  const touchMenu = () => setMenuActivity((n) => n + 1);
  useEffect(() => {
    if (!open || phase !== 'active' || hovering) return;
    const t = setTimeout(() => setOpen(false), MENU_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [open, phase, hovering, menuActivity]);

  // 全員の画面で同時に動くので、プリセットは時間を入れるだけにして、開始は「開始」ボタンだけで行う
  const start = () => {
    setOpen(false);
    saveLastMinutes(minutes);
    startTimer(boardId, minutes * 60_000).catch(report);
  };

  if (!active || !timer) {
    return (
      <div className="timer" ref={ref}>
        <button
          className="timer-start-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Timer size={16} />
          {t('timer.label')}
        </button>
        {open && (
          <div className="timer-panel" role="dialog" aria-label={t('timer.panel')}>
            <div className="timer-custom">
              <button
                className="icon-button"
                aria-label={t('timer.minus')}
                disabled={minutes <= 1}
                onClick={() => setMinutes((m) => Math.max(1, m - 1))}
              >
                <Minus size={16} />
              </button>
              <span className="timer-custom-value">{t('timer.minutes', { count: minutes })}</span>
              <button
                className="icon-button"
                aria-label={t('timer.plus')}
                disabled={minutes >= TIMER_MAX_MINUTES}
                onClick={() => setMinutes((m) => Math.min(TIMER_MAX_MINUTES, m + 1))}
              >
                <Plus size={16} />
              </button>
              <button className="primary-button small" onClick={start}>
                {t('timer.start')}
              </button>
            </div>
            <div className="timer-presets">
              {PRESET_MINUTES.map((m) => (
                <button
                  key={m}
                  className={minutes === m ? 'active' : ''}
                  aria-pressed={minutes === m}
                  onClick={() => setMinutes(m)}
                >
                  {t('timer.minutes', { count: m })}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const ratio = timer.durationMs > 0 ? Math.min(1, Math.max(0, remaining / timer.durationMs)) : 0;
  const paused = timer.status === 'paused';
  // +1分・停止／再開はメニューを開いたままにして続けて押せるようにし、終了したときだけ閉じる
  const act = (op: () => Promise<void>, { close = false } = {}) => {
    if (close) setOpen(false);
    else touchMenu();
    op().catch(report);
  };

  // 時間になったら、ゆっくり2回赤く点滅してから元の表示に戻る。形は動いている間と同じ。
  if (finished) {
    return (
      <div className="timer" ref={ref}>
        <div className="timer-pill finished" role="timer" aria-label={t('timer.finished')}>
          <Timer size={16} />
          <span className="timer-time">0:00</span>
        </div>
      </div>
    );
  }

  // 動いている間はアイコンと残り時間だけを大きく出し、操作は押すと開くメニューにまとめる
  // （全員の画面で同時に動くので、うっかり押して止めてしまうことを防ぐ）
  return (
    <div
      className="timer"
      ref={ref}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
      onPointerLeave={() => {
        setHovering(false);
        touchMenu();
      }}
    >
      <button
        className={`timer-pill ${level(ratio)}${paused ? ' paused' : ''}`}
        role="timer"
        aria-label={t('timer.remaining', { paused: paused ? t('timer.pausedPrefix') : '', time: formatRemaining(remaining) })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          touchMenu();
        }}
      >
        <span className="timer-fill" style={{ width: `${ratio * 100}%` }} />
        {paused ? <Pause size={16} /> : <Timer size={16} />}
        <span className="timer-time">{formatRemaining(remaining)}</span>
      </button>
      {open && (
        <div className="timer-menu" role="menu">
          <button role="menuitem" onClick={() => act(() => addMinute(boardId, timer))}>
            {t('timer.addMinute')}
          </button>
          {paused ? (
            <button role="menuitem" onClick={() => act(() => resumeTimer(boardId, timer))}>
              <Play size={14} />
              {t('timer.resume')}
            </button>
          ) : (
            <button role="menuitem" onClick={() => act(() => pauseTimer(boardId, timer))}>
              <Pause size={14} />
              {t('timer.pause')}
            </button>
          )}
          <button role="menuitem" onClick={() => act(() => stopTimer(boardId), { close: true })}>
            <Square size={13} />
            {t('timer.stop')}
          </button>
        </div>
      )}
    </div>
  );
}
