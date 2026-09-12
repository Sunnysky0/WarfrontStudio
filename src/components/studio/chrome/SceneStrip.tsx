"use client";
import React from "react";
import { ChevronDown, Clapperboard, Plus } from "lucide-react";
import { formatTime } from "@/lib/studio/state";
import type { ProjectDoc, StudioEvent } from "@/lib/studio/types";
import { IconButton, Menu, MenuItem, MenuLabel, Pill } from "../ui";

/**
 * Derive the current chapter from the document. Exported because the map
 * stage shows the same caption in its bottom-left overlay — computing it in
 * two places would be two chances to disagree.
 */
export function activeChapter(project: ProjectDoc, time: number) {
  const chapters = project.events.filter((e) => e.type === "year").sort((a, b) => a.start - b.start);
  let index = -1;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].start <= time) index = i;
  const active: StudioEvent | null = index >= 0 ? chapters[index] : null;
  const subtitle = project.events.find((e) => e.type === "subtitle" && e.start <= time && time < e.end);
  const title = subtitle && subtitle.type === "subtitle" ? subtitle.text : active && active.type === "year" ? active.text : "Untitled";
  return { chapters, index, title, num: index >= 0 ? String(index + 1).padStart(2, "0") : "—" };
}

/**
 * Chapter indicator. There is no scenes model in ProjectDoc and adding one is
 * out of scope, so a "scene" here is derived, read-only: the latest `year`
 * event at or before the playhead numbers the chapter, and the `subtitle`
 * active at the playhead (falling back to the year text) titles it.
 */
export default function SceneStrip({
  project,
  time,
  onSeek,
  onAddYear,
}: {
  project: ProjectDoc;
  time: number;
  onSeek: (t: number) => void;
  onAddYear: () => void;
}) {
  const { chapters, index: idx, title, num } = React.useMemo(() => activeChapter(project, time), [project, time]);

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-wf-line bg-wf-surface px-2.5"
      style={{ height: "var(--wf-h-scene)" }}
    >
      <Menu
        width={240}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            title="Jump to a chapter"
            className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded-wf-md px-1.5 py-1 transition-colors duration-150 wf-focus ${
              open ? "bg-wf-raised-2" : "hover:bg-wf-raised-2"
            }`}
          >
            <Clapperboard size={13} strokeWidth={1.75} className="shrink-0 text-wf-accent-text" />
            <span className="shrink-0 text-wf-md font-semibold text-wf-text">Scene {num}</span>
            <span className="shrink-0 text-wf-text-5">·</span>
            <span className="max-w-64 truncate text-wf-md text-wf-text-3">{title}</span>
            <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-wf-text-4" />
          </button>
        )}
      >
        <MenuLabel>Chapters (year events)</MenuLabel>
        {chapters.length === 0 && <MenuItem disabled>No year events yet</MenuItem>}
        {chapters.map((c, i) => (
          <MenuItem key={c.id} checked={i === idx} shortcut={formatTime(c.start).slice(0, 5)} onClick={() => onSeek(c.start)}>
            {c.type === "year" ? c.text : c.id}
          </MenuItem>
        ))}
      </Menu>

      <IconButton title="Add a year marker at the playhead" size="sm" onClick={onAddYear}>
        <Plus size={13} strokeWidth={2} />
      </IconButton>

      <Pill className="ml-auto">{chapters.length} chapters</Pill>
    </div>
  );
}
