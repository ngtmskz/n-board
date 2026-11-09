// 付箋などから矢印を伸ばす操作（付箋の「＋」と、ツールバーの「矢印」で使う）。
// ドラッグして離すか、（矢印のツールでは）クリックしてから先をクリックして引く。
import { addConnectedItem, addConnector, connectedLook } from './actions';
import { reveal } from './ArrangeAids';
import { alignToSource, boxAt, connectedStickyRect, isConnectable } from './geometry';
import { usePreview } from './PlacementPreview';
import { getObjects, useBoard } from './store';

/** これより短いドラッグはクリックとみなす（画面上の px） */
const CONNECT_DRAG_THRESHOLD_PX = 4;

type ToCanvas = (clientX: number, clientY: number) => { x: number; y: number };
type Keys = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/**
 * 伸ばしている矢印のプレビューを、カーソルの位置に合わせて更新する。
 * つながる先があればその枠を、なければ（withGhost のとき）離すとできるものを半透明で出す。
 */
function updatePreview(fromId: string, raw: { x: number; y: number }, keys: Keys, withGhost: boolean) {
  const objects = getObjects();
  const from = objects[fromId];
  if (!from || !isConnectable(from)) return;
  const p = alignToSource(raw, from, keys, useBoard.getState().viewport.zoom);
  // つながる先は、そろえた位置で見つからなければカーソルの位置で探す（吸い付いて先から外れないように）
  const target = boxAt(p.x, p.y, objects, fromId) ?? boxAt(raw.x, raw.y, objects, fromId);
  const look = withGhost && !target ? connectedLook(fromId) : null;
  usePreview.setState({
    connect: {
      fromId,
      x: p.x,
      y: p.y,
      targetId: target?.id ?? null,
      ghost: look ? { ...connectedStickyRect(from, p, look.w, look.h), look } : null,
    },
  });
}

/** クリックで矢印を伸ばしている途中（矢印のツールで、始まりをクリックしたあと） */
let pending: { fromId: string; stop: () => void } | null = null;

/** クリックで伸ばしている途中の矢印をやめる。やめたら true（Esc を「ツールの終了」ではなく、これに使う）。 */
export function cancelPendingConnect(): boolean {
  if (!pending) return false;
  pending.stop();
  return true;
}

export function isConnectPending() {
  return pending !== null;
}

/**
 * クリックで伸ばしている途中に、どこかを押したとき：つなげるものならつなぎ、
 * 元のもの・何もないところならやめる（矢印のツールは続ける）。
 */
export function finishPendingConnect(point: { x: number; y: number }) {
  if (!pending) return;
  const { fromId } = pending;
  const target = boxAt(point.x, point.y, getObjects(), fromId);
  pending.stop();
  if (target) addConnector(fromId, target.id);
}

/**
 * fromId から矢印を伸ばし始める（押したときに呼ぶ）。
 * ドラッグして、ほかのもの（付箋・テキスト・画像）の上で離すとつなぐ。何もないところで離すと、
 * 元と同じ種類のもの（付箋・テキスト。画像からは作らない）を作ってつなぐ。
 * clickToConnect のときは、動かさずに離すと「クリックで伸ばしている途中」になり、次に押したところで決める（finishPendingConnect）。
 * onEnd にはドラッグしたか（クリックだけだったか）を渡す。
 */
export function beginConnect(
  fromId: string,
  start: { clientX: number; clientY: number },
  toCanvas: ToCanvas,
  options: { clickToConnect?: boolean; onEnd?: (dragged: boolean) => void } = {},
) {
  cancelPendingConnect();
  let dragging = false;
  const onMove = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - start.clientX, ev.clientY - start.clientY) < CONNECT_DRAG_THRESHOLD_PX) return;
    dragging = true;
    updatePreview(fromId, toCanvas(ev.clientX, ev.clientY), ev, true);
  };
  const detach = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  const onUp = (ev: PointerEvent) => {
    detach();
    if (!dragging && options.clickToConnect && ev.type !== 'pointercancel') {
      startPending(fromId, toCanvas, ev);
      options.onEnd?.(false);
      return;
    }
    const connect = usePreview.getState().connect;
    usePreview.setState({ connect: null });
    if (dragging && connect && ev.type !== 'pointercancel') {
      if (connect.targetId) {
        addConnector(fromId, connect.targetId);
      } else if (connect.ghost) {
        const { look: _look, ...rect } = connect.ghost;
        const id = addConnectedItem(fromId, rect);
        if (id) reveal(id);
      }
    }
    options.onEnd?.(dragging);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** クリックで伸ばし始める：次に押すまで、カーソルまで矢印を伸ばして見せる（離すとできるものは出さない） */
function startPending(fromId: string, toCanvas: ToCanvas, at: PointerEvent) {
  const onMove = (ev: PointerEvent) => updatePreview(fromId, toCanvas(ev.clientX, ev.clientY), ev, false);
  window.addEventListener('pointermove', onMove);
  pending = {
    fromId,
    stop: () => {
      window.removeEventListener('pointermove', onMove);
      pending = null;
      usePreview.setState({ connect: null, pendingConnect: false });
    },
  };
  usePreview.setState({ pendingConnect: true });
  updatePreview(fromId, toCanvas(at.clientX, at.clientY), at, false);
}
