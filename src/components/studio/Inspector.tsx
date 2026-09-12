"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Basemap } from "@/lib/studio/basemap";
import { regionName, searchRegions } from "@/lib/studio/basemap";
import { drawFlag } from "@/lib/studio/drawing";
import { MARKER_KINDS } from "@/lib/studio/drawing";
import { FLAG_PRESETS, NATION_COLOR_PRESETS } from "@/lib/studio/presets";
import type {
  Camera,
  DisintegrateEvent,
  Easing,
  FlagSpec,
  FrontMode,
  Nation,
  ProjectDoc,
  StudioEvent,
  TerritoryEvent,
} from "@/lib/studio/types";
import { EVENT_TYPE_LABELS } from "@/lib/studio/types";
import { Button, Chip, ColorInput, Field, NumberInput, Section, Select, TextArea, TextInput, Toggle } from "./ui";

export interface InspectorProps {
  project: ProjectDoc;
  basemap: Basemap | null;
  selectedEvent: StudioEvent | null;
  selectedNation: Nation | null;
  selection: Set<string>;
  time: number;
  currentCamera: Camera;
  onUpdateEvent: (id: string, patch: Partial<StudioEvent>) => void;
  onUpdateNation: (id: string, patch: Partial<Nation>) => void;
  onDeleteNation: (id: string) => void;
  onPick: (cb: (ll: [number, number]) => void) => void;
  onSelectionChange: (s: Set<string>) => void;
  onAssignSelection: (nationId: string, mode: FrontMode, duration: number) => void;
  onSelectNation: (id: string | null) => void;
}

const EASINGS: { value: Easing; label: string }[] = [
  { value: "easeInOut", label: "Ease in-out" },
  { value: "easeOut", label: "Ease out" },
  { value: "easeIn", label: "Ease in" },
  { value: "linear", label: "Linear" },
];
const MODES: { value: FrontMode; label: string }[] = [
  { value: "auto", label: "Auto frontline (from attacker)" },
  { value: "radial", label: "Radial sweep from origin" },
  { value: "linear", label: "Linear front (direction)" },
  { value: "fade", label: "Fade" },
  { value: "instant", label: "Instant" },
];

export function FlagPreview({ spec, color, w = 48, h = 32 }: { spec?: FlagSpec; color?: string; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const ok = drawFlag(ctx, spec, 0, 0, w, h, color ?? "#555");
    if (!ok) {
      const t = setTimeout(() => {
        ctx.clearRect(0, 0, w, h);
        drawFlag(ctx, spec, 0, 0, w, h, color ?? "#555");
      }, 400);
      return () => clearTimeout(t);
    }
  }, [spec, color, w, h]);
  return <canvas ref={ref} width={w} height={h} className="rounded border border-zinc-700" />;
}

function NationSelect({ project, value, onChange, allowNone }: { project: ProjectDoc; value?: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <Select
      value={value ?? ""}
      onChange={onChange}
      options={[...(allowNone ? [{ value: "", label: "— none —" }] : []), ...project.nations.map((n) => ({ value: n.id, label: n.name }))]}
    />
  );
}

function LonLatField({
  label,
  value,
  onChange,
  onPick,
  optional,
}: {
  label: string;
  value?: [number, number];
  onChange: (v: [number, number] | undefined) => void;
  onPick: (cb: (ll: [number, number]) => void) => void;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <NumberInput value={value?.[0]} step={0.1} onChange={(v) => onChange([v, value?.[1] ?? 0])} />
        <NumberInput value={value?.[1]} step={0.1} onChange={(v) => onChange([value?.[0] ?? 0, v])} />
        <Button onClick={() => onPick((ll) => onChange(ll))} title="Click on the map to pick">
          ⌖
        </Button>
        {optional && value && (
          <Button onClick={() => onChange(undefined)} title="Clear">
            ×
          </Button>
        )}
      </div>
      <span className="text-[10px] text-zinc-500">lon, lat</span>
    </Field>
  );
}

