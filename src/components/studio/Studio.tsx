"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadBasemap, type Basemap, type RegionFeature } from "@/lib/studio/basemap";
import { MapRenderer } from "@/lib/studio/renderer";
import type { Camera, EventType, FlagSpec, FrontMode, MapSettings, MarkerKind, Nation, ProjectDoc, StudioEvent } from "@/lib/studio/types";
import { uid } from "@/lib/studio/types";
import MapView, { type Tool } from "./MapView";
import Timeline from "./Timeline";
import Inspector, { type PropsTab } from "./Inspector";
import Panels, { type LeftTab } from "./Panels";
import ExportDialog from "./ExportDialog";
import Header, { type SaveState } from "./chrome/Header";
import MenuBar from "./chrome/MenuBar";
import IconRail from "./chrome/IconRail";
import MapToolbar from "./chrome/MapToolbar";
import SceneStrip, { activeChapter } from "./chrome/SceneStrip";
import ViewBar from "./chrome/ViewBar";
import StatusBar from "./chrome/StatusBar";

/** Add/remove without mutating — these sets feed React state. */
function toggled<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

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
  const [showExport, setShowExport] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [basemapLoading, setBasemapLoading] = useState(true);
  const [basemapError, setBasemapError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const pickRef = useRef<((ll: [number, number]) => void) | null>(null);
  const prevToolRef = useRef<Tool>("select");

  // ------------------------------------------------------------ chrome state
  // Purely presentational: none of this is persisted to the document, so it can
  // never desync the preview from the export.
  const [leftTab, setLeftTab] = useState<LeftTab>("layers");
  const [propsTab, setPropsTab] = useState<PropsTab>("map");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [collapsedTracks, setCollapsedTracks] = useState<Set<EventType>>(new Set());
  const [lockedTracks, setLockedTracks] = useState<Set<EventType>>(new Set());

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
  // Same derivation the scene strip uses, so the strip chip and the stage
  // caption can never disagree.
  const caption = useMemo(() => activeChapter(project, time).title, [project, time]);

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
  const updateProject = useCallback((patch: Partial<ProjectDoc>) => setProject((p) => ({ ...p, ...patch })), [setProject]);

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
      setPropsTab("event");
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
    setPropsTab("nation");
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

  /** Left-panel shortcut: hand the painted regions to a nation with an auto frontline. */
  const autoDraw = useCallback(() => {
    const nationId = selectedNationId ?? projectRef.current.nations[0]?.id;
    if (!nationId) {
      // Nowhere to hand the regions — send the user where they can make a nation.
      setLeftTab("nations");
      setLeftOpen(true);
      return;
    }
    assignSelection(nationId, "auto", 3);
  }, [assignSelection, selectedNationId]);

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

  // Selection helpers. Each also moves the Properties panel to the matching
  // editor — done here rather than in an effect on the ids, so the tab switch
  // is part of the same render as the selection instead of a second pass.
  const selectEvent = useCallback((id: string | null) => {
    setSelectedEventId(id);
    if (id) {
      setSelectedNationId(null);
      setPropsTab("event");
      setRightOpen(true);
    }
  }, []);
  const selectNation = useCallback((id: string | null) => {
    setSelectedNationId(id);
    if (id) {
      setSelectedEventId(null);
      setPropsTab("nation");
      setRightOpen(true);
    }
  }, []);
  const openGuide = useCallback(() => {
    setLeftTab("help");
    setLeftOpen(true);
  }, []);

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
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-wf-bg font-wf-ui text-wf-text-2">
      <Header
        projectName={project.name}
        duration={project.duration}
        saveState={saveState}
        playing={playing}
        exportDisabled={!basemap}
        onRename={(name) => updateProject({ name })}
        onSave={save}
        onUndo={undo}
        onRedo={redo}
        onTogglePlay={() => setPlaying((p) => !p)}
        onExport={() => setShowExport(true)}
      />

      <MenuBar
        projectName={project.name}
        hasEvent={!!selectedEventId}
        hasSelection={selection.size > 0}
        showHud={showHud}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        regionMode={regionMode}
        tool={tool}
        viewDetached={!!viewCamera}
        onSave={save}
        onExport={() => setShowExport(true)}
        onUndo={undo}
        onRedo={redo}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onClearSelection={() => setSelection(new Set())}
        onToggleHud={() => setShowHud((v) => !v)}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
        onRegionMode={setRegionMode}
        onTool={setTool}
        onSetKeyframe={setKeyframeFromView}
        onFollowTimeline={() => setViewCamera(null)}
        onGuide={openGuide}
      />

      <div className="flex min-h-0 flex-1">
        <IconRail
          tab={leftTab}
          onTab={(t) => {
            setLeftTab(t);
            setLeftOpen(true);
          }}
        />

        {leftOpen && (
          <aside className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-wf-line bg-wf-surface" style={{ width: "var(--wf-w-left)" }}>
            <Panels
              tab={leftTab}
              project={project}
              basemap={basemap}
              basemapLoading={basemapLoading}
              selectedNationId={selectedNationId}
              ownedBy={ownedBy}
              selectionCount={selection.size}
              onSelectNation={selectNation}
              onAddNation={addNation}
              onUpdateMap={updateMap}
              onUpdateProject={updateProject}
              currentCamera={currentCamera}
              onAddMarker={(kind) => {
                setMarkerKind(kind);
                addEvent("marker", { kind } as Partial<StudioEvent>);
              }}
              onApplyFlag={(spec: FlagSpec) => selectedNationId && updateNation(selectedNationId, { flag: spec })}
              onApplyColor={(color) => selectedNationId && updateNation(selectedNationId, { color })}
              onOpenMapProperties={() => {
                setPropsTab("map");
                setRightOpen(true);
              }}
              onAutoDraw={autoDraw}
            />
          </aside>
        )}

        {/* Centre column. The timeline lives in here so it spans the stage and
            the Properties panel, while the rail and left panel run full height. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col">
              <SceneStrip project={project} time={time} onSeek={setTime} onAddYear={() => addEvent("year")} />
              <MapToolbar
                tool={tool}
                onTool={setTool}
                markerKind={markerKind}
                onMarkerKind={setMarkerKind}
                regionMode={regionMode}
                onRegionMode={setRegionMode}
                showHud={showHud}
                onToggleHud={() => setShowHud((v) => !v)}
                viewDetached={!!viewCamera}
                onFollowTimeline={() => setViewCamera(null)}
                onSetKeyframe={setKeyframeFromView}
                map={project.map}
                onUpdateMap={updateMap}
              />
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
                  caption={caption}
                />
                {/* Basemap progress lives in the status bar; only the failure
                    case needs to interrupt, because the stage stays empty. */}
                {basemapError && (
                  <div className="absolute inset-x-0 top-3 flex justify-center px-3">
                    <span className="rounded-wf-md border border-wf-danger/40 bg-wf-danger/15 px-3 py-1.5 text-wf-md text-wf-danger">
                      Basemap failed to load: {basemapError}
                    </span>
                  </div>
                )}
              </div>
              <ViewBar tool={tool} camera={currentCamera} detached={!!viewCamera} onCamera={setViewCamera} onFollowTimeline={() => setViewCamera(null)} />
            </main>

            {rightOpen && (
              <aside className="min-h-0 shrink-0 overflow-hidden border-l border-wf-line bg-wf-surface" style={{ width: "var(--wf-w-right)" }}>
                <Inspector
                  project={project}
                  basemap={basemap}
                  basemapLoading={basemapLoading}
                  mode={propsTab}
                  onMode={setPropsTab}
                  selectedEvent={selectedEvent}
                  selectedNation={selectedNation}
                  selection={selection}
                  time={time}
                  currentCamera={currentCamera}
                  onUpdateEvent={(id, patch) => updateEvent(id, patch, true)}
                  onUpdateNation={updateNation}
                  onDeleteNation={deleteNation}
                  onUpdateMap={updateMap}
                  onUpdateProject={updateProject}
                  onPick={startPick}
                  onSelectionChange={setSelection}
                  onAssignSelection={assignSelection}
                  onSelectNation={selectNation}
                />
              </aside>
            )}
          </div>

          {/* Timeline draws its own top border. */}
          <div className="shrink-0" style={{ height: "var(--wf-h-timeline)" }}>
            <Timeline
              project={project}
              time={time}
              playing={playing}
              selectedId={selectedEventId}
              collapsed={collapsedTracks}
              locked={lockedTracks}
              onToggleCollapsed={(t) => setCollapsedTracks((s) => toggled(s, t))}
              onToggleLocked={(t) => setLockedTracks((s) => toggled(s, t))}
              onSelect={selectEvent}
              onSeek={setTime}
              onTogglePlay={() => setPlaying((p) => !p)}
              onUpdateEvent={updateEvent}
              onAdd={(type) => addEvent(type)}
              onDuration={(d) => updateProject({ duration: d })}
              onDeleteSelected={deleteSelected}
              onDuplicateSelected={duplicateSelected}
            />
          </div>
        </div>
      </div>

      <StatusBar project={project} saveState={saveState} basemapLoading={basemapLoading} onGuide={openGuide} />

      {showExport && <ExportDialog project={project} basemap={basemap} time={time} onClose={() => setShowExport(false)} />}
    </div>
  );
}
