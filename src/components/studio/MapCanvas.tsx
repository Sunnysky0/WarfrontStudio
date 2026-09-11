"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/store/studio";
import { FrameRenderer, type LayerData } from "@/lib/render/renderer";
import { borderFile, ensureLayer, loadCities } from "@/lib/geo/basemap";
import { buildProjection } from "@/lib/geo/projections";
import { cameraAt } from "@/lib/interpolate";
import { dateAtTime, formatDate, formatClock } from "@/lib/time";
import { addLabel, addMarker, insertVertex, paintCountry, removeVertex, setCamera, setVertex } from "@/lib/edit";
import type { LonLat, Selection } from "@/lib/types";
import { finishDraft } from "./actions";

export const previewRenderer = new FrameRenderer();

type Drag =
  | { kind: "pan"; startX: number; startY: number; invert: (p: [number, number]) => LonLat | null; w: number; h: number }
  | { kind: "vertex"; sel: Selection; index: number }
  | { kind: "point"; sel: Selection; which?: "from" | "to" }
  | null;

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag>(null);
  const wheelStamp = useRef(0);
  const [size, setSize] = useState({ w: 960, h: 540, dpr: 1 });
  const [layersVersion, setLayersVersion] = useState(0);
  const [cursor, setCursor] = useState<LonLat | null>(null);
  const [hoverVertex, setHoverVertex] = useState<number | null>(null);
  const [fast, setFast] = useState(false);
  const fastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Render in fast mode for a short window after camera interaction, then re-render at full quality. */
  const touchCamera = useCallback(() => {
    setFast(true);
    if (fastTimer.current) clearTimeout(fastTimer.current);
    fastTimer.current = setTimeout(() => setFast(false), 350);
  }, []);

  const project = useStudio((s) => s.project);
  const time = useStudio((s) => s.time);
  const mode = useStudio((s) => s.mode);
  const selection = useStudio((s) => s.selection);
  const draft = useStudio((s) => s.draft);
  const hoverCountry = useStudio((s) => s.hoverCountry);
  const layersLoading = useStudio((s) => s.layersLoading);
  const statusMessage = useStudio((s) => s.statusMessage);
  const playing = useStudio((s) => s.playing);

  const gran = project?.map.granularity;
  const year = project?.map.bordersYear;
  const layerToggles = project?.map.layers;
  const toggleKey = layerToggles ? JSON.stringify(layerToggles) : "";

  // ---- responsive canvas size (fit video aspect ratio) ----
  const videoW = project?.video.width ?? 1920;
  const videoH = project?.video.height ?? 1080;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const aspect = videoW / videoH;
      let w = rect.width - 16;
      let h = w / aspect;
      if (h > rect.height - 16) {
        h = rect.height - 16;
        w = h * aspect;
      }
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      setSize((prev) => {
        const next = { w: Math.max(200, Math.floor(w)), h: Math.max(120, Math.floor(h)), dpr };
        return prev.w === next.w && prev.h === next.h && prev.dpr === next.dpr ? prev : next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [videoW, videoH]);

  // ---- load base map layers (keyed by granularity / year / toggles only, not by every edit) ----
  useEffect(() => {
    if (!gran || !year || !toggleKey) return;
    const toggles = JSON.parse(toggleKey) as NonNullable<typeof layerToggles>;
    let cancelled = false;
    useStudio.getState().setLayersLoading(true);
    const wanted: Record<string, string | null> = {
      land: "land",
      lakes: toggles.lakes ? "lakes" : null,
      rivers: toggles.rivers ? "rivers" : null,
      railroads: toggles.railroads ? "railroads" : null,
      provinces: toggles.provinces ? "provinces" : null,
      borders: borderFile(year),
    };
    (async () => {
      try {
        const entries = await Promise.all(
          Object.entries(wanted).map(async ([k, file]) => [k, file ? await ensureLayer(file, gran) : undefined] as const),
        );
        const cities = toggles.cities ? await loadCities() : undefined;
        if (cancelled) return;
        const data: LayerData = { cities };
        for (const [k, layer] of entries) (data as Record<string, unknown>)[k] = layer;
        previewRenderer.setLayers(data);
        setLayersVersion((v) => v + 1);
      } catch (e) {
        useStudio.getState().setStatus(`Failed to load map layers: ${(e as Error).message}`);
      } finally {
        if (!cancelled) useStudio.getState().setLayersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gran, year, toggleKey]);

  // ---- render ----
  const W = Math.round(size.w * size.dpr);
  const H = Math.round(size.h * size.dpr);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    previewRenderer.render(ctx, project, time, {
      width: W,
      height: H,
      fast,
      editor: playing ? undefined : { selection, hoverCountry: mode === "paint" ? hoverCountry : null, draft, draftClosed: mode === "drawZone", showHandles: mode === "select", hoverVertex },
    });
  }, [project, time, W, H, selection, hoverCountry, draft, mode, layersVersion, hoverVertex, playing, fast]);

  const toCanvas = useCallback(
    (e: React.MouseEvent): [number, number] => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
    },
    [W, H],
  );

  const invert = useCallback((pt: [number, number]): LonLat | null => {
    const proj = previewRenderer.lastProjection;
    if (!proj?.invert) return null;
    const ll = proj.invert(pt);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
    const back = proj(ll);
    if (!back || Math.hypot(back[0] - pt[0], back[1] - pt[1]) > 3) return null;
    return [+ll[0].toFixed(4), +ll[1].toFixed(4)];
  }, []);

  const dateMs = useMemo(() => (project ? dateAtTime(project, time) : 0), [project, time]);

  // ---- wheel zoom (around cursor) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useStudio.getState();
      const p = s.project;
      if (!p) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W;
      const my = ((e.clientY - rect.top) / rect.height) * H;
      const ms = dateAtTime(p, s.time);
      const cam = cameraAt(p.camera.keyframes, ms);
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.max(0.3, Math.min(400, cam.zoom * factor));
      const oldProj = buildProjection(p.map.projection, W, H, cam);
      const under = oldProj.invert?.([mx, my]);
      let center = cam.center;
      if (under && isFinite(under[0]) && isFinite(under[1])) {
        const newProj = buildProjection(p.map.projection, W, H, { ...cam, zoom: newZoom });
        const q = newProj(under);
        if (q) {
          const c = newProj.invert?.([W / 2 - (mx - q[0]), H / 2 - (my - q[1])]);
          if (c && isFinite(c[0]) && isFinite(c[1])) center = [c[0], Math.max(-89, Math.min(89, c[1]))];
        }
      }
      const now = performance.now();
      if (now - wheelStamp.current > 600) s.snapshot();
      wheelStamp.current = now;
      touchCamera();
      s.update((pp) => setCamera(pp, { center, zoom: newZoom, roll: cam.roll }, ms), { transient: true });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [W, H, touchCamera]);

  // ---- mouse handlers ----
  const onMouseDown = (e: React.MouseEvent) => {
    if (!project) return;
    const s = useStudio.getState();
    const pt = toCanvas(e);
    const ll = invert(pt);
    const ms = dateMs;
    const startPan = () => {
      const proj = previewRenderer.lastProjection;
      if (!proj?.invert) return;
      s.snapshot();
      dragRef.current = { kind: "pan", startX: pt[0], startY: pt[1], invert: (q) => (proj.invert!(q) as LonLat) ?? null, w: W, h: H };
    };
    if (e.button === 1 || (e.button === 0 && (mode === "navigate" || e.altKey))) {
      startPan();
      return;
    }
    if (e.button !== 0) return;
    const sc = H / 1080;
    switch (mode) {
      case "select": {
        const hit = previewRenderer.hitTest(project, ms, pt[0], pt[1], sc, selection);
        if (!hit) {
          s.select(null);
          startPan();
          return;
        }
        const sel: Selection = { type: hit.type, id: hit.id };
        if ((hit.type === "zone" || hit.type === "line") && hit.vertex !== undefined) {
          if (e.shiftKey) {
            s.update((p) => removeVertex(p, sel, hit.vertex!, ms));
            return;
          }
          s.snapshot();
          s.select(sel);
          dragRef.current = { kind: "vertex", sel, index: hit.vertex };
          return;
        }
        if ((hit.type === "zone" || hit.type === "line") && hit.segment !== undefined && ll) {
          s.snapshot();
          s.update((p) => insertVertex(p, sel, hit.segment!, ll, ms), { transient: true });
          s.select(sel);
          dragRef.current = { kind: "vertex", sel, index: hit.segment };
          return;
        }
        s.select(sel);
        if (hit.type === "marker" || hit.type === "label") {
          s.snapshot();
          dragRef.current = { kind: "point", sel };
        } else if (hit.type === "arrow" && hit.vertex !== undefined) {
          s.snapshot();
          dragRef.current = { kind: "point", sel, which: hit.vertex === 0 ? "from" : "to" };
        }
        return;
      }
      case "paint": {
        const ctx = canvasRef.current!.getContext("2d")!;
        const f = previewRenderer.countryAt(ctx, pt[0], pt[1]);
        if (!f) return;
        const name = String(f.props.NAME ?? "");
        if (!name) return;
        const faction = e.shiftKey ? null : s.activeFactionId;
        s.update((p) => paintCountry(p, name, faction, ms));
        s.setStatus(faction ? `${name} joins ${project.factions.find((x) => x.id === faction)?.name ?? "faction"} from ${formatDate(ms, "D MMM YYYY")}` : `${name} becomes neutral from ${formatDate(ms, "D MMM YYYY")}`);
        return;
      }
      case "drawZone":
      case "drawLine": {
        if (!ll) return;
        const d = s.draft;
        if (mode === "drawZone" && d.length >= 3) {
          const first = previewRenderer.lastProjection!(d[0]);
          if (first && Math.hypot(first[0] - pt[0], first[1] - pt[1]) < 10) {
            finishDraft();
            return;
          }
        }
        s.setDraft([...d, ll]);
        return;
      }
      case "drawArrow": {
        if (!ll) return;
        const d = s.draft;
        if (d.length === 0) s.setDraft([ll]);
        else {
          s.setDraft([d[0], ll]);
          setTimeout(finishDraft, 0);
        }
        return;
      }
      case "placeMarker": {
        if (!ll) return;
        let created = "";
        s.update((p) => {
          created = addMarker(p, ll, ms).id;
        });
        s.select({ type: "marker", id: created });
        s.setMode("select");
        return;
      }
      case "placeLabel": {
        if (!ll) return;
        let created = "";
        s.update((p) => {
          created = addLabel(p, ll, ms).id;
        });
        s.select({ type: "label", id: created });
        s.setMode("select");
        return;
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!project) return;
    const s = useStudio.getState();
    const pt = toCanvas(e);
    const ll = invert(pt);
    setCursor(ll);
    const drag = dragRef.current;
    const ms = dateMs;
    if (drag?.kind === "pan") {
      const dx = pt[0] - drag.startX;
      const dy = pt[1] - drag.startY;
      const c = drag.invert([drag.w / 2 - dx, drag.h / 2 - dy]);
      if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
      const cam = cameraAt(project.camera.keyframes, ms);
      touchCamera();
      s.update((p) => setCamera(p, { center: [c[0], Math.max(-89, Math.min(89, c[1]))], zoom: cam.zoom, roll: cam.roll }, ms), { transient: true });
      return;
    }
    if (drag?.kind === "vertex" && ll) {
      s.update((p) => setVertex(p, drag.sel, drag.index, ll, ms), { transient: true });
      return;
    }
    if (drag?.kind === "point" && ll) {
      s.update(
        (p) => {
          if (drag.sel.type === "marker") {
            const m = p.markers.find((x) => x.id === drag.sel.id);
            if (m) m.position = ll;
          } else if (drag.sel.type === "label") {
            const l = p.labels.find((x) => x.id === drag.sel.id);
            if (l) l.position = ll;
          } else if (drag.sel.type === "arrow") {
            const a = p.arrows.find((x) => x.id === drag.sel.id);
            if (a) {
              if (drag.which === "from") a.from = ll;
              else a.to = ll;
            }
          }
        },
        { transient: true },
      );
      return;
    }
    if (mode === "paint") {
      const ctx = canvasRef.current!.getContext("2d")!;
      const f = previewRenderer.countryAt(ctx, pt[0], pt[1]);
      const name = f ? String(f.props.NAME ?? "") : null;
      if (name !== s.hoverCountry) s.setHoverCountry(name || null);
    } else if (mode === "select" && selection && (selection.type === "zone" || selection.type === "line")) {
      const hit = previewRenderer.hitTest(project, ms, pt[0], pt[1], H / 1080, selection);
      const hv = hit && hit.id === selection.id && hit.vertex !== undefined ? hit.vertex : null;
      if (hv !== hoverVertex) setHoverVertex(hv);
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
  };

  const onDoubleClick = () => {
    if (mode === "drawZone" || mode === "drawLine") {
      const s = useStudio.getState();
      // remove the duplicate point added by the second click of the double-click
      if (s.draft.length > 1) s.setDraft(s.draft.slice(0, -1));
      finishDraft();
    }
  };

  const cursorCls =
    mode === "navigate" ? "cursor-grab active:cursor-grabbing" : mode === "paint" ? "cursor-cell" : mode === "select" ? "cursor-default" : "cursor-crosshair";

  const hint: Record<string, string> = {
    navigate: "Drag to pan · scroll to zoom · edits the active camera keyframe",
    select: "Click to select · drag vertices/handles · click an edge midpoint to insert · shift-click a vertex to delete · drag empty space to pan",
    paint: "Click a country to assign it to the active faction from the current date · shift-click to make it neutral",
    drawZone: "Click to add vertices · click the first vertex or double-click / Enter to close the zone · Esc to cancel",
    drawLine: "Click to add vertices · double-click / Enter to finish the front line · Esc to cancel",
    drawArrow: "Click the start point, then the end point",
    placeMarker: "Click on the map to place a marker",
    placeLabel: "Click on the map to place a label",
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0b1020] p-2">
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className={`rounded shadow-2xl shadow-black/60 ${cursorCls}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        />
        {layersLoading && (
          <div className="pointer-events-none absolute left-4 top-4 rounded bg-slate-900/80 px-3 py-1.5 text-xs text-sky-200 shadow">
            Loading map layers ({gran})…
          </div>
        )}
        {!project && <div className="text-slate-400">Loading project…</div>}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-900 px-3 py-1 text-[11px] text-slate-400">
        <span className="font-mono text-slate-200">{project ? `${formatDate(dateMs, "D MMM YYYY")} ${formatClock(dateMs)}` : ""}</span>
        <span className="font-mono">{cursor ? `${cursor[1].toFixed(2)}°, ${cursor[0].toFixed(2)}°` : "—"}</span>
        {mode === "paint" && hoverCountry && <span className="text-amber-300">{hoverCountry}</span>}
        <span className="truncate">{statusMessage || hint[mode]}</span>
      </div>
    </div>
  );
}
