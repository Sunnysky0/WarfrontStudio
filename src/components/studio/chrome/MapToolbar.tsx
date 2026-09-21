"use client";
import React from "react";
import { Brush, Circle, Crosshair, Eye, EyeOff, Hand, MapPin, Monitor, MousePointer2, PenTool, Spline, Undo } from "lucide-react";
import { MARKER_KINDS } from "@/lib/studio/drawing";
import { RESOLUTION_PRESETS } from "@/lib/studio/presets";
import type { MapSettings, MarkerKind } from "@/lib/studio/types";
import type { FrontFitPrecision, FrontToolMode, Tool } from "../MapView";
import { Divider, IconButton, Segmented, Select } from "../ui";

export default function MapToolbar({
  tool,
  onTool,
  markerKind,
  onMarkerKind,
  regionMode,
  onRegionMode,
  showHud,
  onToggleHud,
  viewDetached,
  onFollowTimeline,
  onSetKeyframe,
  frontSelected,
  onSetFrontKeyframe,
  frontMode,
  onFrontMode,
  frontPrecision,
  onFrontPrecision,
  frontStabilization,
  onFrontStabilization,
  frontClosed,
  onFrontClosed,
  map,
  onUpdateMap,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  markerKind: MarkerKind;
  onMarkerKind: (k: MarkerKind) => void;
  regionMode: "country" | "province";
  onRegionMode: (m: "country" | "province") => void;
  showHud: boolean;
  onToggleHud: () => void;
  viewDetached: boolean;
  onFollowTimeline: () => void;
  onSetKeyframe: () => void;
  frontSelected?: boolean;
  onSetFrontKeyframe?: () => void;
  frontMode: FrontToolMode;
  onFrontMode: (mode: FrontToolMode) => void;
  frontPrecision: FrontFitPrecision;
  onFrontPrecision: (precision: FrontFitPrecision) => void;
  frontStabilization: number;
  onFrontStabilization: (value: number) => void;
  frontClosed: boolean;
  onFrontClosed: (closed: boolean) => void;
  map: MapSettings;
  onUpdateMap: (patch: Partial<MapSettings>) => void;
}) {
  const res = `${map.width}x${map.height}`;
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-wf-line bg-wf-bg px-2.5"
      style={{ height: "var(--wf-h-toolbar)" }}
    >
      <div className="flex items-center gap-0.5 rounded-wf-md border border-wf-line bg-wf-lane p-0.5">
        <IconButton title="Select regions — click, shift+drag to paint" variant="ghost" active={tool === "select"} onClick={() => onTool("select")}>
          <MousePointer2 size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Pan the map" variant="ghost" active={tool === "pan"} onClick={() => onTool("pan")}>
          <Hand size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Click the map to drop a marker at the playhead" variant="ghost" active={tool === "marker"} onClick={() => onTool("marker")}>
          <MapPin size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Draw a frontline — click to place vertices, double-click or Enter to finish" variant="ghost" active={tool === "front"} onClick={() => onTool("front")}>
          <Spline size={15} strokeWidth={1.75} />
        </IconButton>
      </div>

      {tool === "marker" && (
        <div className="w-40">
          <Select value={markerKind} onChange={onMarkerKind} options={MARKER_KINDS.map((m) => ({ value: m.id, label: m.label }))} />
        </div>
      )}
      {tool === "pick" && (
        <span className="flex animate-pulse items-center gap-1.5 rounded-wf-md border border-wf-accent/40 bg-wf-accent-soft px-2 py-1 text-wf-md text-wf-accent-text">
          <Crosshair size={13} strokeWidth={1.75} />
          Click the map to pick a point — Esc cancels
        </span>
      )}

      <Divider vertical />
      {tool === "front" ? (
        <>
          <Segmented
            value={frontMode}
            onChange={onFrontMode}
            size="xs"
            options={[
              { value: "freehand", label: <><Brush size={12} /> Freehand</> },
              { value: "pen", label: <><PenTool size={12} /> Pen</> },
              { value: "edit", label: <><MousePointer2 size={12} /> Edit</> },
            ]}
          />
          <div className="w-28">
            <Select
              value={frontPrecision}
              onChange={(v) => onFrontPrecision(v as FrontFitPrecision)}
              options={[
                { value: "exact", label: "Exact · 0.5px" },
                { value: "balanced", label: "Balanced · 1px" },
                { value: "smooth", label: "Smooth · 2px" },
              ]}
            />
          </div>
          <label className="flex items-center gap-1 text-wf-xs text-wf-text-4" title="Freehand stabilization">
            <span className="tnum w-11">Stab {frontStabilization}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={frontStabilization}
              onChange={(e) => onFrontStabilization(Number(e.target.value))}
              className="h-4 w-20 cursor-pointer wf-focus"
            />
          </label>
          <IconButton title={frontClosed ? "Open the frontline path" : "Close the frontline path"} variant="ghost" active={frontClosed} onClick={() => onFrontClosed(!frontClosed)}>
            <Circle size={14} strokeWidth={1.75} />
          </IconButton>
        </>
      ) : (
        <>
          <span className="text-wf-xs font-semibold uppercase tracking-[0.1em] text-wf-text-4">Unit</span>
          <Segmented
            value={regionMode}
            onChange={onRegionMode}
            options={[
              { value: "country", label: "Countries" },
              { value: "province", label: "Provinces" },
            ]}
          />
        </>
      )}

      <Divider vertical />
      <IconButton title="Set a camera keyframe from the current view" variant="solid" onClick={onSetKeyframe}>
        <Crosshair size={15} strokeWidth={1.75} />
      </IconButton>
      {frontSelected && onSetFrontKeyframe && (
        <IconButton title="Set a frontline keyframe at the playhead" variant="solid" onClick={onSetFrontKeyframe}>
          <Spline size={15} strokeWidth={1.75} />
        </IconButton>
      )}
      {viewDetached && (
        <IconButton title="Re-attach the preview to the timeline camera" variant="solid" onClick={onFollowTimeline}>
          <Undo size={15} strokeWidth={1.75} />
        </IconButton>
      )}

      <div className="ml-auto flex items-center gap-2">
        <IconButton title={showHud ? "Hide HUD preview" : "Show HUD preview"} variant="ghost" active={showHud} onClick={onToggleHud}>
          {showHud ? <Eye size={15} strokeWidth={1.75} /> : <EyeOff size={15} strokeWidth={1.75} />}
        </IconButton>
        <Divider vertical />
        <Monitor size={14} strokeWidth={1.75} className="shrink-0 text-wf-text-4" />
        <div className="w-44">
          <Select
            value={res}
            onChange={(v) => {
              const [w, h] = v.split("x").map(Number);
              onUpdateMap({ width: w, height: h });
            }}
            options={[
              ...RESOLUTION_PRESETS.map((r) => ({ value: `${r.width}x${r.height}`, label: r.label })),
              ...(RESOLUTION_PRESETS.some((r) => r.width === map.width && r.height === map.height)
                ? []
                : [{ value: res, label: `Custom ${map.width}×${map.height}` }]),
            ]}
          />
        </div>
      </div>
    </div>
  );
}
