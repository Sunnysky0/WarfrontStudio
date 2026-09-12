"use client";
import React from "react";
import { Cloud, CloudOff, Download, Loader2, Pause, Play, Redo2, Undo2 } from "lucide-react";
import { Button, Divider, IconButton, Pill } from "../ui";

export type SaveState = "saved" | "dirty" | "saving" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed — retry",
};
const SAVE_TONE: Record<SaveState, string> = {
  saved: "text-wf-ok",
  dirty: "text-wf-warn",
  saving: "text-wf-warn",
  error: "text-wf-danger",
};

export function Wordmark() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-wf-lg bg-wf-accent text-wf-accent-ink">
        <span className="wf-wordmark text-[15px] leading-none">W</span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="wf-wordmark text-[17px] text-wf-text">WARFRONT</span>
        <span className="mt-[3px] font-[family-name:var(--font-wf-display)] text-[8px] font-semibold tracking-[0.30em] text-wf-text-4">
          ANIMATION STUDIO
        </span>
      </span>
    </div>
  );
}

export default function Header({
  projectName,
  duration,
  saveState,
  playing,
  exportDisabled,
  onRename,
  onSave,
  onUndo,
  onRedo,
  onTogglePlay,
  onExport,
}: {
  projectName: string;
  duration: number;
  saveState: SaveState;
  playing: boolean;
  exportDisabled?: boolean;
  onRename: (name: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlay: () => void;
  onExport: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(projectName);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== projectName) onRename(next);
    else setDraft(projectName);
    setEditing(false);
  };

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-wf-line bg-wf-surface px-3" style={{ height: "var(--wf-h-header)" }}>
      <Wordmark />
      <Divider vertical className="h-7" />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(projectName);
              setEditing(false);
            }
          }}
          className="min-w-0 max-w-64 rounded-wf-md border border-wf-accent/50 bg-wf-lane px-2 py-1 text-wf-lg font-semibold text-wf-text outline-none"
        />
      ) : (
        <button
          type="button"
          title="Rename project"
          onClick={() => {
            setDraft(projectName);
            setEditing(true);
          }}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-wf-md px-1.5 py-1 text-left transition-colors duration-150 hover:bg-wf-raised-2 wf-focus"
        >
          <span className="truncate text-wf-lg font-semibold text-wf-text">{projectName}</span>
        </button>
      )}
      <Pill>{duration}s</Pill>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className={`flex items-center gap-1.5 text-wf-md ${SAVE_TONE[saveState]}`}>
          {saveState === "saving" ? (
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
          ) : saveState === "error" ? (
            <CloudOff size={14} strokeWidth={1.75} />
          ) : (
            <Cloud size={14} strokeWidth={1.75} />
          )}
          <span className="hidden lg:inline">{SAVE_LABEL[saveState]}</span>
        </span>

        <Divider vertical />
        <IconButton title="Undo (Ctrl+Z)" onClick={onUndo}>
          <Undo2 size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Redo (Ctrl+Shift+Z)" onClick={onRedo}>
          <Redo2 size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Save now (Ctrl+S)" onClick={onSave} disabled={saveState === "saving"}>
          <Cloud size={16} strokeWidth={1.75} />
        </IconButton>
        <Divider vertical />

        <Button variant="ghost" size="md" onClick={onTogglePlay} title="Play / pause (Space)">
          {playing ? <Pause size={15} strokeWidth={1.75} /> : <Play size={15} strokeWidth={1.75} />}
          Preview
        </Button>
        <Button variant="accent" size="md" onClick={onExport} disabled={exportDisabled} title="Render an MP4 / WebM">
          <Download size={15} strokeWidth={2} />
          Export video
        </Button>
        <span className="ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-wf-line-warm bg-wf-raised-2 text-wf-sm font-semibold text-wf-text-3">
          {(projectName.trim()[0] ?? "W").toUpperCase()}
        </span>
      </div>
    </header>
  );
}
