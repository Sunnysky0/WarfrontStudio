"use client";
import React, { useEffect, useState } from "react";
import type { Basemap } from "@/lib/studio/basemap";
import { MARKER_KINDS, drawMarker } from "@/lib/studio/drawing";
import { FLAG_PRESETS, NATION_COLOR_PRESETS, RESOLUTION_PRESETS } from "@/lib/studio/presets";
import { THEMES } from "@/lib/studio/themes";
import type { Camera, FlagSpec, LayerId, MapSettings, MarkerKind, ProjectDoc } from "@/lib/studio/types";
import { ALL_LAYERS, BORDER_YEARS, LAYER_LABELS, PROJECTIONS } from "@/lib/studio/types";
import { FlagPreview } from "./Inspector";
import { Button, Field, NumberInput, Section, Select, TextArea, TextInput, Toggle } from "./ui";

export type LeftTab = "nations" | "map" | "assets" | "help";

export interface PanelsProps {
  tab: LeftTab;
  project: ProjectDoc;
  basemap: Basemap | null;
  basemapLoading: boolean;
  selectedNationId: string | null;
  ownedBy: Map<string, number>; // nation id -> region count at playhead
  onSelectNation: (id: string | null) => void;
  onAddNation: () => void;
  onUpdateMap: (patch: Partial<MapSettings>) => void;
  onUpdateProject: (patch: Partial<ProjectDoc>) => void;
  currentCamera: Camera;
  onAddMarker: (kind: MarkerKind) => void;
  onApplyFlag: (spec: FlagSpec) => void;
  onApplyColor: (color: string) => void;
}

function MarkerIcon({ kind, color }: { kind: MarkerKind; color: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 40, 40);
    drawMarker(ctx, kind, 20, 20, 9, color, 0.4, false);
  }, [kind, color]);
  return <canvas ref={ref} width={40} height={40} />;
}

interface AssetRow {
  id: string;
  name: string;
  kind: string;
  data: string;
}