function RegionList({
  regions,
  basemap,
  onChange,
  selection,
  onSelectionChange,
}: {
  regions: string[];
  basemap: Basemap | null;
  onChange: (r: string[]) => void;
  selection: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
}) {
  const [q, setQ] = useState("");
  const results = basemap && q.length >= 2 ? searchRegions(basemap, q, 12) : [];
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {regions.length === 0 && <span className="text-[10px] text-zinc-500">No regions yet — select regions on the map and click “Add selection”.</span>}
        {regions.map((r) => (
          <Chip key={r} title={r} onRemove={() => onChange(regions.filter((x) => x !== r))}>
            {regionName(basemap, r)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="primary" disabled={!selection.size} onClick={() => onChange(Array.from(new Set([...regions, ...selection])))}>
          + Add selection ({selection.size})
        </Button>
        <Button size="xs" disabled={!selection.size} onClick={() => onChange(Array.from(selection))}>
          Replace with selection
        </Button>
        <Button size="xs" disabled={!regions.length} onClick={() => onSelectionChange(new Set(regions.map((r) => (basemap ? r : r))))}>
          Show on map
        </Button>
        <Button size="xs" disabled={!regions.length} onClick={() => onChange([])}>
          Clear
        </Button>
      </div>
      <TextInput placeholder="Search country / province by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-900">
          {results.map((f) => (
            <button
              key={f.id}
              className="block w-full px-2 py-0.5 text-left text-[11px] hover:bg-zinc-800"
              onClick={() => {
                if (!regions.includes(f.id)) onChange([...regions, f.id]);
                setQ("");
              }}
            >
              {f.properties.name} <span className="text-zinc-500">{f.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlagEditor({ value, onChange, color }: { value?: FlagSpec; onChange: (f: FlagSpec | undefined) => void; color?: string }) {
  const presetName = FLAG_PRESETS.find((p) => JSON.stringify(p.spec) === JSON.stringify(value))?.name ?? (value ? "__custom" : "");
  const groups = Array.from(new Set(FLAG_PRESETS.map((p) => p.group)));
  const custom = value?.kind === "custom" ? value : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <FlagPreview spec={value} color={color} />
        <select
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
          value={presetName}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onChange(undefined);
            else if (v === "__custom") onChange({ kind: "custom", layout: "horizontal", colors: ["#c8102e", "#ffffff", "#1c2c6e"], emblem: { shape: "star", color: "#ffd700", size: 0.25 } });
            else if (v === "__iso") onChange({ kind: "iso", code: "UN" });
            else if (v === "__image") onChange({ kind: "image", url: "" });
            else onChange(FLAG_PRESETS.find((p) => p.name === v)!.spec);
          }}
        >
          <option value="">— no flag —</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {FLAG_PRESETS.filter((p) => p.group === g).map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Custom">
            <option value="__iso">Any ISO country code…</option>
            <option value="__image">Image URL / data URL…</option>
            <option value="__custom">Custom flag builder…</option>
          </optgroup>
        </select>
      </div>
      {value?.kind === "iso" && (
        <Field label="ISO 3166-1 alpha-2 code" row>
          <TextInput value={value.code} onChange={(e) => onChange({ kind: "iso", code: e.target.value.toUpperCase().slice(0, 2) })} className="w-20" />
        </Field>
      )}
      {value?.kind === "image" && (
        <Field label="Image URL">
          <TextInput value={value.url} onChange={(e) => onChange({ kind: "image", url: e.target.value })} placeholder="https://… or data:image/png;base64,…" />
        </Field>
      )}
      {custom && (
        <div className="grid grid-cols-2 gap-2 rounded border border-zinc-800 p-2">
          <Field label="Layout">
            <Select
              value={custom.layout}
              onChange={(v) => onChange({ ...custom, layout: v })}
              options={[
                { value: "horizontal", label: "Horizontal stripes" },
                { value: "vertical", label: "Vertical stripes" },
                { value: "solid", label: "Solid" },
              ]}
            />
          </Field>
          <Field label="Colors (comma separated)">
            <TextInput
              value={custom.colors.join(",")}
              onChange={(e) =>
                onChange({
                  ...custom,
                  colors: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Emblem">
            <Select
              value={custom.emblem?.shape ?? "none"}
              onChange={(v) => onChange({ ...custom, emblem: { ...(custom.emblem ?? { color: "#ffd700", size: 0.25 }), shape: v } })}
              options={["none", "star", "octastar", "circle", "sun", "crescent", "cross", "diamond", "hammer", "trident"].map((s) => ({
                value: s as NonNullable<typeof custom.emblem>["shape"],
                label: s,
              }))}
            />
          </Field>
          <Field label="Emblem color">
            <ColorInput value={custom.emblem?.color ?? "#ffd700"} onChange={(c) => onChange({ ...custom, emblem: { ...(custom.emblem ?? { shape: "star", size: 0.25 }), color: c } })} />
          </Field>
          <Field label="Emblem size">
            <NumberInput value={custom.emblem?.size ?? 0.25} step={0.02} min={0.05} max={0.6} onChange={(v) => onChange({ ...custom, emblem: { ...(custom.emblem ?? { shape: "star", color: "#ffd700" }), size: v } })} />
          </Field>
          <Field label="Emblem x / y">
            <div className="flex gap-1">
              <NumberInput value={custom.emblem?.x ?? 0.5} step={0.05} onChange={(v) => onChange({ ...custom, emblem: { ...(custom.emblem ?? { shape: "star", color: "#ffd700" }), x: v } })} />
              <NumberInput value={custom.emblem?.y ?? 0.5} step={0.05} onChange={(v) => onChange({ ...custom, emblem: { ...(custom.emblem ?? { shape: "star", color: "#ffd700" }), y: v } })} />
            </div>
          </Field>
          <Field label="Border color (optional)">
            <TextInput value={custom.border ?? ""} onChange={(e) => onChange({ ...custom, border: e.target.value || undefined })} placeholder="#c8102e" />
          </Field>
        </div>
      )}
    </div>
  );
}

export default function Inspector(props: InspectorProps) {
  const { project, basemap, selectedEvent: ev, selectedNation, selection, onUpdateEvent, onPick } = props;
  const [assignNation, setAssignNation] = useState(project.nations[0]?.id ?? "");
  const [assignMode, setAssignMode] = useState<FrontMode>("auto");
  const [assignDur, setAssignDur] = useState(3);
  useEffect(() => {
    if (!project.nations.find((n) => n.id === assignNation)) setAssignNation(project.nations[0]?.id ?? "");
  }, [project.nations, assignNation]);

  const up = <T extends StudioEvent>(patch: Partial<T>) => ev && onUpdateEvent(ev.id, patch as Partial<StudioEvent>);

  return (
    <div className="flex h-full flex-col overflow-y-auto text-xs">
      {selection.size > 0 && (
        <Section
          title={`Map selection (${selection.size})`}
          right={
            <Button size="xs" onClick={() => props.onSelectionChange(new Set())}>
              clear
            </Button>
          }
        >
          <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
            {Array.from(selection)
              .slice(0, 40)
              .map((k) => (
                <Chip
                  key={k}
                  title={k}
                  onRemove={() => {
                    const s = new Set(selection);
                    s.delete(k);
                    props.onSelectionChange(s);
                  }}
                >
                  {regionName(basemap, k)}
                </Chip>
              ))}
            {selection.size > 40 && <span className="text-zinc-500">+{selection.size - 40} more</span>}
          </div>
          <div className="rounded border border-violet-900/60 bg-violet-950/30 p-2">
            <div className="mb-1 font-semibold text-violet-200">Transfer selection at playhead</div>
            <div className="grid grid-cols-2 gap-1">
              <NationSelect project={project} value={assignNation} onChange={setAssignNation} />
              <Select value={assignMode} onChange={setAssignMode} options={MODES} />
              <div className="flex items-center gap-1">
                <NumberInput value={assignDur} min={0} step={0.5} onChange={setAssignDur} />
                <span className="text-zinc-500">s</span>
              </div>
              <Button variant="primary" disabled={!assignNation} onClick={() => props.onAssignSelection(assignNation, assignMode, assignDur)}>
                Create territory event
              </Button>
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">Creates a frontline animation that hands the selected regions to the nation, starting at the playhead.</div>
          </div>
          {selectedNation && (
            <Button
              onClick={() => props.onUpdateNation(selectedNation.id, { regions: Array.from(new Set([...selectedNation.regions, ...selection])) })}
            >
              Add selection to “{selectedNation.name}” initial territory
            </Button>
          )}
        </Section>
      )}

      {ev && (
        <>
          <Section title={`${EVENT_TYPE_LABELS[ev.type]} event`}>
            <Field label="Label (timeline)">
              <TextInput value={ev.label ?? ""} onChange={(e) => up({ label: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start (s)">
                <NumberInput value={ev.start} step={0.1} min={0} onChange={(v) => up({ start: Math.min(v, ev.end) })} />
              </Field>
              <Field label="End (s)">
                <NumberInput value={ev.end} step={0.1} min={0} onChange={(v) => up({ end: Math.max(v, ev.start) })} />
              </Field>
            </div>
          </Section>

          {ev.type === "year" && (
            <Section title="Year counter">
              <Field label="Text shown top-left from this time on">
                <TextInput value={ev.text} onChange={(e) => up({ text: e.target.value })} />
              </Field>
            </Section>
          )}

          {ev.type === "camera" && (
            <Section title="Camera keyframe">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Lon">
                  <NumberInput value={ev.camera.lon} step={0.5} onChange={(v) => up({ camera: { ...ev.camera, lon: v } })} />
                </Field>
                <Field label="Lat">
                  <NumberInput value={ev.camera.lat} step={0.5} onChange={(v) => up({ camera: { ...ev.camera, lat: v } })} />
                </Field>
                <Field label="Scale">
                  <NumberInput value={ev.camera.scale} step={10} min={40} onChange={(v) => up({ camera: { ...ev.camera, scale: v } })} />
                </Field>
              </div>
              <Field label="Easing">
                <Select value={ev.easing} onChange={(v) => up({ easing: v })} options={EASINGS} />
              </Field>
              <Button variant="primary" onClick={() => up({ camera: { ...props.currentCamera } })}>
                Use current view as target
              </Button>
              <span className="text-[10px] text-zinc-500">The camera animates from the previous keyframe’s target to this one between start and end.</span>
            </Section>
          )}

          {ev.type === "territory" && (
            <>
              <Section title="Transfer">
                <Field label="To nation">
                  <NationSelect project={project} value={ev.toNation} onChange={(v) => up<TerritoryEvent>({ toNation: v })} />
                </Field>
                <Field label="Attacker / from nation (frontline direction)">
                  <NationSelect project={project} value={ev.fromNation} allowNone onChange={(v) => up<TerritoryEvent>({ fromNation: v || undefined })} />
                </Field>
                <Field label="Animation mode">
                  <Select value={ev.mode} onChange={(v) => up<TerritoryEvent>({ mode: v })} options={MODES} />
                </Field>
                {(ev.mode === "radial" || ev.mode === "auto") && (
                  <LonLatField label="Origin (optional – where the offensive starts)" value={ev.origin} optional onChange={(v) => up<TerritoryEvent>({ origin: v })} onPick={onPick} />
                )}
                {ev.mode === "linear" && (
                  <Field label="Direction of advance (° — 0 east, 90 north, -90 south)">
                    <NumberInput value={ev.direction ?? 0} step={5} onChange={(v) => up<TerritoryEvent>({ direction: v })} />
                  </Field>
                )}
                <Field label={`Frontline roughness (${(ev.roughness ?? 0.5).toFixed(2)})`}>
                  <input type="range" min={0} max={1} step={0.05} value={ev.roughness ?? 0.5} onChange={(e) => up<TerritoryEvent>({ roughness: +e.target.value })} />
                </Field>
                <Field label="Easing">
                  <Select value={ev.easing ?? "easeInOut"} onChange={(v) => up<TerritoryEvent>({ easing: v })} options={EASINGS} />
                </Field>
                <Toggle checked={ev.showFrontline !== false} onChange={(v) => up<TerritoryEvent>({ showFrontline: v })} label="Draw glowing frontline" />
                <Toggle checked={ev.clearProvinces !== false} onChange={(v) => up<TerritoryEvent>({ clearProvinces: v })} label="Country transfer clears province overrides" />
              </Section>
              <Section title={`Regions (${ev.regions.length})`}>
                <RegionList regions={ev.regions} basemap={basemap} onChange={(r) => up<TerritoryEvent>({ regions: r })} selection={selection} onSelectionChange={props.onSelectionChange} />
              </Section>
            </>
          )}

          {ev.type === "disintegrate" && (
            <>
              <Section title="Disintegration">
                <Field label="Nation that breaks apart">
                  <NationSelect project={project} value={ev.from} onChange={(v) => up<DisintegrateEvent>({ from: v })} />
                </Field>
                <Field label="Mode">
                  <Select
                    value={ev.mode}
                    onChange={(v) => up<DisintegrateEvent>({ mode: v })}
                    options={[
                      { value: "shatter", label: "Shatter (staggered)" },
                      { value: "fade", label: "Fade together" },
                      { value: "instant", label: "Instant" },
                    ]}
                  />
                </Field>
                <Toggle checked={!!ev.dissolveRemainder} onChange={(v) => up<DisintegrateEvent>({ dissolveRemainder: v })} label="Dissolve everything else the nation owned" />
                {ev.dissolveRemainder && (
                  <Field label="Remainder goes to (optional)">
                    <NationSelect project={project} value={ev.remainderNation} allowNone onChange={(v) => up<DisintegrateEvent>({ remainderNation: v || undefined })} />
                  </Field>
                )}
              </Section>
              {ev.parts.map((part, i) => (
                <Section
                  key={i}
                  title={`Successor ${i + 1}`}
                  right={
                    <Button size="xs" variant="danger" onClick={() => up<DisintegrateEvent>({ parts: ev.parts.filter((_, j) => j !== i) })}>
                      remove
                    </Button>
                  }
                >
                  <NationSelect
                    project={project}
                    value={part.nation}
                    onChange={(v) => up<DisintegrateEvent>({ parts: ev.parts.map((p, j) => (j === i ? { ...p, nation: v } : p)) })}
                  />
                  <RegionList
                    regions={part.regions}
                    basemap={basemap}
                    onChange={(r) => up<DisintegrateEvent>({ parts: ev.parts.map((p, j) => (j === i ? { ...p, regions: r } : p)) })}
                    selection={selection}
                    onSelectionChange={props.onSelectionChange}
                  />
                </Section>
              ))}
              <div className="p-3">
                <Button onClick={() => up<DisintegrateEvent>({ parts: [...ev.parts, { nation: project.nations[0]?.id ?? "", regions: Array.from(selection) }] })}>
                  + Add successor state {selection.size ? `(with ${selection.size} selected regions)` : ""}
                </Button>
              </div>
            </>
          )}

          {ev.type === "nationChange" && (
            <Section title="Nation transition">
              <Field label="Nation">
                <NationSelect project={project} value={ev.nation} onChange={(v) => up({ nation: v })} />
              </Field>
              <Field label="New name (leave empty to keep)">
                <TextInput value={ev.name ?? ""} onChange={(e) => up({ name: e.target.value || undefined })} />
              </Field>
              <Field label="New color">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!ev.color} onChange={(e) => up({ color: e.target.checked ? "#6b5313" : undefined })} />
                  {ev.color && <ColorInput value={ev.color} onChange={(c) => up({ color: c })} />}
                </div>
              </Field>
              <Field label="New flag">
                <FlagEditor value={ev.flag} onChange={(f) => up({ flag: f })} />
              </Field>
              <LonLatField label="Move label to (optional)" value={ev.labelPos} optional onChange={(v) => up({ labelPos: v })} onPick={onPick} />
              <span className="text-[10px] text-zinc-500">Color and name crossfade between start and end (e.g. Russian Empire → RSFSR).</span>
            </Section>
          )}

          {ev.type === "subtitle" && (
            <Section title="Subtitle">
              <Field label="Text">
                <TextArea value={ev.text} onChange={(e) => up({ text: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Style">
                  <Select
                    value={ev.style ?? "plain"}
                    onChange={(v) => up({ style: v })}
                    options={[
                      { value: "plain", label: "Plain (glow)" },
                      { value: "box", label: "Boxed" },
                    ]}
                  />
                </Field>
                <Field label="Position">
                  <Select
                    value={ev.position ?? "bottom"}
                    onChange={(v) => up({ position: v })}
                    options={[
                      { value: "bottom", label: "Bottom-left" },
                      { value: "top", label: "Top-center" },
                      { value: "center", label: "Center" },
                    ]}
                  />
                </Field>
              </div>
            </Section>
          )}

          {ev.type === "text" && (
            <Section title="Map text">
              <Field label="Text (multi-line ok)">
                <TextArea value={ev.text} onChange={(e) => up({ text: e.target.value })} />
              </Field>
              <LonLatField label="Anchor" value={ev.pos} onChange={(v) => up({ pos: v ?? [0, 0] })} onPick={onPick} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Size">
                  <NumberInput value={ev.size ?? 20} min={6} onChange={(v) => up({ size: v })} />
                </Field>
                <Field label="Color">
                  <ColorInput value={ev.color ?? "#ffffff"} onChange={(c) => up({ color: c })} />
                </Field>
              </div>
            </Section>
          )}

          {ev.type === "marker" && (
            <Section title="Marker">
              <Field label="Icon">
                <Select value={ev.kind} onChange={(v) => up({ kind: v })} options={MARKER_KINDS.map((m) => ({ value: m.id, label: m.label }))} />
              </Field>
              <LonLatField label="Position" value={ev.pos} onChange={(v) => up({ pos: v ?? [0, 0] })} onPick={onPick} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Size">
                  <NumberInput value={ev.size ?? 14} min={4} onChange={(v) => up({ size: v })} />
                </Field>
                <Field label="Color">
                  <ColorInput value={ev.color ?? "#ff2d55"} onChange={(c) => up({ color: c })} />
                </Field>
              </div>
              <Toggle checked={ev.pulse !== false} onChange={(v) => up({ pulse: v })} label="Pulse animation" />
              <Field label={`Extra positions (cluster) – ${ev.extra?.length ?? 0}`}>
                <div className="flex flex-wrap gap-1">
                  {(ev.extra ?? []).map((p, i) => (
                    <Chip key={i} onRemove={() => up({ extra: (ev.extra ?? []).filter((_, j) => j !== i) })}>
                      {p[0].toFixed(1)}, {p[1].toFixed(1)}
                    </Chip>
                  ))}
                  <Button size="xs" onClick={() => onPick((ll) => up({ extra: [...(ev.extra ?? []), ll] }))}>
                    + pick
                  </Button>
                </div>
              </Field>
            </Section>
          )}

          {ev.type === "flags" && (
            <Section title="Belligerent flags (top-left)">
              {(["left", "right"] as const).map((side) => (
                <div key={side} className="rounded border border-zinc-800 p-2">
                  <div className="mb-1 font-semibold text-zinc-300">{side === "left" ? "Left side" : "Right side"}</div>
                  <Field label="Label">
                    <TextInput value={side === "left" ? ev.leftLabel ?? "" : ev.rightLabel ?? ""} onChange={(e) => up(side === "left" ? { leftLabel: e.target.value } : { rightLabel: e.target.value })} />
                  </Field>
                  <Field label="Faction emblem">
                    <FlagEditor value={side === "left" ? ev.leftFaction : ev.rightFaction} onChange={(f) => up(side === "left" ? { leftFaction: f } : { rightFaction: f })} />
                  </Field>
                  <div className="mt-1 grid max-h-40 grid-cols-2 gap-x-2 overflow-auto">
                    {project.nations.map((n) => {
                      const list = side === "left" ? ev.left : ev.right;
                      const checked = list.includes(n.id);
                      return (
                        <label key={n.id} className="flex items-center gap-1 text-[11px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked ? [...list, n.id] : list.filter((x) => x !== n.id);
                              up(side === "left" ? { left: next } : { right: next });
                            }}
                          />
                          <span className="truncate">{n.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-zinc-500">First checked nation gets the large flag.</span>
                </div>
              ))}
            </Section>
          )}

          {ev.type === "inset" && (
            <Section title="Inset map">
              <Field label="Title">
                <TextInput value={ev.title ?? ""} onChange={(e) => up({ title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Lon">
                  <NumberInput value={ev.camera.lon} step={0.5} onChange={(v) => up({ camera: { ...ev.camera, lon: v } })} />
                </Field>
                <Field label="Lat">
                  <NumberInput value={ev.camera.lat} step={0.5} onChange={(v) => up({ camera: { ...ev.camera, lat: v } })} />
                </Field>
                <Field label="Scale">
                  <NumberInput value={ev.camera.scale} step={10} onChange={(v) => up({ camera: { ...ev.camera, scale: v } })} />
                </Field>
              </div>
              <Button onClick={() => up({ camera: { ...props.currentCamera } })}>Use current view</Button>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Corner">
                  <Select
                    value={ev.corner}
                    onChange={(v) => up({ corner: v })}
                    options={[
                      { value: "bottom-right", label: "Bottom-right" },
                      { value: "bottom-left", label: "Bottom-left" },
                      { value: "top-right", label: "Top-right" },
                      { value: "top-left", label: "Top-left" },
                    ]}
                  />
                </Field>
                <Field label="Width (0-1)">
                  <NumberInput value={ev.width} step={0.02} min={0.1} max={0.8} onChange={(v) => up({ width: v })} />
                </Field>
                <Field label="Height (0-1)">
                  <NumberInput value={ev.height} step={0.02} min={0.1} max={0.8} onChange={(v) => up({ height: v })} />
                </Field>
              </div>
            </Section>
          )}
        </>
      )}

      {!ev && selectedNation && (
        <NationEditor
          nation={selectedNation}
          project={project}
          basemap={basemap}
          selection={selection}
          onSelectionChange={props.onSelectionChange}
          onUpdate={(p) => props.onUpdateNation(selectedNation.id, p)}
          onDelete={() => props.onDeleteNation(selectedNation.id)}
          onPick={onPick}
        />
      )}

      {!ev && !selectedNation && selection.size === 0 && (
        <div className="p-4 text-zinc-500">
          <p className="mb-2 font-semibold text-zinc-300">Nothing selected</p>
          <ul className="list-disc space-y-1 pl-4 text-[11px]">
            <li>Click an event on the timeline to edit it.</li>
            <li>Click a nation in the left panel to edit its name, color, flag and starting territory.</li>
            <li>Click regions on the map (shift+drag to paint) and hand them to a nation with an animated frontline.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function NationEditor({
  nation,
  project,
  basemap,
  selection,
  onSelectionChange,
  onUpdate,
  onDelete,
  onPick,
}: {
  nation: Nation;
  project: ProjectDoc;
  basemap: Basemap | null;
  selection: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  onUpdate: (p: Partial<Nation>) => void;
  onDelete: () => void;
  onPick: (cb: (ll: [number, number]) => void) => void;
}) {
  const usedIn = project.events.filter((e) => (e.type === "territory" && e.toNation === nation.id) || (e.type === "nationChange" && e.nation === nation.id)).length;
  return (
    <>
      <Section
        title="Nation"
        right={
          <Button size="xs" variant="danger" onClick={onDelete}>
            delete
          </Button>
        }
      >
        <Field label="Name">
          <TextInput value={nation.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        </Field>
        <Field label="Color">
          <ColorInput value={nation.color} onChange={(c) => onUpdate({ color: c })} />
        </Field>
        <div className="flex flex-wrap gap-1">
          {NATION_COLOR_PRESETS.map((p) => (
            <button key={p.name} title={p.name} onClick={() => onUpdate({ color: p.color })} className="h-5 w-5 rounded border border-zinc-600" style={{ background: p.color }} />
          ))}
        </div>
        <Field label="Flag">
          <FlagEditor value={nation.flag} color={nation.color} onChange={(f) => onUpdate({ flag: f })} />
        </Field>
        <Field label="Note">
          <TextInput value={nation.note ?? ""} onChange={(e) => onUpdate({ note: e.target.value })} />
        </Field>
        <span className="text-[10px] text-zinc-500">
          id: <code>{nation.id}</code> · referenced by {usedIn} event(s)
        </span>
      </Section>
      <Section title={`Initial territory (${nation.regions.length})`}>
        <RegionList regions={nation.regions} basemap={basemap} onChange={(r) => onUpdate({ regions: r })} selection={selection} onSelectionChange={onSelectionChange} />
        <span className="text-[10px] text-zinc-500">Territory owned at 0:00. Later changes are made with Territory / Disintegration events.</span>
      </Section>
      <Section title="Label">
        <LonLatField label="Label position override" value={nation.labelPos} optional onChange={(v) => onUpdate({ labelPos: v })} onPick={onPick} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Label scale">
            <NumberInput value={nation.labelScale ?? 1} step={0.1} min={0.2} max={4} onChange={(v) => onUpdate({ labelScale: v })} />
          </Field>
          <Field label="Label color">
            <ColorInput value={nation.labelColor ?? "#ffffff"} onChange={(c) => onUpdate({ labelColor: c })} />
          </Field>
        </div>
        <Toggle checked={!!nation.labelHidden} onChange={(v) => onUpdate({ labelHidden: v })} label="Hide label" />
      </Section>
    </>
  );
}
