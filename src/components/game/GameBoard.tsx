import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { AnimatePresence } from "motion/react";
import type { Grid as GridType, Position } from "@/types/game";
import { GRID_COLS, GRID_ROWS, CELL_W, CELL_H } from "@/lib/constants";
import Tile from "./Tile";

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const DRAG_THRESHOLD_RATIO = 0.3;
const MONO_FONT = "Inter, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";

// Heavy-feel physics: all interactions feed into targets, a single chase loop interpolates
const CHASE_LERP = 0.09;
const ZOOM_LERP = 0.08;
const TOUCH_CHASE_LERP = 0.18;
const TOUCH_ZOOM_LERP = 0.16;
const SCROLL_DAMPING = 0.45;
const ZOOM_SENSITIVITY = 0.012;
const COAST_MULTIPLIER = 10;
const SETTLE_PX = 0.12;
const SETTLE_SCALE = 0.0003;

interface GameBoardProps {
  grid: GridType;
  matchedPositions: Set<string>;
  fallingTiles: Map<string, { dist: number; delay: number }>;
  isProcessing: boolean;
  onSwap: (from: Position, to: Position) => void;
  binPositions: Record<string, DOMRect>;
}

function clampOffset(
  ox: number,
  oy: number,
  s: number,
  vw: number,
  vh: number
): { x: number; y: number } {
  const gw = GRID_COLS * CELL_W * s;
  const gh = GRID_ROWS * CELL_H * s;
  let x = ox;
  let y = oy;
  if (gw > vw) {
    x = Math.min(0, Math.max(vw - gw, x));
  } else {
    x = (vw - gw) / 2;
  }
  if (gh > vh) {
    y = Math.min(0, Math.max(vh - gh, y));
  } else {
    y = (vh - gh) / 2;
  }
  return { x, y };
}

interface DragInfo {
  tileRow: number;
  tileCol: number;
  startX: number;
  startY: number;
}

