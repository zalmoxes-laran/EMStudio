// Overview minimap: scaled-down picture of the whole scene with the current
// viewport rectangle; click/drag to move the view.
import { nodeStyle } from "./palette";
import { sceneBounds, type Scene, type Viewport } from "./scene";

const W = 200;
const H = 132;
const PAD = 6;

export interface OverviewApi {
  update: (scene: Scene | null, vp: Viewport, viewW: number, viewH: number) => void;
}

export function buildOverview(
  root: HTMLCanvasElement,
  onMove: (worldX: number, worldY: number) => void,
): OverviewApi {
  const dpr = window.devicePixelRatio || 1;
  root.width = W * dpr;
  root.height = H * dpr;
  root.style.width = W + "px";
  root.style.height = H + "px";
  const ctx = root.getContext("2d")!;

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let dragging = false;

  const toWorld = (mx: number, my: number): { x: number; y: number } => ({
    x: (mx - ox) / scale,
    y: (my - oy) / scale,
  });

  root.addEventListener("pointerdown", (e) => {
    dragging = true;
    root.setPointerCapture(e.pointerId);
    const r = root.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    onMove(w.x, w.y);
  });
  root.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const r = root.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    onMove(w.x, w.y);
  });
  root.addEventListener("pointerup", () => (dragging = false));

  return {
    update(scene, vp, viewW, viewH): void {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!scene || !scene.nodes.length) return;
      const b = sceneBounds(scene);
      scale = Math.min((W - PAD * 2) / b.w, (H - PAD * 2) / b.h);
      ox = PAD - b.x * scale + (W - PAD * 2 - b.w * scale) / 2;
      oy = PAD - b.y * scale + (H - PAD * 2 - b.h * scale) / 2;

      for (const lane of scene.lanes) {
        ctx.fillStyle = "#E4EDF7";
        ctx.fillRect(ox + b.x * scale, oy + lane.y * scale, b.w * scale, lane.height * scale);
      }
      for (const n of scene.nodes) {
        ctx.fillStyle = nodeStyle(n.node.node_type).border;
        ctx.fillRect(
          ox + n.x * scale,
          oy + n.y * scale,
          Math.max(1.5, n.w * scale),
          Math.max(1.5, n.h * scale),
        );
      }
      // viewport rectangle
      const wx = -vp.x / vp.scale;
      const wy = -vp.y / vp.scale;
      const ww = viewW / vp.scale;
      const wh = viewH / vp.scale;
      ctx.strokeStyle = "#1F6FEB";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + wx * scale, oy + wy * scale, ww * scale, wh * scale);
    },
  };
}
