"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GeoProjection } from "d3-geo";
import type { FrontEditOverlay, MapRenderer } from "@/lib/studio/renderer";
import type { Basemap, RegionFeature } from "@/lib/studio/basemap";
import { hitTest, regionName } from "@/lib/studio/basemap";
import type { Camera, ProjectDoc } from "@/lib/studio/types";
import { createProjection, applyCamera } from "@/lib/studio/projections";
import { preloadFonts, preloadFlags } from "@/lib/studio/drawing";
import { distPointToSegment } from "@/lib/studio/frontline";

export type Tool = "select" | "pan" | "marker" | "pick" | "front";

export interface MapViewProps {
  renderer: MapRenderer;
  project: ProjectDoc;
  basemap: Basemap | null;
  time: number;
  viewCamera: Camera | null;
  onViewCamera: (c: Camera | null) => void;
  selection: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  tool: Tool;
  regionMode: "country" | "province";
  onMapClick: (lonlat: [number, number], region: RegionFeature | null) => void;
  crosshair?: [number, number] | null;
  renderVersion: number;
  showHud: boolean;
  /** Chapter title for the bottom-left stage overlay (derived, see SceneStrip). */
  caption?: string;
  frontEdit?: FrontEditOverlay | null;
  onFrontAddVertex?: (ll: [number, number]) => void;
  onFrontFinish?: () => void;
  onFrontClose?: () => void;
  onFrontMoveHandle?: (index: number, ll: [number, number], record: boolean) => void;
  onFrontInsertHandle?: (index: number, ll: [number, number]) => void;
  onFrontSelectHandle?: (index: number | null) => void;
  onFrontPickCaptured?: (ll: [number, number]) => void;
}

