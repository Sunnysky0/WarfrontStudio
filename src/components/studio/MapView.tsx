"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoProjection } from "d3-geo";
import type { Basemap, RegionFeature } from "@/lib/studio/basemap";
import { hitTest, regionName } from "@/lib/studio/basemap";
import type { FrontEditOverlay, MapRenderer } from "@/lib/studio/renderer";
import type { Camera, FrontBezierPath, ProjectDoc } from "@/lib/studio/types";
import { applyCamera, createProjection } from "@/lib/studio/projections";
import { preloadFonts, preloadFlags } from "@/lib/studio/drawing";
import { distPointToSegment } from "@/lib/studio/frontline";
import { fitBezierPath, lonDelta, stabilizeSamples, type FrontPathSample, type ScreenPoint } from "@/lib/studio/front-path";

export type Tool = "select" | "pan" | "marker" | "pick" | "front";
export type FrontToolMode = "freehand" | "pen" | "edit";
export type FrontFitPrecision = "exact" | "balanced" | "smooth";

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
  caption?: string;
  frontMode: FrontToolMode;
  frontStabilization: number;
  frontTolerance: number;
  frontCancelVersion: number;
  frontEdit?: FrontEditOverlay | null;
  onFrontCommitPath?: (path: FrontBezierPath, closed: boolean) => void;
  onFrontAddPenNode?: (anchor: [number, number], handle?: [number, number]) => void;
  onFrontFinish?: () => void;
  onFrontClose?: () => void;
  onFrontMoveNode?: (index: number, ll: [number, number], record: boolean) => void;
  onFrontMoveControl?: (index: number, side: "in" | "out", ll: [number, number], record: boolean, breakLink: boolean) => void;
  onFrontInsertNode?: (segment: number, t: number) => void;
  onFrontToggleNode?: (index: number) => void;
  onFrontSelectHandle?: (index: number | null) => void;
  onFrontSelectControl?: (control: { index: number; side: "in" | "out" } | null) => void;
  onFrontPickCaptured?: (ll: [number, number]) => void;
  onFrontGestureChange?: (active: boolean) => void;
  onFrontGestureCancel?: () => void;
}

type DragKind = "default" | "node" | "control" | "freehand" | "pen";

interface DragState {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  cam: Camera;
  proj: GeoProjection;
  moved: boolean;
  paint: boolean;
  button: number;
  pointerId: number;
  kind: DragKind;
  index?: number;
  side?: "in" | "out";
  startLL?: [number, number];
}

function cubicPoint(path: FrontBezierPath, segment: number, t: number): [number, number] {
  const a = path.nodes[segment];
  const b = path.nodes[(segment + 1) % path.nodes.length];
  const bLon = a.anchor[0] + lonDelta(a.anchor[0], b.anchor[0]);
  const p0: [number, number] = a.anchor;
  const p1: [number, number] = [a.anchor[0] + (a.out?.[0] ?? 0), a.anchor[1] + (a.out?.[1] ?? 0)];
  const p2: [number, number] = [bLon + (b.in?.[0] ?? 0), b.anchor[1] + (b.in?.[1] ?? 0)];
  const p3: [number, number] = [bLon, b.anchor[1]];
  const mt = 1 - t;
  return [
    mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
    mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
  ];
}

