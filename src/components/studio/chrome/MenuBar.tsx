"use client";
import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Copy,
  Crosshair,
  Download,
  Eye,
  Folder,
  Hand,
  Keyboard,
  MapPin,
  MousePointer2,
  Spline,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Undo,
} from "lucide-react";
import type { Tool } from "../MapView";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../ui";

export interface MenuBarProps {
  projectName: string;
  hasEvent: boolean;
  hasSelection: boolean;
  showHud: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  regionMode: "country" | "province";
  tool: Tool;
  viewDetached: boolean;
  onSave: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  onToggleHud: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onRegionMode: (m: "country" | "province") => void;
  onTool: (t: Tool) => void;
  onSetKeyframe: () => void;
  onFollowTimeline: () => void;
  onGuide: () => void;
}

/**
 * Application menubar. Everything here drives a handler that already exists in
 * Studio — the shortcuts shown are the live keydown bindings, not new ones.
 */
export default function MenuBar(props: MenuBarProps) {
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-wf-line bg-wf-bg px-2 text-wf-md"
      style={{ height: "var(--wf-h-menubar)" }}
    >
      <Menu label="File">
        <MenuItem icon={<Save size={12} strokeWidth={1.75} />} shortcut={`${mod}+S`} onClick={props.onSave}>
          Save project
        </MenuItem>
        <MenuItem icon={<Download size={12} strokeWidth={1.75} />} onClick={props.onExport}>
          Export video…
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<ArrowLeft size={12} strokeWidth={1.75} />} onClick={() => (window.location.href = "/")}>
          Back to projects
        </MenuItem>
      </Menu>

      <Menu label="Edit">
        <MenuItem icon={<Undo2 size={12} strokeWidth={1.75} />} shortcut={`${mod}+Z`} onClick={props.onUndo}>
          Undo
        </MenuItem>
        <MenuItem icon={<Redo2 size={12} strokeWidth={1.75} />} shortcut={`${mod}+⇧+Z`} onClick={props.onRedo}>
          Redo
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Copy size={12} strokeWidth={1.75} />} shortcut={`${mod}+D`} disabled={!props.hasEvent} onClick={props.onDuplicate}>
          Duplicate event
        </MenuItem>
        <MenuItem icon={<Trash2 size={12} strokeWidth={1.75} />} shortcut="Del" disabled={!props.hasEvent} danger onClick={props.onDelete}>
          Delete event
        </MenuItem>
        <MenuSeparator />
        <MenuItem shortcut="Esc" disabled={!props.hasSelection} onClick={props.onClearSelection}>
          Clear map selection
        </MenuItem>
      </Menu>

      <Menu label="View" width={232}>
        <MenuLabel>Panels</MenuLabel>
        <MenuItem icon={<PanelLeft size={12} strokeWidth={1.75} />} checked={props.leftOpen} onClick={props.onToggleLeft}>
          Left panel
        </MenuItem>
        <MenuItem icon={<PanelRight size={12} strokeWidth={1.75} />} checked={props.rightOpen} onClick={props.onToggleRight}>
          Properties panel
        </MenuItem>
        <MenuItem icon={<Eye size={12} strokeWidth={1.75} />} checked={props.showHud} onClick={props.onToggleHud}>
          HUD preview
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Tool</MenuLabel>
        <MenuItem icon={<MousePointer2 size={12} strokeWidth={1.75} />} checked={props.tool === "select"} onClick={() => props.onTool("select")}>
          Select regions
        </MenuItem>
        <MenuItem icon={<Hand size={12} strokeWidth={1.75} />} checked={props.tool === "pan"} onClick={() => props.onTool("pan")}>
          Pan
        </MenuItem>
        <MenuItem icon={<MapPin size={12} strokeWidth={1.75} />} checked={props.tool === "marker"} onClick={() => props.onTool("marker")}>
          Place marker
        </MenuItem>
        <MenuItem icon={<Spline size={12} strokeWidth={1.75} />} checked={props.tool === "front"} onClick={() => props.onTool("front")}>
          Draw frontline
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Selection unit</MenuLabel>
        <MenuItem checked={props.regionMode === "country"} onClick={() => props.onRegionMode("country")}>
          Countries
        </MenuItem>
        <MenuItem checked={props.regionMode === "province"} onClick={() => props.onRegionMode("province")}>
          Provinces
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Camera</MenuLabel>
        <MenuItem icon={<Crosshair size={12} strokeWidth={1.75} />} onClick={props.onSetKeyframe}>
          Set keyframe from view
        </MenuItem>
        <MenuItem icon={<Undo size={12} strokeWidth={1.75} />} disabled={!props.viewDetached} onClick={props.onFollowTimeline}>
          Follow timeline camera
        </MenuItem>
      </Menu>

      <Menu label="Help">
        <MenuItem icon={<BookOpen size={12} strokeWidth={1.75} />} onClick={props.onGuide}>
          Studio field guide
        </MenuItem>
        <MenuItem icon={<Keyboard size={12} strokeWidth={1.75} />} onClick={props.onGuide}>
          Keyboard shortcuts
        </MenuItem>
      </Menu>

      <div className="mx-2 flex min-w-0 items-center gap-1 text-wf-md text-wf-text-4">
        <Folder size={13} strokeWidth={1.75} />
        <Link href="/" className="rounded-wf-sm px-0.5 transition-colors duration-150 hover:text-wf-text-2 wf-focus">
          My workspace
        </Link>
        <ChevronRight size={12} strokeWidth={1.75} className="shrink-0" />
        <span className="truncate text-wf-text-2">{props.projectName}</span>
      </div>

      <button
        type="button"
        onClick={props.onGuide}
        className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-wf-sm px-2 py-0.5 text-wf-md text-wf-text-4 transition-colors duration-150 hover:bg-wf-raised-2 hover:text-wf-accent-text wf-focus"
      >
        <BookOpen size={13} strokeWidth={1.75} />
        Studio field guide
      </button>
    </div>
  );
}
