// 効果音と BGM の再生。
// - 効果音のファイルは public/sounds（出典は public/sounds/CREDITS.md）
// - BGM のファイルは public/music（出典は public/music/CREDITS.md）
// どの曲を流すかはボードで共有し（src/data/bgm.ts）、聞く音量は人ごと（このファイル）。
// 音量は効果音と BGM をまとめた1本で、そのブラウザに覚えておく。
import { create } from 'zustand';
import { BGM_TRACKS, type BgmTrackId } from '../constants';

const SOUNDS = {
  /** タイマーの残り3・2・1秒 */
  tick: '/sounds/countdown-tick.mp3',
  /** タイマーが0になったとき */
  end: '/sounds/timer-end.mp3',
} as const;

export type SoundName = keyof typeof SOUNDS;

/** 効果音の素材の頭にある無音（約0.1秒）を飛ばして、画面の表示とずれないようにする */
const LEADING_SILENCE_SEC = 0.08;
/** BGM は効果音より控えめに鳴らす（音量に対する割合） */
const BGM_LEVEL = 0.35;
/** 曲を始める・止める・切り替えるときに、じわっと大きく／小さくする長さ */
const BGM_FADE_SEC = 0.6;
const VOLUME_KEY = 'nboard:volume';
/** 前の「音あり／なし」の設定（音量に置き換える前のもの） */
const OLD_SOUND_KEY = 'nboard:sound';
const DEFAULT_VOLUME = 0.7;

function loadVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    if (saved !== null) {
      const v = Number(saved);
      if (v >= 0 && v <= 1) return v;
    }
    if (localStorage.getItem(OLD_SOUND_KEY) === 'off') return 0;
  } catch {
    // 読めなくても動作に影響はない
  }
  return DEFAULT_VOLUME;
}

interface SoundState {
  /** 自分の音量（0〜1）。効果音と BGM の両方に効く。 */
  volume: number;
  /** 今流している（流したい）BGM */
  bgm: BgmTrackId | null;
  /** BGM が流れているが、ページをまだ一度も操作していないので鳴らせない */
  blocked: boolean;
}

export const useSound = create<SoundState>(() => ({ volume: loadVolume(), bgm: null, blocked: false }));

export function setVolume(value: number) {
  const volume = Math.min(1, Math.max(0, value));
  useSound.setState({ volume });
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // 保存できなくても、このページを開いている間は設定が効く
  }
  if (context && master) master.gain.setTargetAtTime(volume, context.currentTime, 0.05);
}

// ---- 音のファイルの読み込み ----

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
let decoder: OfflineAudioContext | null = null;

/**
 * 音のファイルを読み込む（同じファイルは1回だけ）。
 * ページを操作する前でも使える OfflineAudioContext で読み込む（AudioBuffer はどの再生にも使える）。
 */
function load(url: string): Promise<AudioBuffer | null> {
  const cached = loading.get(url);
  if (cached) return cached;
  decoder ??= new OfflineAudioContext(1, 1, 44100);
  const promise = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((data) => decoder!.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(url, buffer);
      return buffer;
    })
    .catch((e) => {
      console.warn('音を読み込めませんでした', url, e);
      loading.delete(url);
      return null;
    });
  loading.set(url, promise);
  return promise;
}

/** 効果音を先に読み込んでおく（ボードを開いたときに呼ぶ）。最初の1回だけ鳴るのが遅れないようにする。 */
export function preloadSounds() {
  return Promise.all(Object.values(SOUNDS).map(load)).then(() => undefined);
}

// ---- 再生の準備 ----

let context: AudioContext | null = null;
let master: GainNode | null = null;
let bgmBus: GainNode | null = null;

function ensureContext() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = useSound.getState().volume;
    master.connect(context.destination);
    bgmBus = context.createGain();
    bgmBus.gain.value = BGM_LEVEL;
    bgmBus.connect(master);
  }
  return context;
}

/**
 * ブラウザの制限で、ページを一度も操作していないうちは音を鳴らせない。
 * 最初に操作したときに再生の準備をし、流れているはずの BGM を始める。
 */
function unlock() {
  const c = ensureContext();
  const ready = () => {
    if (c.state !== 'running') return;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    void applyBgm();
  };
  if (c.state === 'suspended') void c.resume().then(ready);
  else ready();
}
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

function isRunning(): boolean {
  return !!context && context.state === 'running';
}

// ---- 効果音 ----

export function playSound(name: SoundName) {
  if (useSound.getState().volume === 0 || !isRunning() || !master) return;
  const buffer = buffers.get(SOUNDS[name]);
  if (!buffer) return;
  const source = context!.createBufferSource();
  source.buffer = buffer;
  source.connect(master);
  source.start(0, Math.min(LEADING_SILENCE_SEC, buffer.duration));
}

// ---- BGM ----

let current: { track: BgmTrackId; source: AudioBufferSourceNode; gain: GainNode } | null = null;
/** 曲の読み込み中に別の曲に変わったときに、古い方を流さないための番号 */
let request = 0;

/** 流す BGM を変える（null なら止める）。ボードの BGM が変わったときに呼ぶ。 */
export function playBgm(track: BgmTrackId | null) {
  useSound.setState({ bgm: track });
  void applyBgm();
}

function stopCurrent() {
  if (!current || !context) return;
  const { source, gain } = current;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + BGM_FADE_SEC);
  source.stop(now + BGM_FADE_SEC);
  current = null;
}

async function applyBgm() {
  const id = ++request;
  const track = useSound.getState().bgm;
  if (current?.track === track) return;
  stopCurrent();
  if (!track) {
    useSound.setState({ blocked: false });
    return;
  }
  if (!isRunning() || !bgmBus) {
    useSound.setState({ blocked: true });
    return;
  }
  useSound.setState({ blocked: false });
  const def = BGM_TRACKS.find((t) => t.id === track);
  const buffer = def ? await load(def.file) : null;
  if (id !== request || !buffer || !context) return;
  // つなぎ目なくくり返す（音源は最後と最初がつながるループで用意する）
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + BGM_FADE_SEC);
  source.connect(gain).connect(bgmBus);
  source.start();
  current = { track, source, gain };
}
