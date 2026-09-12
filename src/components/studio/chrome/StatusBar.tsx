"use client";
import React from "react";
import { Globe, Keyboard, Loader2, Monitor } from "lucide-react";
import type { ProjectDoc } from "@/lib/studio/types";
import { BORDER_YEARS, PROJECTIONS } from "@/lib/studio/types";
import { Divider, StatusDot } from "../ui";
import type { SaveState } from "./Header";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved",
  saving: "Saving…",
  error: "Save failed",
};
const SAVE_TONE: Record<SaveState, "ok" | "warn" | "danger"> = {
  saved: "ok",
  dirty: "warn",
  saving: "warn",
  error: "danger",
};

export default function StatusBar({
  project,
  saveState,
  basemapLoading,
  onGuide,
}: {
  project: ProjectDoc;
  saveState: SaveState;
  basemapLoading: boolean;
  onGuide: () => void;
}) {
  const year = BORDER_YEARS.find((y) => y.id === project.map.borderYear)?.label ?? project.map.borderYear;
  const proj = PROJECTIONS.find((p) => p.id === project.map.projection)?.label ?? project.map.projection;

  return (
    <footer
      className="flex shrink-0 items-center gap-3 border-t border-wf-line bg-wf-surface px-3 text-wf-sm text-wf-text-4"
      style={{ height: "var(--wf-h-status)" }}
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <StatusDot tone={SAVE_TONE[saveState]} pulse={saveState === "saving"} />
        {SAVE_LABEL[saveState]}
      </span>
      <Divider vertical className="h-3" />
      <span className="flex shrink-0 items-center gap-1.5">
        <Globe size={12} strokeWidth={1.75} />
        {year}
      </span>
      <span className="hidden shrink-0 truncate md:inline">{proj}</span>
      {basemapLoading && (
        <span className="flex shrink-0 items-center gap-1.5 text-wf-warn">
          <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          Loading {project.map.lod} basemap
        </span>
      )}

      <span className="mx-auto hidden min-w-0 truncate lg:block">{project.description || "No description"}</span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-0">
        <Monitor size={12} strokeWidth={1.75} />
        <span className="tnum">
          {project.map.width} × {project.map.height}
        </span>
      </span>
      <Divider vertical className="h-3" />
      <button
        type="button"
        onClick={onGuide}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-wf-sm px-1 transition-colors duration-150 hover:text-wf-text-2 wf-focus"
      >
        <Keyboard size={12} strokeWidth={1.75} />
        Shortcuts
      </button>
    </footer>
  );
}
