"use client";
import React from "react";
import { Crosshair, Loader2 } from "lucide-react";
import type { Basemap } from "@/lib/studio/basemap";
import { RESOLUTION_PRESETS } from "@/lib/studio/presets";
import { THEMES } from "@/lib/studio/themes";
import type { Camera, MapSettings, ProjectDoc } from "@/lib/studio/types";
import { BORDER_YEARS, PROJECTIONS } from "@/lib/studio/types";
import { Button, Field, NumberInput, Section, Segmented, Select, Slider, TextArea, TextInput, Toggle } from "./ui";

/**
 * Map configuration, shown by the Inspector's "Map" mode.
 *
 * These sections used to live in the left panel's Map tab alongside the layer
 * list. The layer list stayed on the left (Panels.tsx); everything that is a
 * *setting* rather than a *visibility switch* moved here, so the left panel is
 * "what's in the scene" and the right panel is "how it's configured".
 * The props are the same ones Panels already received, so behaviour is
 * unchanged — the same onUpdateMap / onUpdateProject from Studio.tsx.
 */
export default function MapProperties({
  project,
  basemap,
  basemapLoading,
  currentCamera,
  onUpdateMap,
  onUpdateProject,
}: {
  project: ProjectDoc;
  basemap: Basemap | null;
  basemapLoading: boolean;
  currentCamera: Camera;
  onUpdateMap: (patch: Partial<MapSettings>) => void;
  onUpdateProject: (patch: Partial<ProjectDoc>) => void;
}) {
  const m = project.map;
  const res = `${m.width}x${m.height}`;

  return (
    <div className="flex flex-col">
      <Section title="Project">
        <Field label="Title">
          <TextInput value={project.name} onChange={(e) => onUpdateProject({ name: e.target.value })} />
        </Field>
        <Field label="Description">
          <TextArea value={project.description} onChange={(e) => onUpdateProject({ description: e.target.value })} />
        </Field>
      </Section>

      <Section title="Map configuration">
        <Field label="Historical borders" hint="1935/1939 use the closest available snapshots (1930/1938). Provinces always use modern admin-1 units.">
          <Select value={m.borderYear} onChange={(v) => onUpdateMap({ borderYear: v })} options={BORDER_YEARS.map((y) => ({ value: y.id, label: y.label }))} />
        </Field>
        <Field label="Projection">
          <Select value={m.projection} onChange={(v) => onUpdateMap({ projection: v })} options={PROJECTIONS.map((p) => ({ value: p.id, label: p.label }))} />
        </Field>
        <Field label="Map detail">
          <Segmented
            value={m.lod}
            onChange={(v) => onUpdateMap({ lod: v })}
            stretch
            options={[
              { value: "low", label: "Low", title: "1:110m — fastest" },
              { value: "medium", label: "Medium", title: "1:50m" },
              { value: "high", label: "High", title: "1:10m — detailed coasts" },
            ]}
          />
        </Field>
        <p className="flex items-center gap-1.5 text-wf-sm leading-snug text-wf-text-4">
          {basemapLoading ? (
            <>
              <Loader2 size={11} strokeWidth={2} className="shrink-0 animate-spin text-wf-warn" />
              Loading the {m.lod} basemap…
            </>
          ) : basemap ? (
            <>
              {basemap.countries.features.length} countries · {basemap.provinces.features.length} provinces loaded
            </>
          ) : (
            "No basemap loaded."
          )}
        </p>
      </Section>

      <Section title="Theme">
        <Select value={m.theme} onChange={(v) => onUpdateMap({ theme: v })} options={THEMES.map((t) => ({ value: t.id, label: t.name }))} />
        <div className="flex flex-wrap gap-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.name}
              aria-pressed={m.theme === t.id}
              onClick={() => onUpdateMap({ theme: t.id })}
              className={`h-6 w-10 cursor-pointer rounded-wf-sm border transition-colors duration-150 wf-focus ${
                m.theme === t.id ? "border-wf-accent" : "border-wf-line hover:border-wf-line-warm"
              }`}
              style={{ background: `linear-gradient(135deg, ${t.bg} 0 40%, ${t.land} 40% 70%, ${t.coast} 70%)` }}
            />
          ))}
        </div>
      </Section>

      <Section title="Density & style">
        <Slider label="Label scale" min={0.5} max={2} step={0.05} value={m.labelScale ?? 1} onChange={(v) => onUpdateMap({ labelScale: v })} format={(v) => v.toFixed(2)} />
        <Slider label="City density" min={0} max={2.5} step={0.1} value={m.cityDensity ?? 1} onChange={(v) => onUpdateMap({ cityDensity: v })} format={(v) => v.toFixed(2)} />
        <Slider
          label="Sea label density"
          min={0}
          max={2.5}
          step={0.1}
          value={m.seaLabelDensity ?? 1}
          onChange={(v) => onUpdateMap({ seaLabelDensity: v })}
          format={(v) => v.toFixed(2)}
        />
        <Slider label="Projection precision" min={0} max={2} step={0.1} value={m.precision ?? 0.7} onChange={(v) => onUpdateMap({ precision: v })} format={(v) => v.toFixed(2)} />
        <span className="-mt-1 text-wf-sm leading-snug text-wf-text-4">Lower precision means smoother curves and slower rendering.</span>
        <Toggle label="Coastline glow" checked={m.showGlow !== false} onChange={(v) => onUpdateMap({ showGlow: v })} />
      </Section>

      <Section title="Output resolution">
        <Select
          value={res}
          onChange={(v) => {
            const [w, h] = v.split("x").map(Number);
            onUpdateMap({ width: w, height: h });
          }}
          options={[
            ...RESOLUTION_PRESETS.map((r) => ({ value: `${r.width}x${r.height}`, label: r.label })),
            ...(RESOLUTION_PRESETS.some((r) => r.width === m.width && r.height === m.height) ? [] : [{ value: res, label: `Custom ${m.width}×${m.height}` }]),
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width">
            <NumberInput value={m.width} step={2} min={320} onChange={(v) => onUpdateMap({ width: Math.round(v / 2) * 2 })} />
          </Field>
          <Field label="Height">
            <NumberInput value={m.height} step={2} min={240} onChange={(v) => onUpdateMap({ height: Math.round(v / 2) * 2 })} />
          </Field>
        </div>
      </Section>

      <Section title="Default camera" right={<span className="text-wf-sm text-wf-text-5">before first keyframe</span>}>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Lon">
            <NumberInput value={m.defaultCamera.lon} step={0.5} onChange={(v) => onUpdateMap({ defaultCamera: { ...m.defaultCamera, lon: v } })} />
          </Field>
          <Field label="Lat">
            <NumberInput value={m.defaultCamera.lat} step={0.5} onChange={(v) => onUpdateMap({ defaultCamera: { ...m.defaultCamera, lat: v } })} />
          </Field>
          <Field label="Scale">
            <NumberInput value={m.defaultCamera.scale} step={10} min={40} onChange={(v) => onUpdateMap({ defaultCamera: { ...m.defaultCamera, scale: v } })} />
          </Field>
        </div>
        <Button onClick={() => onUpdateMap({ defaultCamera: { ...currentCamera } })}>
          <Crosshair size={13} strokeWidth={1.75} />
          Use current view
        </Button>
      </Section>
    </div>
  );
}