export default function Panels(props: PanelsProps) {
  const { tab, project, onUpdateMap } = props;
  const m = project.map;

  if (tab === "nations") {
    return (
      <div className="flex h-full flex-col">
        <Section
          title={`Nations (${project.nations.length})`}
          right={
            <Button size="xs" variant="primary" onClick={props.onAddNation}>
              + New nation
            </Button>
          }
        >
          <span className="text-[10px] text-zinc-500">Click to edit. Numbers show regions owned at the playhead.</span>
        </Section>
        <div className="flex-1 overflow-y-auto">
          {project.nations.map((n) => {
            const sel = n.id === props.selectedNationId;
            const owned = props.ownedBy.get(n.id) ?? 0;
            return (
              <button
                key={n.id}
                onClick={() => props.onSelectNation(sel ? null : n.id)}
                className={`flex w-full items-center gap-2 border-b border-zinc-800/60 px-3 py-1.5 text-left text-xs hover:bg-zinc-800/60 ${sel ? "bg-violet-950/50" : ""}`}
              >
                <span className="h-4 w-4 shrink-0 rounded-sm border border-zinc-600" style={{ background: n.color }} />
                <FlagPreview spec={n.flag} color={n.color} w={27} h={18} />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                <span className={`text-[10px] ${owned ? "text-zinc-400" : "text-zinc-600"}`}>{owned}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (tab === "map") {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Project">
          <Field label="Title">
            <TextInput value={project.name} onChange={(e) => props.onUpdateProject({ name: e.target.value })} />
          </Field>
          <Field label="Description">
            <TextArea value={project.description} onChange={(e) => props.onUpdateProject({ description: e.target.value })} />
          </Field>
        </Section>
        <Section title="Base map">
          <Field label="Projection">
            <Select value={m.projection} onChange={(v) => onUpdateMap({ projection: v })} options={PROJECTIONS.map((p) => ({ value: p.id, label: p.label }))} />
          </Field>
          <Field label="Country borders (year)" hint="1935/1939 use the closest available snapshots (1930/1938). Provinces always use modern admin-1 units.">
            <Select value={m.borderYear} onChange={(v) => onUpdateMap({ borderYear: v })} options={BORDER_YEARS.map((y) => ({ value: y.id, label: y.label }))} />
          </Field>
          <Field label="Granularity (level of detail)" hint={props.basemapLoading ? "Loading basemap…" : props.basemap ? `${props.basemap.countries.features.length} countries · ${props.basemap.provinces.features.length} provinces loaded` : ""}>
            <Select
              value={m.lod}
              onChange={(v) => onUpdateMap({ lod: v })}
              options={[
                { value: "low", label: "Low (fast, 1:110m)" },
                { value: "medium", label: "Medium (1:50m)" },
                { value: "high", label: "High (1:10m, detailed coasts)" },
              ]}
            />
          </Field>
          <Field label="Theme">
            <Select value={m.theme} onChange={(v) => onUpdateMap({ theme: v })} options={THEMES.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                title={t.name}
                onClick={() => onUpdateMap({ theme: t.id })}
                className={`h-6 w-10 rounded border ${m.theme === t.id ? "border-violet-400" : "border-zinc-700"}`}
                style={{ background: `linear-gradient(135deg, ${t.bg} 0 40%, ${t.land} 40% 70%, ${t.coast} 70%)` }}
              />
            ))}
          </div>
        </Section>
        <Section title="Layers">
          {ALL_LAYERS.map((l: LayerId) => (
            <Toggle key={l} label={LAYER_LABELS[l]} checked={m.layers[l]} onChange={(v) => onUpdateMap({ layers: { ...m.layers, [l]: v } })} />
          ))}
        </Section>
        <Section title="Density & style">
          <Field label={`Label scale (${(m.labelScale ?? 1).toFixed(2)})`}>
            <input type="range" min={0.5} max={2} step={0.05} value={m.labelScale ?? 1} onChange={(e) => onUpdateMap({ labelScale: +e.target.value })} />
          </Field>
          <Field label={`City density (${(m.cityDensity ?? 1).toFixed(2)})`}>
            <input type="range" min={0} max={2.5} step={0.1} value={m.cityDensity ?? 1} onChange={(e) => onUpdateMap({ cityDensity: +e.target.value })} />
          </Field>
          <Field label={`Sea label density (${(m.seaLabelDensity ?? 1).toFixed(2)})`}>
            <input type="range" min={0} max={2.5} step={0.1} value={m.seaLabelDensity ?? 1} onChange={(e) => onUpdateMap({ seaLabelDensity: +e.target.value })} />
          </Field>
          <Field label={`Projection precision (${(m.precision ?? 0.7).toFixed(2)}, lower = smoother curves, slower)`}>
            <input type="range" min={0} max={2} step={0.1} value={m.precision ?? 0.7} onChange={(e) => onUpdateMap({ precision: +e.target.value })} />
          </Field>
          <Toggle label="Coastline glow" checked={m.showGlow !== false} onChange={(v) => onUpdateMap({ showGlow: v })} />
        </Section>
        <Section title="Output resolution">
          <Select
            value={`${m.width}x${m.height}`}
            onChange={(v) => {
              const [w, h] = v.split("x").map(Number);
              onUpdateMap({ width: w, height: h });
            }}
            options={[
              ...RESOLUTION_PRESETS.map((r) => ({ value: `${r.width}x${r.height}`, label: r.label })),
              ...(RESOLUTION_PRESETS.some((r) => r.width === m.width && r.height === m.height) ? [] : [{ value: `${m.width}x${m.height}`, label: `Custom ${m.width}×${m.height}` }]),
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
        <Section title="Default camera (before first keyframe)">
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
          <Button onClick={() => onUpdateMap({ defaultCamera: { ...props.currentCamera } })}>Use current view</Button>
        </Section>
      </div>
    );
  }

  if (tab === "assets") return <AssetsPanel {...props} />;

  return (
    <div className="h-full overflow-y-auto p-3 text-xs leading-relaxed text-zinc-300">
      <h3 className="mb-2 text-sm font-semibold text-white">How to build a warfront video</h3>
      <ol className="list-decimal space-y-2 pl-4">
        <li>
          <b>Set up the map</b> (Map tab): pick a projection, border year (1900 → present), granularity, a theme and the layers you want (coastlines, rivers, lakes, railroads, provinces, cities, sea labels…).
        </li>
        <li>
          <b>Create nations</b> (Nations tab): name, color, flag. Select countries or provinces on the map (click; shift+drag paints; switch the unit to <i>Provinces</i> for fine control) and add them as the nation’s initial territory.
        </li>
        <li>
          <b>Animate conquests</b>: select regions, choose the conquering nation in the inspector and press <i>Create territory event</i>. The frontline is auto-drawn from the attacker’s heartland; switch to radial/linear modes and pick an origin for landings.
        </li>
        <li>
          <b>Nation transitions</b>: add a <i>Nation transition</i> event to rename/recolor/re-flag a state (Russian Empire → RSFSR). Colors and names crossfade.
        </li>
        <li>
          <b>Disintegration</b>: add a <i>Disintegration</i> event, list successor states with their provinces (Austria-Hungary → Austria, Hungary, Czechoslovakia…). Enable <i>dissolve remainder</i> to remove the old state entirely.
        </li>
        <li>
          <b>Camera</b>: pan/zoom the map freely, then <i>Set keyframe from view</i>. The camera glides between keyframes.
        </li>
        <li>
          <b>Story layer</b>: year counter, subtitles, map text, markers (nukes, fire, battles…), belligerent flags and inset maps all live on the timeline. Drag clips to move them, drag edges to resize.
        </li>
        <li>
          <b>Export</b>: press Export to render an MP4/WebM at any resolution — frame-accurate via WebCodecs. Snapshot saves the current frame as PNG.
        </li>
      </ol>
      <h4 className="mt-3 font-semibold text-white">Shortcuts</h4>
      <ul className="list-disc pl-4">
        <li>Space – play / pause · Home – start</li>
        <li>← / → – step 0.5 s (shift: 5 s)</li>
        <li>Del – delete event · Ctrl+D duplicate · Ctrl+Z / Ctrl+Y undo/redo · Ctrl+S save</li>
        <li>Esc – clear selection / cancel picking</li>
      </ul>
      <h4 className="mt-3 font-semibold text-white">Region keys</h4>
      <p>
        <code>c:CHN</code> = country (ADM0 code), <code>p:JPN-1850</code> = province, <code>pn:JPN:Tokyo</code> = province by name, <code>cn:Austro-Hungarian Empire</code> = country by name (historical maps).
      </p>
    </div>
  );
}

function AssetsPanel(props: PanelsProps) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [uploadName, setUploadName] = useState("");
  const groups = Array.from(new Set(FLAG_PRESETS.map((f) => f.group)));
  const refresh = () =>
    fetch("/api/assets")
      .then((r) => r.json())
      .then((rows) => Array.isArray(rows) && setAssets(rows))
      .catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const data = String(reader.result);
      const name = uploadName || file.name.replace(/\.[^.]+$/, "");
      await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind: "flag", data }) });
      setUploadName("");
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const hasNation = !!props.selectedNationId;
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Flags" right={<span className="text-[10px] text-zinc-500">{hasNation ? "click → assign to nation" : "select a nation first"}</span>}>
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">{g}</div>
            <div className="flex flex-wrap gap-1">
              {FLAG_PRESETS.filter((f) => f.group === g).map((f) => (
                <button key={f.name} title={f.name} disabled={!hasNation} onClick={() => props.onApplyFlag(f.spec)} className="rounded hover:ring-2 hover:ring-violet-400 disabled:opacity-60">
                  <FlagPreview spec={f.spec} w={36} h={24} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>
      <Section title="Your uploaded flags / emblems">
        <div className="flex flex-wrap gap-1">
          {assets.map((a) => (
            <div key={a.id} className="relative">
              <button title={a.name} disabled={!hasNation} onClick={() => props.onApplyFlag({ kind: "image", url: a.data })} className="rounded hover:ring-2 hover:ring-violet-400 disabled:opacity-60">
                <FlagPreview spec={{ kind: "image", url: a.data }} w={36} h={24} />
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/assets?id=${a.id}`, { method: "DELETE" });
                  refresh();
                }}
                className="absolute -top-1 -right-1 rounded-full bg-zinc-900 px-1 text-[9px] text-red-400"
                title="Delete"
              >
                ×
              </button>
            </div>
          ))}
          {assets.length === 0 && <span className="text-[10px] text-zinc-500">No uploads yet.</span>}
        </div>
        <TextInput placeholder="Asset name (optional)" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
        <input type="file" accept="image/*" className="text-[10px]" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        <span className="text-[10px] text-zinc-500">PNG/SVG/JPG up to ~1.5 MB. Stored in the database and reusable in every project.</span>
      </Section>
      <Section title="Markers" right={<span className="text-[10px] text-zinc-500">click → add at view center</span>}>
        <div className="grid grid-cols-4 gap-1">
          {MARKER_KINDS.map((mk) => (
            <button key={mk.id} title={mk.label} onClick={() => props.onAddMarker(mk.id)} className="flex flex-col items-center rounded border border-zinc-800 bg-zinc-900 p-1 hover:border-violet-500">
              <MarkerIcon kind={mk.id} color="#ff4d6d" />
              <span className="w-full truncate text-center text-[9px] text-zinc-400">{mk.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Color palette" right={<span className="text-[10px] text-zinc-500">{hasNation ? "click → nation color" : "select a nation first"}</span>}>
        <div className="flex flex-wrap gap-1">
          {NATION_COLOR_PRESETS.map((p) => (
            <button key={p.name} title={p.name} disabled={!hasNation} onClick={() => props.onApplyColor(p.color)} className="h-6 w-6 rounded border border-zinc-600 disabled:opacity-60" style={{ background: p.color }} />
          ))}
        </div>
      </Section>
    </div>
  );
}
