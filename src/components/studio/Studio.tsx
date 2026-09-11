"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudio, type Mode } from "@/store/studio";
import type { Project } from "@/lib/types";
import TopBar from "./TopBar";
import LeftPanel from "./LeftPanel";
import MapCanvas from "./MapCanvas";
import Timeline from "./Timeline";
import Inspector from "./Inspector";
import ExportDialog from "./ExportDialog";
import { addKeyframeNow, cancelDraft, deleteSelection, duplicateSelection, finishDraft, stepFrames } from "./actions";

const KEY_MODES: Record<string, Mode> = { h: "navigate", v: "select", p: "paint", z: "drawZone", l: "drawLine", a: "drawArrow", m: "placeMarker", t: "placeLabel" };

export default function Studio({ id }: { id: string }) {
  const loadProject = useStudio((s) => s.loadProject);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- load ----
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((row: { data: Project; name: string }) => {
        if (!cancelled) loadProject(id, { ...row.data, name: row.name ?? row.data.name });
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [id, loadProject]);

  // ---- save ----
  const save = useCallback(async () => {
    const s = useStudio.getState();
    if (!s.project || !s.projectId) return;
    s.setSaveStatus("saving");
    try {
      const res = await fetch(`/api/projects/${s.projectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: s.project, name: s.project.name }) });
      if (!res.ok) throw new Error("save failed");
      useStudio.getState().markSaved();
    } catch {
      useStudio.getState().setSaveStatus("error");
    }
  }, []);

  useEffect(() => {
    const unsub = useStudio.subscribe((state, prev) => {
      if (state.project !== prev.project && state.dirty) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(save, 2000);
      }
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [save]);

  // ---- playback loop ----
  const playing = useStudio((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useStudio.getState();
      const dt = ((now - last) / 1000) * s.rate;
      last = now;
      if (!s.project) return;
      let t = s.time + dt;
      if (t >= s.project.video.duration) {
        if (s.loop) t = 0;
        else {
          s.setTime(s.project.video.duration);
          s.setPlaying(false);
          return;
        }
      }
      s.setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      const s = useStudio.getState();
      if (!s.project) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (typing) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      switch (e.key) {
        case " ":
          e.preventDefault();
          s.setPlaying(!s.playing);
          return;
        case "ArrowLeft":
          e.preventDefault();
          stepFrames(e.shiftKey ? -10 : -1);
          return;
        case "ArrowRight":
          e.preventDefault();
          stepFrames(e.shiftKey ? 10 : 1);
          return;
        case "Home":
          s.setTime(0);
          return;
        case "End":
          s.setTime(s.project.video.duration);
          return;
        case "Enter":
          finishDraft();
          return;
        case "Escape":
          if (s.exportOpen) s.setExportOpen(false);
          else cancelDraft();
          return;
        case "Delete":
        case "Backspace":
          deleteSelection();
          return;
      }
      const k = e.key.toLowerCase();
      if (k === "k") {
        addKeyframeNow();
        return;
      }
      if (KEY_MODES[k] && !mod) s.setMode(KEY_MODES[k]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // warn on unload with unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useStudio.getState().dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  if (error)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-6 text-sm">
          Could not load project: {error}.{" "}
          <a href="/" className="underline">
            Back to projects
          </a>
        </div>
      </div>
    );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950">
      <TopBar onSave={save} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-slate-800">
          <LeftPanel />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MapCanvas />
          </div>
          <div className="h-60 shrink-0">
            <Timeline />
          </div>
        </main>
        <aside className="w-80 shrink-0 border-l border-slate-800">
          <Inspector />
        </aside>
      </div>
      <ExportDialog />
    </div>
  );
}