export default function MapView(props: MapViewProps) {
  const { renderer, project, basemap, time, viewCamera, selection, tool, regionMode, renderVersion, showHud, frontEdit, frontCancelVersion, onFrontGestureChange, onFrontGestureCancel } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [cursorInfo, setCursorInfo] = useState<string>("");
  const [freehandScreen, setFreehandScreen] = useState<ScreenPoint[]>([]);
  const freehandSamples = useRef<FrontPathSample[]>([]);
  const freehandBlocked = useRef(false);
  const freehandRaf = useRef(0);
  const drag = useRef<DragState | null>(null);
  const lastFrontClick = useRef(0);
  const W = project.map.width;
  const H = project.map.height;
  const effectiveFrontEdit = useMemo(() => {
    if (!freehandScreen.length) return frontEdit;
    return { ...(frontEdit ?? { handles: [] }), draft: true, screenLine: freehandScreen } satisfies FrontEditOverlay;
  }, [freehandScreen, frontEdit]);

  const pending = useRef(false);
  const latest = useRef({ time, viewCamera, selection, hover, showHud, crosshair: props.crosshair, frontEdit: effectiveFrontEdit });
  useEffect(() => {
    latest.current = { time, viewCamera, selection, hover, showHud, crosshair: props.crosshair, frontEdit: effectiveFrontEdit };
  }, [effectiveFrontEdit, hover, props.crosshair, selection, showHud, time, viewCamera]);
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
  }, [draw, project, time, viewCamera, selection, hover, basemap, renderVersion, showHud, props.crosshair, effectiveFrontEdit]);
  useEffect(() => {
    renderer.setOnNeedsRedraw(draw);
    return () => {
      renderer.setOnNeedsRedraw(null);
    };
  }, [renderer, draw]);
  useEffect(() => () => cancelAnimationFrame(freehandRaf.current), []);
  useEffect(() => {
    if (!frontCancelVersion) return;
    const current = drag.current;
    drag.current = null;
    freehandSamples.current = [];
    freehandBlocked.current = false;
    cancelAnimationFrame(freehandRaf.current);
    const clearFrame = requestAnimationFrame(() => setFreehandScreen([]));
    const canvas = canvasRef.current;
    if (current && canvas?.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    onFrontGestureChange?.(false);
    onFrontGestureCancel?.();
    return () => cancelAnimationFrame(clearFrame);
  }, [frontCancelVersion, onFrontGestureCancel, onFrontGestureChange]);

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

  const clientToCanvas = (clientX: number, clientY: number): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((clientX - r.left) * c.width) / r.width, ((clientY - r.top) * c.height) / r.height];
  };
  const toCanvas = (e: React.PointerEvent | React.WheelEvent): [number, number] => clientToCanvas(e.clientX, e.clientY);
  const currentCamera = (): Camera => viewCamera ?? renderer.getState(time).camera;
  const regionAt = (x: number, y: number): { ll: [number, number] | null; region: RegionFeature | null } => {
    const ll = renderer.screenToLonLat(x, y);
    if (!ll || !basemap) return { ll, region: null };
    return { ll, region: hitTest(basemap, ll[0], ll[1], regionMode) };
  };
  const projectPoint = (point: [number, number]): [number, number] | null => {
    const p = renderer.projection?.(point);
    return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null;
  };
  const constrainedLonLat = (anchor: [number, number], x: number, y: number, constrained: boolean): [number, number] | null => {
    if (!constrained) return renderer.screenToLonLat(x, y);
    const origin = projectPoint(anchor);
    if (!origin) return renderer.screenToLonLat(x, y);
    const dx = x - origin[0];
    const dy = y - origin[1];
    const distance = Math.hypot(dx, dy);
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return renderer.screenToLonLat(origin[0] + Math.cos(angle) * distance, origin[1] + Math.sin(angle) * distance);
  };

  const hitFrontNode = (x: number, y: number): number | null => {
    const anchors = frontEdit?.path?.nodes.map((node) => node.anchor) ?? frontEdit?.handles;
    if (!anchors?.length) return null;
    let best = -1;
    let bestD = 12;
    anchors.forEach((anchor, i) => {
      const p = projectPoint(anchor);
      if (!p) return;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? best : null;
  };

  const hitFrontControl = (x: number, y: number): { index: number; side: "in" | "out" } | null => {
    const path = frontEdit?.path;
    const index = frontEdit?.selectedHandle;
    if (!path || index == null) return null;
    const node = path.nodes[index];
    if (!node) return null;
    for (const side of ["in", "out"] as const) {
      const v = node[side];
      if (!v) continue;
      const p = projectPoint([node.anchor[0] + v[0], node.anchor[1] + v[1]]);
      if (p && Math.hypot(p[0] - x, p[1] - y) < 10) return { index, side };
    }
    return null;
  };

  const hitFrontCurve = (x: number, y: number): { segment: number; t: number } | null => {
    const path = frontEdit?.path;
    if (!path || path.nodes.length < 2) return null;
    const segments = frontEdit?.closed ? path.nodes.length : path.nodes.length - 1;
    let best: { segment: number; t: number; dist: number } | null = null;
    for (let segment = 0; segment < segments; segment++) {
      const samples: { point: [number, number] | null; t: number }[] = [];
      const append = (t0: number, p0: [number, number] | null, t1: number, p1: [number, number] | null, depth: number) => {
        const tm = (t0 + t1) / 2;
        const pm = projectPoint(cubicPoint(path, segment, tm));
        const flat = p0 && p1 && pm ? distPointToSegment(pm, p0, p1).dist <= 0.5 : false;
        if (depth >= 10 || flat || (!p0 && !p1 && !pm && depth >= 4)) {
          samples.push({ point: p1, t: t1 });
          return;
        }
        append(t0, p0, tm, pm, depth + 1);
        append(tm, pm, t1, p1, depth + 1);
      };
      const start = projectPoint(cubicPoint(path, segment, 0));
      samples.push({ point: start, t: 0 });
      append(0, start, 1, projectPoint(cubicPoint(path, segment, 1)), 0);
      for (let i = 1; i < samples.length; i++) {
        const previous = samples[i - 1];
        const current = samples[i];
        if (previous.point && current.point) {
          const hit = distPointToSegment([x, y], previous.point, current.point);
          const t = previous.t + (current.t - previous.t) * hit.t;
          if (hit.dist < 9 && (!best || hit.dist < best.dist)) best = { segment, t, dist: hit.dist };
        }
      }
    }
    return best ? { segment: best.segment, t: best.t } : null;
  };

  const scheduleFreehandPreview = () => {
    cancelAnimationFrame(freehandRaf.current);
    freehandRaf.current = requestAnimationFrame(() => {
      const scale = H / 1080;
      setFreehandScreen(freehandSamples.current.map((sample) => [sample.screen[0] * scale, sample.screen[1] * scale]));
    });
  };
  const appendFreehandPoint = (clientX: number, clientY: number) => {
    const [x, y] = clientToCanvas(clientX, clientY);
    const ll = renderer.screenToLonLat(x, y);
    if (!ll) {
      if (freehandSamples.current.length) freehandBlocked.current = true;
      return;
    }
    if (freehandBlocked.current) return;
    const scale = 1080 / H;
    const sample: FrontPathSample = { screen: [x * scale, y * scale], geo: [ll[0], ll[1]] };
    const last = freehandSamples.current[freehandSamples.current.length - 1];
    if (last && Math.hypot(sample.screen[0] - last.screen[0], sample.screen[1] - last.screen[1]) < 0.25) return;
    freehandSamples.current.push(sample);
    scheduleFreehandPreview();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const [x, y] = toCanvas(e);
    const cam = currentCamera();
    const proj = applyCamera(createProjection(project.map.projection), project.map.projection, cam, W, H, project.map.precision ?? 0.7);
    const paint = tool === "select" && e.shiftKey && e.button === 0;
    let kind: DragKind = "default";
    let index: number | undefined;
    let side: "in" | "out" | undefined;
    let startLL: [number, number] | undefined;
    if (tool === "front" && e.button === 0) {
      if (props.frontMode === "freehand") {
        kind = "freehand";
        freehandSamples.current = [];
        freehandBlocked.current = false;
        setFreehandScreen([]);
        appendFreehandPoint(e.clientX, e.clientY);
      } else if (props.frontMode === "pen") {
        kind = "pen";
        startLL = renderer.screenToLonLat(x, y) ?? undefined;
      } else {
        const control = hitFrontControl(x, y);
        const node = control ? null : hitFrontNode(x, y);
        if (control) {
          kind = "control";
          index = control.index;
          side = control.side;
          props.onFrontSelectControl?.(control);
        } else if (node != null) {
          kind = "node";
          index = node;
          props.onFrontSelectHandle?.(node);
          props.onFrontSelectControl?.(null);
        }
      }
    }
    drag.current = { x, y, clientX: e.clientX, clientY: e.clientY, cam, proj, moved: false, paint, button: e.button, pointerId: e.pointerId, kind, index, side, startLL };
    if (kind !== "default") props.onFrontGestureChange?.(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (paint) {
      const { region } = regionAt(x, y);
      if (region) {
        const next = new Set(selection);
        next.add(region.id);
        props.onSelectionChange(next);
      }
    }
  };

  const lastHover = useRef(0);
  const onPointerMove = (e: React.PointerEvent) => {
    const [x, y] = toCanvas(e);
    const d = drag.current;
    if (d) {
      const dx = x - d.x;
      const dy = y - d.y;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.kind === "freehand") {
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        events.forEach((event) => appendFreehandPoint(event.clientX, event.clientY));
        return;
      }
      if (d.paint) {
        const { region } = regionAt(x, y);
        if (region && !selection.has(region.id)) {
          const next = new Set(selection);
          next.add(region.id);
          props.onSelectionChange(next);
        }
        return;
      }
      if (d.kind === "node" && d.index != null && d.moved) {
        const ll = renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveNode?.(d.index, ll, false);
        return;
      }
      if (d.kind === "control" && d.index != null && d.side && d.moved) {
        const anchor = frontEdit?.path?.nodes[d.index]?.anchor;
        const ll = anchor ? constrainedLonLat(anchor, x, y, e.shiftKey) : renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveControl?.(d.index, d.side, ll, false, e.altKey);
        return;
      }
      if (d.kind === "pen") return;
      if (!d.moved) return;
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
    if (d.kind !== "default") props.onFrontGestureChange?.(false);
    const [x, y] = toCanvas(e);
    if (d.kind === "freehand") {
      appendFreehandPoint(e.clientX, e.clientY);
      cancelAnimationFrame(freehandRaf.current);
      const stabilized = stabilizeSamples(freehandSamples.current, props.frontStabilization);
      const scale = 1080 / H;
      const path = fitBezierPath(
        stabilized,
        props.frontTolerance,
        ([sx, sy]) => renderer.screenToLonLat(sx / scale, sy / scale),
        2048,
        (point) => {
          const projected = renderer.projection?.(point);
          return projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1]) ? [projected[0] * scale, projected[1] * scale] : null;
        }
      );
      const closed = path != null && path.nodes.length >= 3 && Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) <= 12;
      freehandSamples.current = [];
      freehandBlocked.current = false;
      setFreehandScreen([]);
      if (path) props.onFrontCommitPath?.(path, closed);
      return;
    }
    if (d.kind === "node" && d.index != null) {
      if (d.moved) {
        const ll = renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveNode?.(d.index, ll, true);
      } else {
        const now = performance.now();
        const dbl = now - lastFrontClick.current < 320;
        lastFrontClick.current = now;
        if (dbl) props.onFrontToggleNode?.(d.index);
      }
      return;
    }
    if (d.kind === "control" && d.index != null && d.side) {
      if (d.moved) {
        const anchor = frontEdit?.path?.nodes[d.index]?.anchor;
        const ll = anchor ? constrainedLonLat(anchor, x, y, e.shiftKey) : renderer.screenToLonLat(x, y);
        if (ll) props.onFrontMoveControl?.(d.index, d.side, ll, true, e.altKey);
      }
      return;
    }
    if (d.kind === "pen") {
      const ll = d.startLL ? constrainedLonLat(d.startLL, x, y, e.shiftKey) : renderer.screenToLonLat(x, y);
      if (!d.startLL || !ll) return;
      const first = frontEdit?.path?.nodes[0]?.anchor ?? frontEdit?.handles[0];
      const firstScreen = first ? projectPoint(first) : null;
      if (firstScreen && (frontEdit?.path?.nodes.length ?? frontEdit?.handles.length ?? 0) >= 3 && Math.hypot(firstScreen[0] - x, firstScreen[1] - y) < 14) {
        props.onFrontClose?.();
        return;
      }
      const now = performance.now();
      const dbl = now - lastFrontClick.current < 320;
      lastFrontClick.current = now;
      if (dbl && (frontEdit?.path?.nodes.length ?? frontEdit?.handles.length ?? 0) >= 2) {
        props.onFrontFinish?.();
        return;
      }
      const handle: [number, number] | undefined = d.moved ? [lonDelta(d.startLL[0], ll[0]), ll[1] - d.startLL[1]] : undefined;
      props.onFrontAddPenNode?.(d.startLL, handle);
      return;
    }
    if (d.moved || d.paint || d.button !== 0) return;
    const { ll, region } = regionAt(x, y);
    if (tool === "front" && props.frontMode === "edit") {
      const now = performance.now();
      const dbl = now - lastFrontClick.current < 320;
      lastFrontClick.current = now;
      const curve = hitFrontCurve(x, y);
      if (dbl && curve) {
        props.onFrontInsertNode?.(curve.segment, curve.t);
        return;
      }
      if (frontEdit?.pickCaptured && ll) {
        props.onFrontPickCaptured?.(ll);
        return;
      }
      props.onFrontSelectHandle?.(null);
      props.onFrontSelectControl?.(null);
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
        onPointerCancel={() => {
          onFrontGestureChange?.(false);
          onFrontGestureCancel?.();
          drag.current = null;
          freehandSamples.current = [];
          freehandBlocked.current = false;
          setFreehandScreen([]);
        }}
        onPointerLeave={() => {
          setHover(null);
          setCursorInfo("");
        }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <Corner className="top-2 left-3">{project.name}</Corner>
      <Corner className="top-2 right-3">
        <span className="tnum">{W} × {H}</span>
        <span className="text-wf-text-5">·</span>
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
    <div className={`pointer-events-none absolute flex items-center gap-1.5 rounded-wf-sm border border-wf-line/80 bg-wf-bg/80 px-2 py-1 text-wf-sm text-wf-text-3 shadow-lg backdrop-blur-sm ${className ?? ""}`}>
      {children}
    </div>
  );
}
