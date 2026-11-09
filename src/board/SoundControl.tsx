import { Music, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from '../components/Toast';
import { BGM_TRACKS, type BgmTrackId } from '../constants';
import { setBgmTrack, subscribeBgm } from '../data/bgm';
import { playBgm, setVolume, useSound } from '../lib/sound';
import { useT } from '../i18n';

/**
 * タイマーの右に置く音のボタン。押すと BGM と音量のパネルが開く。
 * - BGM：選んだ曲は参加者全員に流れる（ボードで共有）
 * - 音量：効果音と BGM をまとめた1本で、自分にだけ効く
 */
export function SoundControl({ boardId }: { boardId: string }) {
  const t = useT();
  const volume = useSound((s) => s.volume);
  const bgm = useSound((s) => s.bgm);
  const blocked = useSound((s) => s.blocked);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ボードの BGM に合わせて流す。ボードを離れたら止める。
  useEffect(() => {
    const stop = subscribeBgm(boardId, playBgm);
    return () => {
      stop();
      playBgm(null);
    };
  }, [boardId]);

  // パネルは、外をクリックするか Esc で閉じる
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

  const choose = (track: BgmTrackId | null) => {
    setBgmTrack(boardId, track).catch((e) => {
      console.error(e);
      toast(t('sound.changeFailed'));
    });
  };

  const muted = volume === 0;
  const label = blocked
    ? t('sound.playingMuted')
    : muted
      ? t('sound.mutedTitle')
      : t('sound.title');

  return (
    <div className="sound-control" ref={ref}>
      <button
        className={`sound-button${bgm && !muted ? ' playing' : ''}${muted ? ' muted' : ''}`}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {muted ? (
          <VolumeX size={16} />
        ) : bgm ? (
          // BGM が流れている間は、小さく波打つ表示にする
          <span className="sound-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Music size={16} />
        )}
        {blocked && !muted && <span className="sound-badge" aria-hidden="true" />}
      </button>
      {open && (
        <div className="sound-panel" role="dialog" aria-label={t('sound.panel')}>
          <div className="sound-section-head">
            <b>{t('sound.bgm')}</b>
            <span>{t('sound.shared')}</span>
          </div>
          <div className="sound-tracks" role="radiogroup" aria-label={t('sound.bgm')}>
            <button role="radio" aria-checked={bgm === null} className={bgm === null ? 'on' : ''} onClick={() => choose(null)}>
              {t('common.none')}
            </button>
            {BGM_TRACKS.map((track) => (
              <button
                key={track.id}
                role="radio"
                aria-checked={bgm === track.id}
                className={bgm === track.id ? 'on' : ''}
                onClick={() => choose(track.id)}
              >
                {t(`bgm.${track.id}`)}
              </button>
            ))}
          </div>
          <div className="sound-divider" />
          <div className="sound-section-head">
            <b>{t('sound.volume')}</b>
            <span>{t('sound.volumeNote')}</span>
          </div>
          <div className="sound-volume">
            <button
              className="icon-button"
              title={muted ? t('sound.unmute') : t('sound.mute')}
              aria-label={muted ? t('sound.unmute') : t('sound.mute')}
              onClick={() => setVolume(muted ? 0.7 : 0)}
            >
              {muted ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              aria-label={t('sound.volume')}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
            />
            <span className="sound-volume-value">{Math.round(volume * 100)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
