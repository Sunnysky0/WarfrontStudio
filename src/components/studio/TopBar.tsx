"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, Diamond, Download, Hand, Highlighter, Keyboard, MapPin, MousePointer2, MoveRight, PenLine, Redo2, Save, Shapes, Type, Undo2, Upload, Video } from "lucide-react";
import { useStudio, type Mode } from "@/store/studio";
import { downloadBlob, renderPng } from "@/lib/export/exporter";
import type { Project } from "@/lib/types";
import { Button } from "./ui";
import { previewRenderer } from "./MapCanvas";
import { addKeyframeNow } from "./actions";

const MODES: { id: Mode; label: string; key: string; icon: typeof Hand }[] = [
  { id: "navigate", label: "Pan / zoom", key: "H", icon: Hand },
  { id: "select", label: "Select & edit", key: "V", icon: MousePointer2 },
  { id: "paint", label: "Paint countries", key: "P", icon: Highlighter },
  { id: "drawZone", label: "Draw zone", key: "Z", icon: Shapes },
  { id: "drawLine", label: "Draw front line", key: "L", icon: PenLine },
  { id: "drawArrow", label: "Arrow", key: "A", icon: MoveRight },
  { id: "placeMarker", label: "Marker", key: "M", icon: MapPin },
  { id: "placeLabel", label: "Label", key: "T", icon: Type },
];

export default function TopBar({ onSave }: { onSave: () => void }) {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const dirty = useStudio((s) => s.dirty);
  const saveStatus = useStudio((s) => s.saveStatus);
  const setExportOpen = useStudio((s) => s.setExportOpen);
  const selection = useStudio((s) => s.selection);
  const time = useStudio((s) => s.time);
  const loadProject = useStudio((s) => s.loadProject);
  const projectId = useStudio((s) => s.projectId);
  const setStatus = useStudio((s) => s.setStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showKeys, setShowKeys] = useState(false);

  if (!project) return null;

  const snapshot = async () => {
    try {
      const blob = await renderPng(project, previewRenderer.layers, time, project.video.width, project.video.height);
      downloadBlob(blob, `${project.name.replace(/[^\w-]+/g, "_")}_frame.png`);
    } catch (e) {
      setStatus(`Snapshot failed: ${(e as Error).message}`);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${project.name.replace(/[^\w-]+/g, "_")}.warfront.json`);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Project;
      if (!data || data.version !== 1 || !data.map || !data.time) throw new Error("Not a Warfront project file");
      loadProject(projectId!, data);
      useStudio.setState({ dirty: true });
      setStatus(`Imported ${file.name}`);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="relative flex h-12 items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 text-slate-200">
      <Link href="/" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white" title="Back to projects">
        <ArrowLeft size={14} /> Projects
      </Link>
      <div className="mx-1 h-6 w-px bg-slate-800" />
      <input
        className="w-56 truncate rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-slate-700 focus:border-sky-500 focus:outline-none"
        value={project.name}
        onChange={(e) => update((p) => void (p.name = e.target.value))}
      />
      <span className={`text-[10px] ${saveStatus === "error" ? "text-red-400" : dirty ? "text-amber-400" : "text-emerald-400"}`}>
        {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : dirty ? "Unsaved changes" : "Saved"}
      </span>
      <div className="mx-1 h-6 w-px bg-slate-800" />
      <Button variant="ghost" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 size={15} />
      </Button>
      <Button variant="ghost" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        <Redo2 size={15} />
      </Button>
      <div className="mx-1 h-6 w-px bg-slate-800" />
      <div className="flex items-center gap-0.5 rounded bg-slate-900 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            title={`${m.label} (${m.key})`}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === m.id ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            <m.icon size={14} />
            <span className="hidden xl:inline">{m.label}</span>
          </button>
        ))}
      </div>
      <Button variant="ghost" title="Add shape keyframe at playhead (K)" disabled={!selection || (selection.type !== "zone" && selection.type !== "line")} onClick={addKeyframeNow}>
        <Diamond size={14} /> <span className="hidden 2xl:inline">Keyframe</span>
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" title="Keyboard shortcuts" onClick={() => setShowKeys((v) => !v)} active={showKeys}>
          <Keyboard size={15} />
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        <Button variant="ghost" title="Import project JSON" onClick={() => fileRef.current?.click()}>
          <Upload size={15} />
        </Button>
        <Button variant="ghost" title="Download project JSON" onClick={exportJson}>
          <Download size={15} />
        </Button>
        <Button variant="ghost" title="Save current frame as PNG" onClick={snapshot}>
          <Camera size={15} />
        </Button>
        <Button variant="default" title="Save (Ctrl+S)" onClick={onSave}>
          <Save size={14} /> Save
        </Button>
        <Button variant="primary" title="Export video" onClick={() => setExportOpen(true)}>
          <Video size={14} /> Export video
        </Button>
      </div>
      {showKeys && (
        <div className="absolute right-3 top-12 z-30 w-80 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs shadow-2xl">
          <div className="mb-2 font-semibold">Keyboard shortcuts</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
            {[
              ["Space", "Play / pause"],
              ["← / →", "Step one frame (Shift: 10)"],
              ["Home / End", "Jump to start / end"],
              ["H V P Z L A M T", "Switch tools"],
              ["Enter", "Finish zone / line"],
              ["Esc", "Cancel drawing / deselect"],
              ["K", "Add keyframe at playhead"],
              ["Del / Backspace", "Delete selection"],
              ["Ctrl+D", "Duplicate selection"],
              ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
              ["Ctrl+S", "Save"],
              ["Alt+drag / middle drag", "Pan in any tool"],
              ["Scroll", "Zoom around cursor"],
              ["Shift+click vertex", "Delete vertex"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded bg-slate-800 px-1 font-mono text-[10px]">{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
