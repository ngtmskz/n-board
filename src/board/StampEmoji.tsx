import { useEffect, useRef, useState } from 'react';
import {
  STAMP_ANIMATION_OVERRIDES,
  STAMP_ANIMATION_SECONDS,
  stampAnimationUrl,
  stampImageUrl,
  type EmojiStampKind,
} from '../constants';

/** Lottie の動きのデータ（使う項目だけ） */
interface AnimationData {
  fr: number;
  ip: number;
  op: number;
  markers?: { cm: string; tm: number }[];
}

/** 動きのデータは種類ごとに一度だけ読み込む */
const dataCache = new Map<EmojiStampKind, Promise<AnimationData>>();
function loadData(kind: EmojiStampKind) {
  let p = dataCache.get(kind);
  if (!p) {
    p = fetch(stampAnimationUrl(kind)).then((r) => r.json() as Promise<AnimationData>);
    p.catch(() => dataCache.delete(kind));
    dataCache.set(kind, p);
  }
  return p;
}

/** 動きを減らす設定にしている人には動かさない */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * スタンプの絵。ふだんは止まった絵（画像）を出す。
 * animate のときは、Lottie で2秒くらい動かしてから止まった絵に戻す（再生の仕組みはこのときに初めて読み込む）。
 */
export function StampEmoji({ kind, animate = false }: { kind: EmojiStampKind; animate?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) return;
    let cancelled = false;
    let destroy = () => {};
    (async () => {
      const [{ default: lottie }, data] = await Promise.all([import('lottie-web'), loadData(kind)]);
      if (cancelled || !box.current) return;
      const override = STAMP_ANIMATION_OVERRIDES[kind];
      const end = override?.end ?? data.op - data.ip;
      const rest = override?.rest ?? data.markers?.find((m) => m.cm === 'rest')?.tm ?? 0;
      const loops = Math.max(1, Math.round(STAMP_ANIMATION_SECONDS / (end / data.fr)));
      // 同じデータを複数のスタンプで同時に再生するため、渡すたびに複製する（lottie はデータを書き換える）
      const anim = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: structuredClone(data),
      });
      destroy = () => {
        anim.destroy();
        destroy = () => {};
      };
      let count = 0;
      anim.addEventListener('DOMLoaded', () => {
        setPlaying(true);
        anim.playSegments([0, end], true);
      });
      anim.addEventListener('complete', () => {
        count += 1;
        if (count < loops) {
          anim.playSegments([0, end], true);
          return;
        }
        // 止まった絵（rest のコマ）で止めてから、同じ絵の画像に戻す。
        // 画像が表示されてから動きを消す（先に消すと、何も表示されない一瞬ができて点滅して見える）
        anim.goToAndStop(rest, true);
        setPlaying(false);
        requestAnimationFrame(() => requestAnimationFrame(() => destroy()));
      });
    })().catch((e) => console.error(e));
    return () => {
      cancelled = true;
      destroy();
    };
  }, [animate, kind]);

  return (
    <>
      <img
        className="stamp-image"
        src={stampImageUrl(kind)}
        alt=""
        draggable={false}
        style={playing ? { visibility: 'hidden' } : undefined}
      />
      {animate && <div className="stamp-animation" ref={box} aria-hidden="true" />}
    </>
  );
}

/** スタンプの白い縁の太さ（px）。顔のスタンプの白い枠（styles.css の .stamp .face）とそろえる。 */
const OUTLINE_WIDTH = 3;

/**
 * スタンプの白い縁を作るフィルター（CSS から filter: url(#stamp-outline) で使う）。
 * 絵の輪郭をぼかしてから、外側の決まった位置で切り取ると、どの向きにもなめらかに広がった縁になる。
 * （影をずらして重ねる方法は、ずらす幅が 1px 単位に丸められ、太さを細かく決められないため使わない）
 * 画像の書き出しはボード（.world）の中だけを写し取るので、このフィルターもボードの中に置く。
 */
export function StampOutlineFilter() {
  // ぼかしの広がり（標準偏差）を縁の太さの半分にすると、境目（不透明度 約2.3%）がちょうど縁の太さの位置に来る
  const sd = OUTLINE_WIDTH / 2;
  const edgeAlpha = 0.0228;
  // 境目のあたりを、およそ 1px の幅で透明から不透明に変える（ふちのギザギザを目立たなくする）
  const slope = sd * Math.sqrt(2 * Math.PI) * Math.exp(2);
  const intercept = 0.5 - slope * edgeAlpha;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="stamp-outline" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation={sd} result="blur" />
        <feComponentTransfer in="blur" result="shape">
          <feFuncA type="linear" slope={slope} intercept={intercept} />
        </feComponentTransfer>
        <feFlood floodColor="#fff" />
        <feComposite in2="shape" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </svg>
  );
}