export default function MapView(props: MapViewProps) {
  const { renderer, project, basemap, time, viewCamera, selection, tool, regionMode, renderVersion, showHud, frontEdit } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cursorInfo, setCursorInfo] = useState<string>("");
  const drag = useRef<{
    x: number;
    y: number;
    cam: Camera;
    proj: GeoProjection;
    moved: boolean;
    paint: boolean;
    button: number;
    handle: number | null;
  } | null>(null);
  const lastFrontClick = useRef(0);
  const W = project.map.width;
  const H = project.map.height;

  // ------------------------------------------------------------ render loop (coalesced)
  const pending = useRef(false);
  const latest = useRef({ time, viewCamera, selection, hover, showHud, crosshair: props.crosshair, frontEdit });
  latest.current = { time, viewCamera, selection, hover, showHud, crosshair: props.crosshair, frontEdit };
  const draw = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      const l = latest.current;
      try {
        renderer.render(ctx, canvas.width, canvas.height, l.time, {
          cameraOverride: l.viewCamera ?? undefined,
          selection: l.selection,
          hover: l.hover,
          editorOverlay: true,
          showHud: l.showHud,
          crosshair: l.crosshair ?? null,
          frontEdit: l.frontEdit ?? null,
        });
      } catch (e) {
        console.error("render error", e);
      }
    });
  }, [renderer]);

  useEffect(() => {
    draw();
  }, [draw, project, time, viewCamera, selection, hover, basemap, renderVersion, showHud, props.crosshair, frontEdit]);

  useEffect(() => {
    renderer.onNeedsRedraw = draw;
    return () => {
      renderer.onNeedsRedraw = null;
    };
  }, [renderer, draw]);

  // make sure web fonts and flag images are available to the canvas, then redraw
  const themeId = project.map.theme;
  useEffect(() => {
    let alive = true;
    preloadFonts([renderer.theme.labelFont, renderer.theme.hudFont]).then(() => alive && draw());
    return () => {
      alive = false;
    };
  }, [themeId, renderer, draw]);
  const flagSig = JSON.stringify(project.nations.map((n) => n.flag).concat(project.events.flatMap((e) => (e.type === "flags" ? [e.leftFaction, e.rightFaction] : e.type === "nationChange" ? [e.flag] : []))));
  useEffect(() => {
    let alive = true;
    preloadFlags(JSON.parse(flagSig)).then(() => alive && draw());
    return () => {
      alive = false;
    };
  }, [flagSig, draw]);

  // ------------------------------------------------------------ helpers
  const toCanvas = (e: React.PointerEvent | React.WheelEvent): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  };

  const currentCamera = (): Camera => viewCamera ?? renderer.getState(time).camera;

  const regionAt = (x: number, y: number): { ll: [number, number] | null; region: RegionFeature | null } => {
    const ll = renderer.screenToLonLat(x, y);
    if (!ll || !basemap) return { ll, region: null };
    return { ll, region: hitTest(basemap, ll[0], ll[1], regionMode) };
  };

  const hitFrontHandle = (x: number, y: number): number | null => {
    const handles = frontEdit?.handles;
    const proj = renderer.projection;
    if (!handles?.length || !proj) return null;
    let best = -1;
    let bestD = 12;
    handles.forEach((h, i) => {
      const p = proj(h);
      if (!p) return;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? best : null;
  };

  const hitFrontSegment = (x: number, y: number): { index: number; ll: [number, number] } | null => {
    const handles = frontEdit?.handles;
    const proj = renderer.projection;
    if (!handles || handles.length < 2 || !proj) return null;
    const n = handles.length;
    const closed = !!frontEdit?.closed;
    const segs = closed ? n : n - 1;
    let best: { index: number; dist: number; closest: [number, number] } | null = null;
    for (let i = 0; i < segs; i++) {
      const a = proj(handles[i]);
      const b = proj(handles[(i + 1) % n]);
      if (!a || !b) continue;
      const hit = distPointToSegment([x, y], [a[0], a[1]], [b[0], b[1]]);
      if (hit.dist < 8 && (!best || hit.dist < best.dist)) best = { index: i + 1, dist: hit.dist, closest: hit.closest };
    }
    if (!best) return null;
    const ll = renderer.screenToLonLat(best.closest[0], best.closest[1]);
    return ll ? { index: best.index, ll } : null;
  };

  // ------------------------------------------------------------ pointer events
  const onPointerDown = (e: React.PointerEvent) => {
    const [x, y] = toCanvas(e);
    const cam = currentCamera();
    const proj = applyCamera(createProjection(project.map.projection), project.map.projection, cam, W, H, project.map.precision ?? 0.7);
    const paint = tool === "select" && e.shiftKey && e.button === 0;
    let handle: number | null = null;
    if (tool === "front" && e.button === 0) handle = hitFrontHandle(x, y);
    drag.current = { x, y, cam, proj, moved: false, paint, button: e.button, handle };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (paint) {
      const { region } = regionAt(x, y);
      if (region) {
        const next = new Set(selection);
        next.add(region.id);
        props.onSelectionChange(next);
      }
    }
    if (handle != null) props.onFrontSelectHandle?.(handle);
  };

  const lastHover = useRef(0);
  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = toCanvas(e);
    const d = drag.current;
    if (d) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.paint) {
        const { region } = regionAt(x, y);
        if (region && !selection.has(region.id)) {
          const next = new Set(selection);
          next.add(region.id);
          props.onSelectionChange(next);
        }
        return;
      }
      if (d.handle != null && d.moved) {
        const ll = renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveHandle?.(d.handle, [+ll[0].toFixed(4), +ll[1].toFixed(4)], false);
        return;
      }
      if (tool === "front" && (frontEdit?.draft || d.handle != null)) return;
      if (!d.moved) return;
      // pan: the point that was under the center should move by (dx, dy)
      const inv = d.proj.invert?.([W / 2 - dx, H / 2 - dy]);
      if (inv && Number.isFinite(inv[0]) && Number.isFinite(inv[1])) {
        props.onViewCamera({ ...d.cam, lon: ((inv[0] + 540) % 360) - 180, lat: Math.max(-89, Math.min(89, inv[1])) });
      }
      return;
    }
    const now = performance.now();
    if (now - lastHover.current < 40) return;
    lastHover.current = now;
    const { ll, region } = regionAt(x, y);
    setHover(tool === "front" ? null : region ? region.id : null);
    setCursorInfo(ll ? `${ll[1].toFixed(2)}°, ${ll[0].toFixed(2)}°${region && tool !== "front" ? ` · ${regionName(basemap, region.id)}` : ""}` : "");
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const [x, y] = toCanvas(e);
    if (d.handle != null) {
      if (d.moved) {
        const ll = renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveHandle?.(d.handle, [+ll[0].toFixed(4), +ll[1].toFixed(4)], true);
      }
      return;
    }
    if (d.moved || d.paint) return;
    if (d.button !== 0) return;
    const { ll, region } = regionAt(x, y);
    if (tool === "front") {
      if (!ll) return;
      const now = performance.now();
      const dbl = now - lastFrontClick.current < 320;
      lastFrontClick.current = now;
      if (dbl && (frontEdit?.draft || (frontEdit?.handles.length ?? 0) >= 2)) {
        props.onFrontFinish?.();
        return;
      }
      if (frontEdit?.draft && frontEdit.handles.length >= 3) {
        const first = renderer.projection?.(frontEdit.handles[0]);
        if (first && Math.hypot(first[0] - x, first[1] - y) < 14) {
          props.onFrontClose?.();
          return;
        }
      }
      if (!frontEdit?.draft) {
        const handle = hitFrontHandle(x, y);
        if (handle != null) {
          props.onFrontSelectHandle?.(handle);
          return;
        }
        const seg = hitFrontSegment(x, y);
        if (seg) {
          props.onFrontInsertHandle?.(seg.index, [+seg.ll[0].toFixed(4), +seg.ll[1].toFixed(4)]);
          return;
        }
        if (frontEdit?.pickCaptured && frontEdit.handles.length >= 2 && !frontEdit.draft) {
          props.onFrontPickCaptured?.([+ll[0].toFixed(4), +ll[1].toFixed(4)]);
          return;
        }
      }
      props.onFrontAddVertex?.([+ll[0].toFixed(4), +ll[1].toFixed(4)]);
      return;
    }
    if (tool === "select") {
      if (!region) {
        if (!e.ctrlKey && !e.metaKey) props.onSelectionChange(new Set());
        return;
      }
      const next = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(selection) : new Set<string>();
      if ((e.ctrlKey || e.metaKey) && next.has(region.id)) next.delete(region.id);
      else next.add(region.id);
      props.onSelectionChange(next);
    } else if ((tool === "marker" || tool === "pick") && ll) {
      props.onMapClick(ll, region);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const [x, y] = toCanvas(e);
    const cam = currentCamera();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const newScale = Math.max(40, Math.min(200000, cam.scale * factor));
    const projA = applyCamera(createProjection(project.map.projection), project.map.projection, cam, W, H, 0.7);
    const under = projA.invert?.([x, y]);
    let next: Camera = { ...cam, scale: newScale };
    if (under && Number.isFinite(under[0]) && Number.isFinite(under[1])) {
      const projB = applyCamera(createProjection(project.map.projection), project.map.projection, next, W, H, 0.7);
      const p = projB(under);
      if (p) {
        const inv = projB.invert?.([W / 2 + (p[0] - x), H / 2 + (p[1] - y)]);
        if (inv && Number.isFinite(inv[0]) && Number.isFinite(inv[1])) next = { ...next, lon: ((inv[0] + 540) % 360) - 180, lat: Math.max(-89, Math.min(89, inv[1])) };
      }
    }
    props.onViewCamera(next);
  };

  // prevent page scroll on wheel
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const h = (ev: WheelEvent) => ev.preventDefault();
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, []);

  const cursor = tool === "pan" ? "grab" : tool === "marker" || tool === "pick" || tool === "front" ? "crosshair" : "default";

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-wf-void p-4">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ cursor, maxWidth: "100%", maxHeight: "100%", aspectRatio: `${W} / ${H}` }}
        className="block h-auto w-auto select-none rounded-wf-sm shadow-2xl shadow-black/70 ring-1 ring-wf-line"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          setCursorInfo("");
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Stage overlays. Deliberately on the stage surround, never on the canvas:
          anything drawn over the canvas would be mistaken for part of the video. */}
      <Corner className="top-2 left-3">{project.name}</Corner>
      <Corner className="top-2 right-3">
        <span className="tnum">
          {W} × {H}
        </span>
        <span className="text-wf-text-5">·</span>
        {/* Frame rate is chosen at export time, not stored on the document. */}
        <span className="tnum">{project.duration}s</span>
      </Corner>
      {props.caption && (
        <Corner className="bottom-2 left-3 max-w-[45%]">
          <span className="truncate">{props.caption}</span>
        </Corner>
      )}
      <Corner className="right-3 bottom-2">
        <span className="tnum">{cursorInfo || "—"}</span>
      </Corner>
    </div>
  );
}

function Corner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-none absolute flex items-center gap-1.5 text-wf-xs font-semibold tracking-[0.06em] text-wf-text-4 uppercase ${className ?? ""}`}>
      {children}
    </div>
  );
}