export default function GameBoard({
  grid,
  matchedPositions,
  fallingTiles,
  isProcessing,
  onSwap,
  binPositions,
}: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const dragRef = useRef<DragInfo | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    row: number;
    col: number;
    dx: number;
    dy: number;
  } | null>(null);
  const swappedDuringDrag = useRef(false);
  const [snapBack, setSnapBack] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const textColorRef = useRef("#37352f");

  // Unified chase targets: all interactions write here, loop interpolates toward them
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const targetScaleRef = useRef(1);
  const chaseLoopRef = useRef<number>(0);
  const chaseVelRef = useRef({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);

  useEffect(() => {
    const c = getComputedStyle(document.documentElement)
      .getPropertyValue("--canvas-text")
      .trim();
    if (c) textColorRef.current = c;
  }, []);

  const animatingKeys = useMemo(() => {
    const keys = new Set<string>();
    matchedPositions.forEach((k) => keys.add(k));
    if (dragVisual) keys.add(`${dragVisual.row},${dragVisual.col}`);
    if (snapBack) keys.add(`${snapBack.row},${snapBack.col}`);
    fallingTiles.forEach((_, k) => keys.add(k));
    return keys;
  }, [matchedPositions, dragVisual, snapBack, fallingTiles]);

  // ---- Canvas rendering ----

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    ctx.font = `500 19px ${MONO_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColorRef.current;

    const invS = 1 / scale;
    const minC = Math.max(0, Math.floor(-offset.x * invS / CELL_W) - 1);
    const maxC = Math.min(
      GRID_COLS - 1,
      Math.floor((-offset.x + cw) * invS / CELL_W) + 1
    );
    const minR = Math.max(0, Math.floor(-offset.y * invS / CELL_H) - 1);
    const maxR = Math.min(
      GRID_ROWS - 1,
      Math.floor((-offset.y + ch) * invS / CELL_H) + 1
    );

    for (let r = minR; r <= maxR; r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = minC; c <= maxC; c++) {
        const tile = row[c];
        if (!tile) continue;
        if (animatingKeys.has(`${r},${c}`)) continue;
        ctx.fillText(
          tile.letter,
          c * CELL_W + CELL_W / 2,
          r * CELL_H + CELL_H / 2
        );
      }
    }

    ctx.restore();
  }, [grid, offset, scale, animatingKeys]);

  // ---- Viewport helper ----

  const getViewport = useCallback(() => {
    if (!containerRef.current) return { w: 0, h: 0 };
    const r = containerRef.current.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, []);

  // ---- Initial centering ----

  useEffect(() => {
    const { w, h } = getViewport();
    if (!w) return;
    const gridW = GRID_COLS * CELL_W;
    const gridH = GRID_ROWS * CELL_H;
    const initial = clampOffset((w - gridW) / 2, (h - gridH) / 2, 1, w, h);
    targetOffsetRef.current = initial;
    targetScaleRef.current = 1;
    offsetRef.current = initial;
    setOffset(initial);
  }, [getViewport]);

  // ---- Unified chase loop ----

  const ensureChaseLoop = useCallback(() => {
    if (chaseLoopRef.current) return;

    let prevTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dtRatio = Math.min((now - prevTime) / 16.67, 3);
      prevTime = now;

      const pinching = isPinchingRef.current;
      const aOff = 1 - Math.pow(1 - (pinching ? TOUCH_CHASE_LERP : CHASE_LERP), dtRatio);
      const aZoom = 1 - Math.pow(1 - (pinching ? TOUCH_ZOOM_LERP : ZOOM_LERP), dtRatio);

      const o = offsetRef.current;
      const to = targetOffsetRef.current;
      const s = scaleRef.current;
      const ts = targetScaleRef.current;

      const dx = (to.x - o.x) * aOff;
      const dy = (to.y - o.y) * aOff;
      const ds = (ts - s) * aZoom;

      chaseVelRef.current = { x: dx, y: dy };

      const offDone =
        Math.abs(to.x - o.x) < SETTLE_PX &&
        Math.abs(to.y - o.y) < SETTLE_PX;
      const sDone = Math.abs(ts - s) < SETTLE_SCALE;

      if (offDone && sDone && !isPanning.current) {
        // Snap to targets and stop
        offsetRef.current = to;
        scaleRef.current = ts;
        setOffset(to);
        setScale(ts);
        chaseLoopRef.current = 0;
        return;
      }

      const nextOff = { x: o.x + dx, y: o.y + dy };
      const nextScale = s + ds;

      offsetRef.current = nextOff;
      scaleRef.current = nextScale;
      setOffset(nextOff);
      setScale(nextScale);

      chaseLoopRef.current = requestAnimationFrame(tick);
    };

    chaseLoopRef.current = requestAnimationFrame(tick);
  }, []);

  const cancelChaseLoop = useCallback(() => {
    if (chaseLoopRef.current) {
      cancelAnimationFrame(chaseLoopRef.current);
      chaseLoopRef.current = 0;
    }
  }, []);

  useEffect(() => {
    return () => cancelChaseLoop();
  }, [cancelChaseLoop]);

  // ---- Wheel: heavy scroll + heavy zoom ----

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const { w, h } = getViewport();

      if (e.ctrlKey || e.metaKey) {
        // Heavy zoom: accumulate into target scale
        const raw = e.deltaY > 0 ? -ZOOM_SENSITIVITY : ZOOM_SENSITIVITY;
        const oldTS = targetScaleRef.current;
        const newTS = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldTS * (1 + raw)));

        // Adjust target offset so zoom is centred on cursor
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const o = offsetRef.current;
        const s = scaleRef.current;
        const gx = (cx - o.x) / s;
        const gy = (cy - o.y) / s;

        targetScaleRef.current = newTS;
        targetOffsetRef.current = clampOffset(
          cx - gx * newTS,
          cy - gy * newTS,
          newTS,
          w,
          h
        );
        ensureChaseLoop();
        return;
      }

      // Heavy scroll: accumulate damped deltas into target offset
      const to = targetOffsetRef.current;
      const ts = targetScaleRef.current;
      targetOffsetRef.current = clampOffset(
        to.x - e.deltaX * SCROLL_DAMPING,
        to.y - e.deltaY * SCROLL_DAMPING,
        ts,
        w,
        h
      );
      ensureChaseLoop();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [getViewport, ensureChaseLoop]);

  // ---- Touch: pinch-to-zoom + two-finger pan ----

  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
    startOx: number;
    startOy: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const getTouchMid = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
      if (e.touches.length === 2) {
        e.preventDefault();
        cancelChaseLoop();
        dragRef.current = null;
        setDragVisual(null);
        isPinchingRef.current = true;

        const d = getTouchDist(e.touches[0]!, e.touches[1]!);
        const mid = getTouchMid(e.touches[0]!, e.touches[1]!);
        pinchRef.current = {
          startDist: d,
          startScale: scaleRef.current,
          startMidX: mid.x,
          startMidY: mid.y,
          startOx: offsetRef.current.x,
          startOy: offsetRef.current.y,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
      }
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = getTouchDist(e.touches[0]!, e.touches[1]!);
        const mid = getTouchMid(e.touches[0]!, e.touches[1]!);
        const { w, h } = getViewport();

        const ratio = d / pinchRef.current.startDist;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchRef.current.startScale * ratio)
        );

        const rect = el.getBoundingClientRect();
        const cx = pinchRef.current.startMidX - rect.left;
        const cy = pinchRef.current.startMidY - rect.top;
        const gx = (cx - pinchRef.current.startOx) / pinchRef.current.startScale;
        const gy = (cy - pinchRef.current.startOy) / pinchRef.current.startScale;

        const panDx = mid.x - pinchRef.current.startMidX;
        const panDy = mid.y - pinchRef.current.startMidY;

        const newOx = cx - gx * newScale + panDx;
        const newOy = cy - gy * newScale + panDy;

        const clamped = clampOffset(newOx, newOy, newScale, w, h);
        targetScaleRef.current = newScale;
        targetOffsetRef.current = clamped;
        ensureChaseLoop();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = null;
        isPinchingRef.current = false;
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [getViewport, cancelChaseLoop, ensureChaseLoop]);

  // ---- Coordinate-based tile hit testing ----

  const hitTestTile = useCallback(
    (clientX: number, clientY: number): Position | null => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const gx =
        (clientX - rect.left - offsetRef.current.x) / scaleRef.current;
      const gy =
        (clientY - rect.top - offsetRef.current.y) / scaleRef.current;
      const col = Math.floor(gx / CELL_W);
      const row = Math.floor(gy / CELL_H);
      if (
        row >= 0 &&
        row < GRID_ROWS &&
        col >= 0 &&
        col < GRID_COLS &&
        grid[row]?.[col]
      ) {
        return { row, col };
      }
      return null;
    },
    [grid]
  );

  // ---- Shared helpers for starting pan / tile-drag ----

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      isPanning.current = true;
      chaseVelRef.current = { x: 0, y: 0 };
      panStart.current = {
        x: clientX,
        y: clientY,
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      };
      ensureChaseLoop();
    },
    [ensureChaseLoop]
  );

  const startTileDrag = useCallback(
    (row: number, col: number, clientX: number, clientY: number) => {
      dragRef.current = {
        tileRow: row,
        tileCol: col,
        startX: clientX,
        startY: clientY,
      };
      swappedDuringDrag.current = false;
      setDragVisual({ row, col, dx: 0, dy: 0 });
    },
    []
  );

  // ---- Pointer handlers ----

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      cancelChaseLoop();
      targetOffsetRef.current = { ...offsetRef.current };
      targetScaleRef.current = scaleRef.current;

      const hit = hitTestTile(e.clientX, e.clientY);
      const isTouch = e.pointerType === "touch";

      // Tile hit: always treat as tile drag (never pan), even during match animation
      if (hit) {
        startTileDrag(hit.row, hit.col, e.clientX, e.clientY);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // Single-finger touch: no panning (reserved for tile interactions)
      if (isTouch) return;

      startPan(e.clientX, e.clientY);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [hitTestTile, cancelChaseLoop, startPan, startTileDrag]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Tile drag (mouse and touch)
      if (dragRef.current && !swappedDuringDrag.current) {
        const s = scaleRef.current;
        const screenDx = e.clientX - dragRef.current.startX;
        const screenDy = e.clientY - dragRef.current.startY;
        const dx = screenDx / s;
        const dy = screenDy / s;

        setDragVisual({
          row: dragRef.current.tileRow,
          col: dragRef.current.tileCol,
          dx,
          dy,
        });

        const thresholdX = CELL_W * DRAG_THRESHOLD_RATIO;
        const thresholdY = CELL_H * DRAG_THRESHOLD_RATIO;
        let targetRow = dragRef.current.tileRow;
        let targetCol = dragRef.current.tileCol;

        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > thresholdX) targetCol++;
          else if (dx < -thresholdX) targetCol--;
        } else {
          if (dy > thresholdY) targetRow++;
          else if (dy < -thresholdY) targetRow--;
        }

        if (
          targetRow !== dragRef.current.tileRow ||
          targetCol !== dragRef.current.tileCol
        ) {
          if (
            targetRow >= 0 &&
            targetRow < GRID_ROWS &&
            targetCol >= 0 &&
            targetCol < GRID_COLS
          ) {
            swappedDuringDrag.current = true;
            setDragVisual(null);
            onSwap(
              { row: dragRef.current.tileRow, col: dragRef.current.tileCol },
              { row: targetRow, col: targetCol }
            );
          }
        }
        return;
      }

      if (isPanning.current) {
        const { w, h } = getViewport();
        const rawX = panStart.current.ox + (e.clientX - panStart.current.x);
        const rawY = panStart.current.oy + (e.clientY - panStart.current.y);
        targetOffsetRef.current = clampOffset(
          rawX,
          rawY,
          scaleRef.current,
          w,
          h
        );
      }
    },
    [getViewport, onSwap, startPan]
  );

  const handlePointerUp = useCallback(() => {
    if (dragRef.current) {
      if (
        !swappedDuringDrag.current &&
        dragVisual &&
        (Math.abs(dragVisual.dx) > 1 || Math.abs(dragVisual.dy) > 1)
      ) {
        const pos = {
          row: dragRef.current.tileRow,
          col: dragRef.current.tileCol,
        };
        setSnapBack(pos);
        setTimeout(() => setSnapBack(null), 400);
      }
      dragRef.current = null;
      setDragVisual(null);
      return;
    }

    if (isPanning.current) {
      isPanning.current = false;

      const vel = chaseVelRef.current;
      if (Math.abs(vel.x) > 0.3 || Math.abs(vel.y) > 0.3) {
        const { w, h } = getViewport();
        const to = targetOffsetRef.current;
        const remain = {
          x: to.x - offsetRef.current.x,
          y: to.y - offsetRef.current.y,
        };
        targetOffsetRef.current = clampOffset(
          to.x + vel.x * COAST_MULTIPLIER + remain.x * 0.4,
          to.y + vel.y * COAST_MULTIPLIER + remain.y * 0.4,
          targetScaleRef.current,
          w,
          h
        );
      }
    }
  }, [dragVisual, getViewport]);

  // ---- Float-to-bin targeting ----

  const getFloatTarget = useCallback(
    (letter: string, row: number, col: number) => {
      if (!binPositions[letter]) return null;
      const binRect = binPositions[letter];
      const binCX = binRect.left + binRect.width / 2;
      const binCY = binRect.top + binRect.height / 2;
      const s = scaleRef.current;
      const o = offsetRef.current;
      const tileScreenX = o.x + col * CELL_W * s + (CELL_W * s) / 2;
      const tileScreenY = o.y + row * CELL_H * s + (CELL_H * s) / 2;
      return {
        x: (binCX - tileScreenX) / s,
        y: (binCY - tileScreenY) / s,
      };
    },
    [binPositions]
  );

  // ---- Render ----

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      />

      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          position: "absolute",
          width: GRID_COLS * CELL_W,
          height: GRID_ROWS * CELL_H,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence mode="popLayout">
          {grid.flatMap((row, r) =>
            row.map((tile, c) => {
              if (!tile) return null;
              const key = `${r},${c}`;
              if (!animatingKeys.has(key)) return null;

              const isMatched = matchedPositions.has(key);
              const isDragging =
                dragVisual?.row === r && dragVisual?.col === c;
              const fallInfo = fallingTiles.get(key);
              const fallDist = fallInfo?.dist ?? 0;
              const fallDelay = fallInfo?.delay ?? 0;
              let floatStaggerIdx = 0;
              if (isMatched) {
                floatStaggerIdx = Array.from(matchedPositions).indexOf(key);
              }
              return (
                <Tile
                  key={tile.id}
                  tile={tile}
                  row={r}
                  col={c}
                  isDragging={isDragging}
                  dragDx={isDragging ? dragVisual.dx : 0}
                  dragDy={isDragging ? dragVisual.dy : 0}
                  isMatched={isMatched}
                  floatTo={
                    isMatched ? getFloatTarget(tile.letter, r, c) : null
                  }
                  floatDelay={floatStaggerIdx * 0.08}
                  fallDistance={fallDist}
                  fallDelay={fallDelay}
                />
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
