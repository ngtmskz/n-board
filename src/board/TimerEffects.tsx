import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { STICKY_COLORS } from '../constants';
import { playSound } from '../lib/sound';

/**
 * タイマーの演出（最後の3秒のカウントダウン・終了の紙吹雪）。
 * 音は人ごとに消せるが、見た目の演出は全員に出す（動きを減らす設定の人には出さない）。
 */
interface EffectsState {
  /** 表示中のカウントダウンの数字。key は同じ数字でもアニメーションをやり直すため。 */
  countdown: { n: number; key: number } | null;
  confettiKey: number;
}

const useEffectsState = create<EffectsState>(() => ({ countdown: null, confettiKey: 0 }));

export function showCountdown(n: number) {
  playSound('tick');
  useEffectsState.setState({ countdown: { n, key: Date.now() } });
}

export function celebrateTimerEnd() {
  playSound('end');
  useEffectsState.setState({ countdown: null, confettiKey: Date.now() });
}

const COUNTDOWN_MS = 1000;
/** 紙吹雪の全体の長さと、薄くなり始めるまでの時間（そこから終わりまでかけて、じんわり消える） */
const CONFETTI_MS = 4000;
const CONFETTI_FADE_START_MS = 2000;
const CONFETTI_PIECES = 40;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function Countdown() {
  const countdown = useEffectsState((s) => s.countdown);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!countdown) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), COUNTDOWN_MS);
    return () => clearTimeout(t);
  }, [countdown]);
  if (!countdown || !visible || prefersReducedMotion()) return null;
  return (
    <div className="timer-countdown" key={countdown.key} aria-hidden="true">
      {countdown.n}
    </div>
  );
}

function Confetti() {
  const confettiKey = useEffectsState((s) => s.confettiKey);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!confettiKey || !canvas || prefersReducedMotion()) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    const colors = Object.values(STICKY_COLORS);
    // 画面の上から、付箋の色の紙吹雪を左右に揺らしながらゆっくり降らせる
    const pieces = Array.from({ length: CONFETTI_PIECES }, () => ({
      x: Math.random() * w,
      // ゆっくり降るので、どの紙も消える前に見えるよう、画面のすぐ上から降らせる
      y: -20 - Math.random() * 120,
      vy: 0.6 + Math.random() * 0.6,
      w: 9 + Math.random() * 6,
      h: 6 + Math.random() * 5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.08,
      phase: Math.random() * Math.PI * 2,
      sway: 0.6 + Math.random() * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    let last = start;
    let frame = 0;
    const draw = (now: number) => {
      const t = now - start;
      // 画面の書き換えの速さ（60Hz・120Hz など）に関係なく、同じ速さで降るようにする
      const k = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      g.clearRect(0, 0, w, h);
      if (t >= CONFETTI_MS) return;
      // 途中から終わりまでかけて、なめらかに薄くする
      const fade = Math.min(1, Math.max(0, (t - CONFETTI_FADE_START_MS) / (CONFETTI_MS - CONFETTI_FADE_START_MS)));
      g.globalAlpha = 1 - fade * fade * (3 - 2 * fade);
      for (const p of pieces) {
        p.vy = Math.min(p.vy + 0.01 * k, 1.6);
        p.x += Math.sin(t / 450 + p.phase) * p.sway * k;
        p.y += p.vy * k;
        p.angle += p.spin * k;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        // 紙が裏返るように、ひらひらと形を変える
        g.scale(1, Math.abs(Math.cos(t / 300 + p.phase)) * 0.8 + 0.2);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        g.lineWidth = 0.5;
        g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      g.clearRect(0, 0, w, h);
    };
  }, [confettiKey]);

  return <canvas ref={ref} className="timer-confetti" aria-hidden="true" />;
}

/** ボード画面に1つだけ置く。キャンバスの操作の邪魔はしない。 */
export function TimerEffects() {
  return (
    <>
      <Countdown />
      <Confetti />
    </>
  );
}
