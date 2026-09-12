"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadBasemap, type Basemap, type RegionFeature } from "@/lib/studio/basemap";
import { MapRenderer } from "@/lib/studio/renderer";
import type { Camera, EventType, FlagSpec, FrontMode, MapSettings, MarkerKind, Nation, ProjectDoc, StudioEvent } from "@/lib/studio/types";
import { uid } from "@/lib/studio/types";
import { MARKER_KINDS } from "@/lib/studio/drawing";
import MapView, { type Tool } from "./MapView";
import Timeline from "./Timeline";
import Inspector from "./Inspector";
import Panels, { type LeftTab } from "./Panels";
import ExportDialog from "./ExportDialog";
import { Button } from "./ui";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function Studio({ projectId, initial }: { projectId: string; initial: ProjectDoc }) {
  // ------------------------------------------------------------ document state + history
  const [project, setProjectRaw] = useState<ProjectDoc>(initial);
  const past = useRef<ProjectDoc[]>([]);
  const future = useRef<ProjectDoc[]>([]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const setProject = useCallback((updater: (p: ProjectDoc) => ProjectDoc, record = true) => {
    setProjectRaw((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      if (record) {
        past.current.push(prev);
        if (past.current.length > 80) past.current.shift();
        future.current = [];
      }
      return next;
    });
    setSaveState("dirty");
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(projectRef.current);
    setProjectRaw(prev);
    setSaveState("dirty");
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(projectRef.current);
    setProjectRaw(next);
    setSaveState("dirty");
  }, []);

  // ------------------------------------------------------------ editor state
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedNationId, setSelectedNationId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [regionMode, setRegionMode] = useState<"country" | "province">("country");
  const [markerKind, setMarkerKind] = useState<MarkerKind>("explosion");
  const [viewCamera, setViewCamera] = useState<Camera | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>("nations");
  const [showExport, setShowExport] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [basemapLoading, setBasemapLoading] = useState(true);
  const [basemapError, setBasemapError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const pickRef = useRef<((ll: [number, number]) => void) | null>(null);
  const prevToolRef = useRef<Tool>("select");

  const renderer = useMemo(() => new MapRenderer(initial), [initial]);
  renderer.setProject(project);

  // ------------------------------------------------------------ basemap loading
  useEffect(() => {
    let cancelled = false;
    setBasemapLoading(true);
    setBasemapError(null);
    loadBasemap(project.map.lod, project.map.borderYear)
      .then((bm) => {
        if (cancelled) return;
        renderer.setBasemap(bm);
        setBasemap(bm);
        setRenderVersion((v) => v + 1);
      })
      .catch((e) => !cancelled && setBasemapError((e as Error).message))
      .finally(() => !cancelled && setBasemapLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project.map.lod, project.map.borderYear, renderer]);

  // ------------------------------------------------------------ playback
  const timeRef = useRef(time);
  timeRef.current = time;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = timeRef.current + dt;
      if (next >= projectRef.current.duration) {
        setTime(projectRef.current.duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ------------------------------------------------------------ saving
  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: projectRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState("saved");
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
  }, [projectId]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(save, 4000);
    return () => clearTimeout(t);
  }, [saveState, project, save]);

  // ------------------------------------------------------------ derived
  const state = useMemo(() => renderer.getState(time), [renderer, time, project, basemap]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentCamera = viewCamera ?? state.camera;
  const selectedEvent = project.events.find((e) => e.id === selectedEventId) ?? null;
  const selectedNation = project.nations.find((n) => n.id === selectedNationId) ?? null;
  const ownedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of state.ownership.values()) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  }, [state]);

  // ------------------------------------------------------------ mutations
  const updateEvent = useCallback(
    (id: string, patch: Partial<StudioEvent>, record = true) => {
      setProject((p) => ({ ...p, events: p.events.map((e) => (e.id === id ? ({ ...e, ...patch } as StudioEvent) : e)) }), record);
    },
    [setProject]
  );
  const updateNation = useCallback(
    (id: string, patch: Partial<Nation>) => setProject((p) => ({ ...p, nations: p.nations.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
    [setProject]
  );
  const updateMap = useCallback((patch: Partial<MapSettings>) => setProject((p) => ({ ...p, map: { ...p.map, ...patch } })), [setProject]);

  const addEvent = useCallback(
    (type: EventType, extra: Partial<StudioEvent> = {}) => {
      const t = Math.round(timeRef.current * 10) / 10;
      const cam = { ...currentCamera };
      const nationId = selectedNationId ?? projectRef.current.nations[0]?.id ?? "";
      const base = { id: uid(type), start: t };
      let ev: StudioEvent;
      switch (type) {
        case "year":
          ev = { ...base, type, end: t + 1, text: String(new Date().getFullYear()) };
          break;
        case "camera":
          ev = { ...base, type, end: t + 3, camera: cam, easing: "easeInOut" };
          break;
        case "territory":
          ev = { ...base, type, end: t + 3, regions: Array.from(selection), toNation: nationId, mode: "auto", roughness: 0.6, easing: "easeInOut", showFrontline: true };
          break;
        case "nationChange":
          ev = { ...base, type, end: t + 2, nation: nationId };
          break;
        case "disintegrate":
          ev = { ...base, type, end: t + 3, from: nationId, parts: [], mode: "shatter", dissolveRemainder: true };
          break;
        case "subtitle":
          ev = { ...base, type, end: t + 4, text: "New subtitle" };
          break;
        case "text":
          ev = { ...base, type, end: t + 4, text: "MAP TEXT", pos: [cam.lon, cam.lat], size: 22 };
          break;
        case "marker":
          ev = { ...base, type, end: t + 4, kind: markerKind, pos: [cam.lon, cam.lat], size: 14, pulse: true };
          break;
        case "flags":
          ev = { ...base, type, end: t + 10, left: nationId ? [nationId] : [], right: [] };
          break;
        case "inset":
          ev = { ...base, type, end: t + 10, camera: cam, corner: "bottom-right", width: 0.3, height: 0.36 };
          break;
      }
      ev = { ...ev, ...extra } as StudioEvent;
      setProject((p) => ({ ...p, events: [...p.events, ev] }));
      setSelectedEventId(ev.id);
      setSelectedNationId(null);
      return ev;
    },
    [currentCamera, markerKind, selectedNationId, selection, setProject]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedEventId) return;
    setProject((p) => ({ ...p, events: p.events.filter((e) => e.id !== selectedEventId) }));
    setSelectedEventId(null);
  }, [selectedEventId, setProject]);

  const duplicateSelected = useCallback(() => {
    const ev = projectRef.current.events.find((e) => e.id === selectedEventId);
    if (!ev) return;
    const dur = ev.end - ev.start;
    const copy = { ...ev, id: uid(ev.type), start: ev.end, end: ev.end + dur } as StudioEvent;
    setProject((p) => ({ ...p, events: [...p.events, copy] }));
    setSelectedEventId(copy.id);
  }, [selectedEventId, setProject]);

  const addNation = useCallback(() => {
    const n: Nation = { id: uid("n"), name: `Nation ${projectRef.current.nations.length + 1}`, color: "#8b2635", regions: Array.from(selection) };
    setProject((p) => ({ ...p, nations: [...p.nations, n] }));
    setSelectedNationId(n.id);
    setSelectedEventId(null);
    setLeftTab("nations");
  }, [selection, setProject]);

  const deleteNation = useCallback(
    (id: string) => {
      if (!confirm("Delete this nation? Events referencing it stay on the timeline.")) return;
      setProject((p) => ({ ...p, nations: p.nations.filter((n) => n.id !== id) }));
      setSelectedNationId(null);
    },
    [setProject]
  );

  const assignSelection = useCallback(
    (nationId: string, mode: FrontMode, duration: number) => {
      addEvent("territory", { regions: Array.from(selection), toNation: nationId, mode, end: Math.round(timeRef.current * 10) / 10 + duration } as Partial<StudioEvent>);
      setSelection(new Set());
    },
    [addEvent, selection]
  );

  const setKeyframeFromView = useCallback(() => {
    const t = Math.round(timeRef.current * 10) / 10;
    const cam = { ...currentCamera };
    if (t === 0) {
      updateMap({ defaultCamera: cam });
    } else {
      addEvent("camera", { start: Math.max(0, t - 3), end: t, camera: cam } as Partial<StudioEvent>);
    }
    setViewCamera(null);
  }, [addEvent, currentCamera, updateMap]);

  const startPick = useCallback(
    (cb: (ll: [number, number]) => void) => {
      pickRef.current = cb;
      prevToolRef.current = tool === "pick" ? "select" : tool;
      setTool("pick");
    },
    [tool]
  );

  const onMapClick = useCallback(
    (ll: [number, number], _region: RegionFeature | null) => {
      if (tool === "pick") {
        pickRef.current?.(ll);
        pickRef.current = null;
        setTool(prevToolRef.current);
      } else if (tool === "marker") {
        addEvent("marker", { pos: [+ll[0].toFixed(3), +ll[1].toFixed(3)], kind: markerKind } as Partial<StudioEvent>);
      }
    },
    [addEvent, markerKind, tool]
  );

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "ArrowRight") {
        setTime((t) => Math.min(projectRef.current.duration, t + (e.shiftKey ? 5 : 0.5)));
      } else if (e.key === "ArrowLeft") {
        setTime((t) => Math.max(0, t - (e.shiftKey ? 5 : 0.5)));
      } else if (e.key === "Home") {
        setTime(0);
      } else if (e.key === "Escape") {
        setSelection(new Set());
        if (tool === "pick") {
          pickRef.current = null;
          setTool(prevToolRef.current);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [deleteSelected, duplicateSelected, redo, save, tool, undo]);

  // ------------------------------------------------------------ layout
  const saveLabel = { saved: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Save failed – retry" }[saveState];
  const tabBtn = (id: LeftTab, label: string) => (
    <button key={id} onClick={() => setLeftTab(id)} className={`flex-1 py-1.5 text-[11px] font-medium ${leftTab === id ? "border-b-2 border-violet-500 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
      {label}
    </button>
  );
  const toolBtn = (id: Tool, label: string, title: string) => (
    <button key={id} title={title} onClick={() => setTool(id)} className={`rounded px-2 py-1 text-[11px] ${tool === id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
      {label}
    </button>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* header */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3">
        <Link href="/" className="text-xs text-zinc-400 hover:text-white">
          ← Projects
        </Link>
        <span className="text-sm font-semibold tracking-wide text-white">⚔ Warfront Animation Studio</span>
        <span className="truncate text-xs text-zinc-400">/ {project.name}</span>
        <span className={`ml-2 text-[10px] ${saveState === "error" ? "text-red-400" : saveState === "saved" ? "text-emerald-400" : "text-amber-300"}`}>{saveLabel}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button onClick={undo} title="Undo (Ctrl+Z)">
            ↶
          </Button>
          <Button onClick={redo} title="Redo (Ctrl+Y)">
            ↷
          </Button>
          <Button onClick={() => setShowHud((v) => !v)} title="Toggle HUD preview (year, flags, subtitles)">
            HUD {showHud ? "on" : "off"}
          </Button>
          <Button onClick={save} disabled={saveState === "saving"}>
            Save
          </Button>
          <Button variant="primary" onClick={() => setShowExport(true)} disabled={!basemap}>
            ⬇ Export video
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left panel */}
        <aside className="flex w-[290px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/70">
          <div className="flex border-b border-zinc-800">
            {tabBtn("nations", "Nations")}
            {tabBtn("map", "Map")}
            {tabBtn("assets", "Assets")}
            {tabBtn("help", "Help")}
          </div>
          <div className="min-h-0 flex-1">
            <Panels
              tab={leftTab}
              project={project}
              basemap={basemap}
              basemapLoading={basemapLoading}
              selectedNationId={selectedNationId}
              ownedBy={ownedBy}
              onSelectNation={(id) => {
                setSelectedNationId(id);
                if (id) setSelectedEventId(null);
              }}
              onAddNation={addNation}
              onUpdateMap={updateMap}
              onUpdateProject={(patch) => setProject((p) => ({ ...p, ...patch }))}
              currentCamera={currentCamera}
              onAddMarker={(kind) => {
                setMarkerKind(kind);
                addEvent("marker", { kind } as Partial<StudioEvent>);
              }}
              onApplyFlag={(spec: FlagSpec) => selectedNationId && updateNation(selectedNationId, { flag: spec })}
              onApplyColor={(color) => selectedNationId && updateNation(selectedNationId, { color })}
            />
          </div>
        </aside>

        {/* center */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-2 py-1">
            {toolBtn("select", "⬚ Select", "Select regions (click, shift+drag to paint)")}
            {toolBtn("pan", "✋ Pan", "Pan the map")}
            {toolBtn("marker", "◎ Marker", "Click on the map to drop a marker at the playhead")}
            {tool === "marker" && (
              <select value={markerKind} onChange={(e) => setMarkerKind(e.target.value as MarkerKind)} className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[11px]">
                {MARKER_KINDS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            {tool === "pick" && <span className="animate-pulse rounded bg-violet-900/60 px-2 py-0.5 text-[11px] text-violet-200">Click on the map to pick a point (Esc to cancel)</span>}
            <div className="mx-1 h-5 w-px bg-zinc-800" />
            <span className="text-[10px] text-zinc-500">Unit:</span>
            <button onClick={() => setRegionMode("country")} className={`rounded px-2 py-0.5 text-[11px] ${regionMode === "country" ? "bg-zinc-200 text-black" : "bg-zinc-800 text-zinc-300"}`}>
              Countries
            </button>
            <button onClick={() => setRegionMode("province")} className={`rounded px-2 py-0.5 text-[11px] ${regionMode === "province" ? "bg-zinc-200 text-black" : "bg-zinc-800 text-zinc-300"}`}>
              Provinces
            </button>
            <div className="mx-1 h-5 w-px bg-zinc-800" />
            <Button size="xs" variant="primary" onClick={setKeyframeFromView} title="Create a camera keyframe ending at the playhead with the current view">
              ⌖ Set camera keyframe from view
            </Button>
            {viewCamera && (
              <Button size="xs" onClick={() => setViewCamera(null)} title="Re-attach the preview to the timeline camera">
                ↩ Follow timeline camera
              </Button>
            )}
            <span className="ml-auto font-mono text-[10px] text-zinc-500">
              {currentCamera.lat.toFixed(2)}°, {currentCamera.lon.toFixed(2)}° · scale {currentCamera.scale.toFixed(0)} {viewCamera ? "(detached view)" : ""}
            </span>
          </div>
          <div className="relative min-h-0 flex-1">
            <MapView
              renderer={renderer}
              project={project}
              basemap={basemap}
              time={time}
              viewCamera={viewCamera}
              onViewCamera={setViewCamera}
              selection={selection}
              onSelectionChange={setSelection}
              tool={tool}
              regionMode={regionMode}
              onMapClick={onMapClick}
              renderVersion={renderVersion}
              showHud={showHud}
            />
            {basemapLoading && (
              <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                <span className="rounded bg-black/70 px-3 py-1 text-xs text-violet-200">Loading {project.map.lod} basemap ({project.map.borderYear})…</span>
              </div>
            )}
            {basemapError && (
              <div className="absolute inset-x-0 top-2 flex justify-center">
                <span className="rounded bg-red-950/90 px-3 py-1 text-xs text-red-200">Basemap failed to load: {basemapError}</span>
              </div>
            )}
          </div>
        </main>

        {/* right panel */}
        <aside className="w-[330px] shrink-0 border-l border-zinc-800 bg-zinc-900/70">
          <Inspector
            project={project}
            basemap={basemap}
            selectedEvent={selectedEvent}
            selectedNation={selectedNation}
            selection={selection}
            time={time}
            currentCamera={currentCamera}
            onUpdateEvent={(id, patch) => updateEvent(id, patch, true)}
            onUpdateNation={updateNation}
            onDeleteNation={deleteNation}
            onPick={startPick}
            onSelectionChange={setSelection}
            onAssignSelection={assignSelection}
            onSelectNation={setSelectedNationId}
          />
        </aside>
      </div>

      {/* timeline */}
      <div className="h-[270px] shrink-0">
        <Timeline
          project={project}
          time={time}
          playing={playing}
          selectedId={selectedEventId}
          onSelect={(id) => {
            setSelectedEventId(id);
            if (id) setSelectedNationId(null);
          }}
          onSeek={(t) => {
            setTime(t);
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
          onUpdateEvent={updateEvent}
          onAdd={(type) => addEvent(type)}
          onDuration={(d) => setProject((p) => ({ ...p, duration: d }))}
          onDeleteSelected={deleteSelected}
          onDuplicateSelected={duplicateSelected}
        />
      </div>

      {showExport && <ExportDialog project={project} basemap={basemap} time={time} onClose={() => setShowExport(false)} />}
    </div>
  );
}
