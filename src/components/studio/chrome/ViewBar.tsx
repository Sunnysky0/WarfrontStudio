"use client";
import React from "react";
import { Hand, Maximize2, MousePointer2, MapPin, Minus, Plus, Crosshair, Link2Off, Spline } from "lucide-react";
import type { Camera } from "@/lib/studio/types";
import type { Tool } from "../MapView";
import { Divider, IconButton } from "../ui";

const HINTS: Record<Tool, { icon: React.ReactNode; text: string }> = {
  select: { icon: <MousePointer2 size={12} strokeWidth={1.75} />, text: "Click a region to select · shift+drag to paint · ctrl+click to toggle" },
  pan: { icon: <Hand size={12} strokeWidth={1.75} />, text: "Drag to pan · wheel to zoom" },
  marker: { icon: <MapPin size={12} strokeWidth={1.75} />, text: "Click the map to drop a marker at the playhead" },
  pick: { icon: <Crosshair size={12} strokeWidth={1.75} />, text: "Click a point to fill the field you started from · Esc cancels" },
  front: { icon: <Spline size={12} strokeWidth={1.75} />, text: "Click to place vertices · double-click or Enter to finish · drag handles to edit · click a segment to insert" },
};

/**
 * Status strip under the map stage: what the current tool does, plus the zoom
 * controls. Zoom used to be wheel-only, which made it unreachable from the
 * keyboard and undiscoverable.
 */
export default function ViewBar({
  tool,
  camera,
  detached,
  onCamera,
  onFollowTimeline,
}: {
  tool: Tool;
  camera: Camera;
  detached: boolean;
  onCamera: (c: Camera) => void;
  onFollowTimeline: () => void;
}) {
  const hint = HINTS[tool];
  const zoom = (factor: number) => onCamera({ ...camera, scale: Math.max(40, Math.min(200000, camera.scale * factor)) });

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-wf-line bg-wf-bg px-2.5 text-wf-sm text-wf-text-4" style={{ height: "var(--wf-h-viewbar)" }}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-wf-text-3">{hint.icon}</span>
        <span className="truncate">{hint.text}</span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {detached && (
          <>
            <button
              type="button"
              onClick={onFollowTimeline}
              title="The preview is showing a free camera. Click to follow the timeline again."
              className="flex cursor-pointer items-center gap-1 rounded-wf-sm border border-wf-warn/30 bg-wf-warn/10 px-1.5 py-px text-wf-warn transition-colors duration-150 hover:bg-wf-warn/20 wf-focus"
            >
              <Link2Off size={11} strokeWidth={2} />
              Free camera
            </button>
            <Divider vertical className="h-3" />
          </>
        )}
        <span className="tnum">
          {camera.lat.toFixed(1)}°, {camera.lon.toFixed(1)}°
        </span>
        <Divider vertical className="h-3" />
        <IconButton title="Zoom out" size="sm" onClick={() => zoom(1 / 1.3)}>
          <Minus size={12} strokeWidth={2} />
        </IconButton>
        <span className="tnum w-12 text-center text-wf-text-3">{Math.round(camera.scale)}</span>
        <IconButton title="Zoom in" size="sm" onClick={() => zoom(1.3)}>
          <Plus size={12} strokeWidth={2} />
        </IconButton>
        <IconButton title="Reset the preview camera to the timeline" size="sm" onClick={onFollowTimeline}>
          <Maximize2 size={12} strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}
