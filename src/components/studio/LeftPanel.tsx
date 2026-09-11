"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Flag, Layers, ListVideo, Package, Shapes, Trash2, Plus, Crosshair } from "lucide-react";
import { useStudio, type PanelId } from "@/store/studio";
import { PROJECTIONS, buildProjection } from "@/lib/geo/projections";
import { BORDER_YEARS } from "@/lib/geo/basemap";
import type { AssetItem, BorderYear, Granularity, LonLat, ProjectionId, Membership } from "@/lib/types";
import { uid } from "@/lib/types";
import { dateAtTime, formatDate, formatElapsed, parseDate, toISODate, timeAtDate } from "@/lib/time";
import { cameraAt, shapeAt } from "@/lib/interpolate";
import { addCameraKeyframe, addEvent, addLine, addMarker, addZone, setCamera } from "@/lib/edit";
import type { PaletteAsset } from "@/lib/assets";
import { ICONS } from "@/lib/assets";
import { Button, ColorInput, DateInput, Empty, Field, NumberInput, Row, Section, Select, Slider, TextInput, Toggle } from "./ui";
import { previewRenderer } from "./MapCanvas";

const TABS: { id: PanelId; label: string; icon: typeof Layers }[] = [
  { id: "map", label: "Map", icon: Layers },
  { id: "factions", label: "Factions", icon: Flag },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "events", label: "Events", icon: ListVideo },
  { id: "camera", label: "Camera & Time", icon: Camera },
  { id: "assets", label: "Assets", icon: Package },
];

export default function LeftPanel() {
  const panel = useStudio((s) => s.panel);
  const setPanel = useStudio((s) => s.setPanel);
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 text-slate-200">
      <div className="grid grid-cols-6 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setPanel(t.id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[9px] ${panel === t.id ? "bg-slate-800 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}
          >
            <t.icon size={15} />
            <span className="truncate">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === "map" && <MapPanel />}
        {panel === "factions" && <FactionsPanel />}
        {panel === "elements" && <ElementsPanel />}
        {panel === "events" && <EventsPanel />}
        {panel === "camera" && <CameraPanel />}
        {panel === "assets" && <AssetsPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Map
function MapPanel() {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  if (!project) return null;
  const { map } = project;
  const style = map.style;
  const setStyle = <K extends keyof typeof style>(k: K, v: (typeof style)[K]) => update((p) => void (p.map.style[k] = v));
  const setLayer = (k: keyof typeof map.layers, v: boolean) => update((p) => void (p.map.layers[k] = v));
  return (
    <>
      <Section title="Projection & detail">
        <Field label="Projection" hint={PROJECTIONS.find((p) => p.id === map.projection)?.hint}>
          <Select<ProjectionId> value={map.projection} onChange={(v) => update((p) => void (p.map.projection = v))} options={PROJECTIONS.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Row>
          <Field label="Granularity">
            <Select<Granularity>
              value={map.granularity}
              onChange={(v) => update((p) => void (p.map.granularity = v))}
              options={[
                { value: "low", label: "Low (fast)" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High (1:10m)" },
              ]}
            />
          </Field>
          <Field label="Country borders" hint={BORDER_YEARS.find((y) => y.id === map.bordersYear)?.note}>
            <Select<BorderYear>
              value={map.bordersYear}
              onChange={(v) => update((p) => void (p.map.bordersYear = v))}
              options={BORDER_YEARS.map((y) => ({ value: y.id, label: y.note ? `${y.label} (${y.note})` : y.label }))}
            />
          </Field>
        </Row>
      </Section>
      <Section title="Layers">
        {(
          [
            ["land", "Land fill"],
            ["coastline", "Coastlines"],
            ["borders", "Country borders"],
            ["provinces", "Provinces / states"],
            ["rivers", "Rivers"],
            ["lakes", "Lakes"],
            ["railroads", "Railroads"],
            ["cities", "Cities"],
            ["cityLabels", "City labels"],
            ["graticule", "Graticule"],
            ["hatch", "Paper hatch texture"],
          ] as [keyof typeof map.layers, string][]
        ).map(([k, label]) => (
          <Toggle key={k} label={label} checked={map.layers[k]} onChange={(v) => setLayer(k, v)} />
        ))}
      </Section>
      <Section title="Colours & line weights">
        <Row>
          <Field label="Ocean">
            <ColorInput value={style.ocean} onChange={(v) => setStyle("ocean", v)} />
          </Field>
          <Field label="Land">
            <ColorInput value={style.land} onChange={(v) => setStyle("land", v)} />
          </Field>
          <Field label="Coastline">
            <ColorInput value={style.coastline} onChange={(v) => setStyle("coastline", v)} />
          </Field>
          <Field label="Width">
            <NumberInput value={style.coastlineWidth} step={0.1} min={0} onChange={(v) => setStyle("coastlineWidth", v)} />
          </Field>
          <Field label="Borders">
            <ColorInput value={style.border} onChange={(v) => setStyle("border", v)} />
          </Field>
          <Field label="Width">
            <NumberInput value={style.borderWidth} step={0.1} min={0} onChange={(v) => setStyle("borderWidth", v)} />
          </Field>
          <Field label="Provinces">
            <ColorInput value={style.province} onChange={(v) => setStyle("province", v)} />
          </Field>
          <Field label="Width">
            <NumberInput value={style.provinceWidth} step={0.1} min={0} onChange={(v) => setStyle("provinceWidth", v)} />
          </Field>
          <Field label="Rivers">
            <ColorInput value={style.river} onChange={(v) => setStyle("river", v)} />
          </Field>
          <Field label="Width">
            <NumberInput value={style.riverWidth} step={0.1} min={0} onChange={(v) => setStyle("riverWidth", v)} />
          </Field>
          <Field label="Lakes">
            <ColorInput value={style.lake} onChange={(v) => setStyle("lake", v)} />
          </Field>
          <Field label="Railroads">
            <ColorInput value={style.railroad} onChange={(v) => setStyle("railroad", v)} />
          </Field>
          <Field label="Rail width">
            <NumberInput value={style.railroadWidth} step={0.1} min={0} onChange={(v) => setStyle("railroadWidth", v)} />
          </Field>
          <Field label="City dots">
            <ColorInput value={style.city} onChange={(v) => setStyle("city", v)} />
          </Field>
          <Field label="City labels">
            <ColorInput value={style.cityLabel} onChange={(v) => setStyle("cityLabel", v)} />
          </Field>
          <Field label="Graticule">
            <TextInput value={style.graticule} onChange={(v) => setStyle("graticule", v)} />
          </Field>
        </Row>
        <Field label={`City importance ≤ ${style.cityMinRank} (0 = capitals only, 10 = all)`}>
          <Slider value={style.cityMinRank} min={0} max={10} step={1} onChange={(v) => setStyle("cityMinRank", v)} />
        </Field>
        <Field label={`Faction fill opacity ${style.factionOpacity.toFixed(2)}`}>
          <Slider value={style.factionOpacity} min={0.2} max={1} onChange={(v) => setStyle("factionOpacity", v)} />
        </Field>
        <Row>
          <Field label="Hatch colour">
            <ColorInput value={style.hatchColor} onChange={(v) => setStyle("hatchColor", v)} />
          </Field>
          <Field label={`Hatch opacity ${style.hatchOpacity.toFixed(2)}`}>
            <Slider value={style.hatchOpacity} min={0} max={0.4} onChange={(v) => setStyle("hatchOpacity", v)} />
          </Field>
        </Row>
        <Field label="Font family">
          <TextInput value={style.fontFamily} onChange={(v) => setStyle("fontFamily", v)} />
        </Field>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Factions
function FactionsPanel() {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  const activeFactionId = useStudio((s) => s.activeFactionId);
  const setActiveFaction = useStudio((s) => s.setActiveFaction);
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  const select = useStudio((s) => s.select);
  const time = useStudio((s) => s.time);
  const layersLoading = useStudio((s) => s.layersLoading);
  const [filter, setFilter] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const countryNames = useMemo(() => {
    const b = previewRenderer.layers.borders;
    const set = new Set<string>();
    b?.features.forEach((f) => {
      if (f.props.NAME) set.add(String(f.props.NAME));
    });
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersLoading]);
  if (!project) return null;
  const ms = dateAtTime(project, time);
  const memberships = project.memberships.filter((m) => !filter || m.country.toLowerCase().includes(filter.toLowerCase()) || project.factions.find((f) => f.id === m.factionId)?.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Section
        title="Factions"
        right={
          <Button
            size="xs"
            onClick={() =>
              update((p) => {
                p.factions.push({ id: uid(), name: `Faction ${p.factions.length + 1}`, color: ["#b23a3a", "#2f855a", "#805ad5", "#d69e2e"][p.factions.length % 4] });
              })
            }
          >
            <Plus size={12} /> Add
          </Button>
        }
      >
        {project.factions.map((f) => (
          <div key={f.id} className={`flex items-center gap-2 rounded px-1 py-1 ${activeFactionId === f.id ? "bg-slate-800 ring-1 ring-sky-500" : ""}`}>
            <input type="radio" name="activeFaction" title="Active faction for painting" checked={activeFactionId === f.id} onChange={() => setActiveFaction(f.id)} className="accent-sky-500" />
            <input type="color" value={f.color} onChange={(e) => update((p) => void (p.factions.find((x) => x.id === f.id)!.color = e.target.value))} className="h-6 w-7 cursor-pointer rounded border border-slate-700 bg-transparent" />
            <input className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs hover:border-slate-700 focus:border-sky-500 focus:outline-none" value={f.name} onChange={(e) => update((p) => void (p.factions.find((x) => x.id === f.id)!.name = e.target.value))} />
            <button title="Hatch pattern" onClick={() => update((p) => void (p.factions.find((x) => x.id === f.id)!.hatch = !f.hatch))} className={`rounded px-1 text-[10px] ${f.hatch ? "bg-sky-700 text-white" : "text-slate-500 hover:text-slate-200"}`}>
              ///
            </button>
            <button title="Edit" onClick={() => select({ type: "faction", id: f.id })} className="text-slate-500 hover:text-slate-200">
              <Crosshair size={12} />
            </button>
          </div>
        ))}
        <Button variant={mode === "paint" ? "primary" : "default"} className="w-full" onClick={() => setMode(mode === "paint" ? "navigate" : "paint")}>
          {mode === "paint" ? "Painting countries – click the map" : "Paint countries with active faction (P)"}
        </Button>
        <p className="text-[10px] text-slate-500">Click a country at the current date ({formatDate(ms, "D MMM YYYY")}) to make it join the active faction from that date; shift-click makes it neutral. Colonies follow their ruling power automatically.</p>
      </Section>
      <Section title={`Memberships (${project.memberships.length})`}>
        <div className="flex gap-1">
          <input list="country-names" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" placeholder="Country name…" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} />
          <datalist id="country-names">
            {countryNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Button
            size="xs"
            disabled={!newCountry || !activeFactionId}
            onClick={() => {
              update((p) => p.memberships.push({ id: uid(), country: newCountry, factionId: activeFactionId!, from: toISODate(ms), includeSubjects: true }));
              setNewCountry("");
            }}
          >
            <Plus size={12} />
          </Button>
        </div>
        <TextInput value={filter} onChange={setFilter} placeholder="Filter…" />
        <div className="space-y-1">
          {memberships.map((m) => (
            <MembershipRow key={m.id} m={m} />
          ))}
          {!memberships.length && <Empty>No memberships. Use paint mode or add a country above.</Empty>}
        </div>
      </Section>
    </>
  );
}

function MembershipRow({ m }: { m: Membership }) {
  const project = useStudio((s) => s.project)!;
  const update = useStudio((s) => s.update);
  const set = (fn: (x: Membership) => void) => update((p) => fn(p.memberships.find((x) => x.id === m.id)!));
  const faction = project.factions.find((f) => f.id === m.factionId);
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 p-1.5 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: faction?.color ?? "#666" }} />
        <span className="flex-1 truncate font-medium" title={m.country}>
          {m.country}
        </span>
        <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]" value={m.factionId} onChange={(e) => set((x) => (x.factionId = e.target.value))}>
          {project.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button className="text-slate-500 hover:text-red-400" onClick={() => update((p) => void (p.memberships = p.memberships.filter((x) => x.id !== m.id)))}>
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <DateInput value={m.from} onChange={(v) => set((x) => (x.from = v))} allowEmpty />
        <DateInput value={m.to} onChange={(v) => set((x) => (x.to = v))} allowEmpty />
      </div>
      <label className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
        <input type="checkbox" checked={m.includeSubjects} onChange={(e) => set((x) => (x.includeSubjects = e.target.checked))} /> include colonies / subject territories
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- Elements
function ElementsPanel() {
  const project = useStudio((s) => s.project);
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const setTime = useStudio((s) => s.setTime);
  if (!project) return null;
  const goto = (date?: string) => date && setTime(timeAtDate(project, parseDate(date)));
  const tools: { m: typeof mode; label: string; key: string }[] = [
    { m: "drawZone", label: "Occupation zone", key: "Z" },
    { m: "drawLine", label: "Front line", key: "L" },
    { m: "drawArrow", label: "Offensive arrow", key: "A" },
    { m: "placeMarker", label: "Battle marker", key: "M" },
    { m: "placeLabel", label: "Label / counter", key: "T" },
  ];
  const list = <T extends { id: string }>(title: string, type: "zone" | "line" | "marker" | "label" | "arrow", items: T[], name: (x: T) => string, color: (x: T) => string, date: (x: T) => string | undefined) => (
    <Section title={`${title} (${items.length})`}>
      {items.map((x) => {
        const isSel = selection?.type === type && selection.id === x.id;
        return (
          <button
            key={x.id}
            onClick={() => {
              select({ type, id: x.id });
              if (!isSel) goto(date(x));
            }}
            className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] ${isSel ? "bg-sky-900/60 text-white" : "hover:bg-slate-800"}`}
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(x) }} />
            <span className="truncate">{name(x)}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{date(x)?.slice(0, 10)}</span>
          </button>
        );
      })}
      {!items.length && <Empty>None yet – use the tools above.</Empty>}
    </Section>
  );
  const fcolor = (id: string) => project.factions.find((f) => f.id === id)?.color ?? "#888";
  return (
    <>
      <Section title="Add to map">
        <div className="grid grid-cols-1 gap-1">
          {tools.map((t) => (
            <Button key={t.m} variant={mode === t.m ? "primary" : "default"} onClick={() => setMode(mode === t.m ? "navigate" : t.m)} className="justify-between">
              <span>{t.label}</span>
              <kbd className="rounded bg-slate-700/60 px-1 text-[10px]">{t.key}</kbd>
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">Zones and fronts are keyframed: move the playhead to a later date, drag vertices, and the shape morphs automatically between keyframes.</p>
      </Section>
      {list("Zones", "zone", project.zones, (z) => z.name, (z) => fcolor(z.factionId), (z) => z.keyframes[0]?.date)}
      {list("Front lines", "line", project.lines, (l) => l.name, (l) => l.color, (l) => l.from ?? l.keyframes[0]?.date)}
      {list("Arrows", "arrow", project.arrows, (a) => a.name, (a) => a.color, (a) => a.start)}
      {list("Markers", "marker", project.markers, (m) => m.name, (m) => m.color, (m) => m.from)}
      {list("Labels & counters", "label", project.labels, (l) => l.text, () => "#e2e8f0", (l) => l.from)}
    </>
  );
}

// ---------------------------------------------------------------- Events
function EventsPanel() {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  const select = useStudio((s) => s.select);
  const selection = useStudio((s) => s.selection);
  const setTime = useStudio((s) => s.setTime);
  const time = useStudio((s) => s.time);
  if (!project) return null;
  const ms = dateAtTime(project, time);
  const events = [...project.events].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return (
    <Section
      title={`Subtitled events (${events.length})`}
      right={
        <Button
          size="xs"
          onClick={() => {
            let created = "";
            update((p) => {
              created = addEvent(p, ms).id;
            });
            select({ type: "event", id: created });
          }}
        >
          <Plus size={12} /> At current date
        </Button>
      }
    >
      <p className="text-[10px] text-slate-500">Each event is shown as a subtitle from its date until the next event (or its duration). Select one to edit text, style and duration.</p>
      {events.map((e) => {
        const isSel = selection?.type === "event" && selection.id === e.id;
        return (
          <button
            key={e.id}
            onClick={() => {
              select({ type: "event", id: e.id });
              setTime(timeAtDate(project, parseDate(e.date)));
            }}
            className={`block w-full rounded px-1.5 py-1 text-left text-[11px] ${isSel ? "bg-sky-900/60 text-white" : "hover:bg-slate-800"}`}
          >
            <span className="mr-2 font-mono text-[10px] text-amber-300">{e.date}</span>
            <span className={e.style === "headline" ? "font-semibold" : ""}>{e.text}</span>
          </button>
        );
      })}
      {!events.length && <Empty>No events yet.</Empty>}
    </Section>
  );
}

// ---------------------------------------------------------------- Camera & time
function CameraPanel() {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  const time = useStudio((s) => s.time);
  const setTime = useStudio((s) => s.setTime);
  const select = useStudio((s) => s.select);
  const selection = useStudio((s) => s.selection);
  if (!project) return null;
  const ms = dateAtTime(project, time);
  const cam = cameraAt(project.camera.keyframes, ms);

  const frameAll = () => {
    // automation: fit all zones/lines/markers active now
    const pts: LonLat[] = [];
    for (const z of project.zones) {
      const s = shapeAt(z.keyframes, ms, true);
      if (s) pts.push(...s);
    }
    for (const l of project.lines) {
      const s = shapeAt(l.keyframes, ms, false);
      if (s) pts.push(...s);
    }
    for (const m of project.markers) pts.push(m.position);
    if (pts.length < 2) return;
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const center: LonLat = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    const W = project.video.width;
    const H = project.video.height;
    let lo = 0.5;
    let hi = 300;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const proj = buildProjection(project.map.projection, W, H, { center, zoom: mid, roll: 0 });
      const fits = pts.every((p) => {
        const q = proj(p);
        return q && q[0] > W * 0.06 && q[0] < W * 0.94 && q[1] > H * 0.08 && q[1] < H * 0.92;
      });
      if (fits) lo = mid;
      else hi = mid;
    }
    update((p) => setCamera(p, { center, zoom: lo, roll: 0 }, ms));
  };

  return (
    <>
      <Section title="Video">
        <Row cols={3}>
          <Field label="Width">
            <NumberInput value={project.video.width} step={2} min={320} onChange={(v) => update((p) => void (p.video.width = Math.round(v)))} />
          </Field>
          <Field label="Height">
            <NumberInput value={project.video.height} step={2} min={180} onChange={(v) => update((p) => void (p.video.height = Math.round(v)))} />
          </Field>
          <Field label="FPS">
            <NumberInput value={project.video.fps} step={1} min={1} max={60} onChange={(v) => update((p) => void (p.video.fps = Math.round(v)))} />
          </Field>
        </Row>
        <div className="flex flex-wrap gap-1">
          {[
            ["1080p", 1920, 1080],
            ["720p", 1280, 720],
            ["4K", 3840, 2160],
            ["Square", 1080, 1080],
            ["Vertical", 1080, 1920],
          ].map(([l, w, h]) => (
            <Button key={l as string} size="xs" onClick={() => update((p) => void ((p.video.width = w as number), (p.video.height = h as number)))}>
              {l}
            </Button>
          ))}
        </div>
        <Field label={`Duration (s) – ${formatElapsed(project.video.duration)}`}>
          <NumberInput value={project.video.duration} step={1} min={1} onChange={(v) => update((p) => void (p.video.duration = Math.max(1, v)))} />
        </Field>
      </Section>
      <Section title="Historical time range">
        <Row>
          <Field label="Start date">
            <DateInput value={project.time.start} onChange={(v) => v && update((p) => void (p.time.start = v))} />
          </Field>
          <Field label="End date">
            <DateInput value={project.time.end} onChange={(v) => v && update((p) => void (p.time.end = v))} />
          </Field>
        </Row>
      </Section>
      <Section
        title="Pacing (video time → date)"
        right={
          <Button size="xs" onClick={() => update((p) => void p.time.pacing.push({ t: Math.round(time * 10) / 10, date: toISODate(ms) }))}>
            <Plus size={12} /> At playhead
          </Button>
        }
      >
        <p className="text-[10px] text-slate-500">Slow down or speed up history: each row pins a video second to a date. Linear between rows.</p>
        {[...project.time.pacing]
          .sort((a, b) => a.t - b.t)
          .map((pt) => {
            const idx = project.time.pacing.indexOf(pt);
            return (
              <div key={idx} className="flex items-center gap-1">
                <NumberInput value={pt.t} step={0.5} min={0} onChange={(v) => update((p) => void (p.time.pacing[idx].t = v))} />
                <DateInput value={pt.date} onChange={(v) => v && update((p) => void (p.time.pacing[idx].date = v))} />
                <button className="text-slate-500 hover:text-red-400" onClick={() => update((p) => void p.time.pacing.splice(idx, 1))}>
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        {!project.time.pacing.length && <Empty>Linear pacing (start → end).</Empty>}
      </Section>
      <Section
        title={`Camera keyframes (${project.camera.keyframes.length})`}
        right={
          <Button size="xs" onClick={() => update((p) => void addCameraKeyframe(p, ms))}>
            <Plus size={12} /> At current date
          </Button>
        }
      >
        <div className="rounded bg-slate-950/60 p-2 font-mono text-[10px] text-slate-400">
          now: {cam.center[1].toFixed(2)}°, {cam.center[0].toFixed(2)}° · zoom {cam.zoom.toFixed(2)}
        </div>
        <Button className="w-full" onClick={frameAll}>
          Auto-frame active elements
        </Button>
        <p className="text-[10px] text-slate-500">Panning / zooming the preview edits the keyframe active at the playhead. Add keyframes to create smooth camera moves.</p>
        {[...project.camera.keyframes]
          .map((k, i) => ({ k, i }))
          .sort((a, b) => parseDate(a.k.date) - parseDate(b.k.date))
          .map(({ k, i }) => {
            const isSel = selection?.type === "camera" && selection.id === String(i);
            return (
              <button
                key={i}
                onClick={() => {
                  select({ type: "camera", id: String(i) });
                  setTime(timeAtDate(project, parseDate(k.date)));
                }}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] ${isSel ? "bg-sky-900/60 text-white" : "hover:bg-slate-800"}`}
              >
                <span className="font-mono text-amber-300">{k.date}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-400">
                  {k.center[1].toFixed(1)}°,{k.center[0].toFixed(1)}° ×{k.zoom.toFixed(1)}
                </span>
              </button>
            );
          })}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Assets
function AssetsPanel() {
  const project = useStudio((s) => s.project);
  const update = useStudio((s) => s.update);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const setStatus = useStudio((s) => s.setStatus);
  const time = useStudio((s) => s.time);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((rows: AssetItem[]) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);
  if (!project) return null;
  const ms = dateAtTime(project, time);
  const cam = cameraAt(project.camera.keyframes, ms);
  const byCat = (c: AssetItem["category"]) => items.filter((i) => i.category === c);

  const applyPalette = (pal: PaletteAsset) => {
    update((p) => {
      pal.factions.forEach((f, i) => {
        if (p.factions[i]) p.factions[i].color = f.color;
        else p.factions.push({ id: uid(), name: f.name, color: f.color });
      });
      p.map.style.ocean = pal.ocean;
      p.map.style.lake = pal.ocean;
      p.map.style.land = pal.land;
      p.map.style.border = pal.border;
      p.map.style.province = pal.province;
      p.map.style.river = pal.river;
      p.map.style.coastline = pal.coastline;
    });
    setStatus("Palette applied.");
  };

  const savePalette = async () => {
    const data: PaletteAsset = {
      factions: project.factions.map((f) => ({ name: f.name, color: f.color })),
      ocean: project.map.style.ocean,
      land: project.map.style.land,
      border: project.map.style.border,
      province: project.map.style.province,
      river: project.map.style.river,
      coastline: project.map.style.coastline,
    };
    const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "palette", name: `${project.name} palette`, description: "Saved from the studio", data }) });
    if (res.ok) {
      const row = (await res.json()) as AssetItem;
      setItems((xs) => [...xs, row]);
      setStatus("Palette saved to the asset library.");
    }
  };

  return (
    <>
      {loading && <div className="p-3 text-xs text-slate-500">Loading asset library…</div>}
      <Section title="Colour palettes" right={<Button size="xs" onClick={savePalette}>Save current</Button>}>
        {byCat("palette").map((a) => {
          const pal = a.data as unknown as PaletteAsset;
          return (
            <button key={a.id} onClick={() => applyPalette(pal)} className="block w-full rounded border border-slate-800 p-2 text-left hover:border-sky-600" title={a.description}>
              <div className="mb-1 flex gap-1">
                {pal.factions.map((f, i) => (
                  <span key={i} className="h-4 flex-1 rounded-sm" style={{ background: f.color }} />
                ))}
                <span className="h-4 w-4 rounded-sm border border-slate-600" style={{ background: pal.ocean }} />
              </div>
              <div className="text-[11px]">{a.name}</div>
            </button>
          );
        })}
      </Section>
      <Section title="Marker icons">
        <div className="grid grid-cols-5 gap-1">
          {byCat("icon").map((a) => {
            const iconId = String(a.data.icon) as keyof typeof ICONS;
            const icon = ICONS[iconId];
            if (!icon) return null;
            return (
              <button
                key={a.id}
                title={`${a.name} – click to ${selection?.type === "marker" ? "apply to the selected marker" : "add a marker at the view centre"}`}
                onClick={() => {
                  if (selection?.type === "marker") update((p) => void (p.markers.find((m) => m.id === selection.id)!.icon = iconId));
                  else {
                    let created = "";
                    update((p) => {
                      created = addMarker(p, cam.center, ms, iconId).id;
                    });
                    select({ type: "marker", id: created });
                  }
                }}
                className="flex aspect-square items-center justify-center rounded border border-slate-800 hover:border-sky-600"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill={icon.stroke ? "none" : "#e2e8f0"} stroke="#e2e8f0" strokeWidth={icon.stroke ? 1.8 : 0}>
                  <path d={icon.d} strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Front line styles">
        {byCat("lineStyle").map((a) => (
          <button
            key={a.id}
            disabled={selection?.type !== "line"}
            title={selection?.type === "line" ? a.description : "Select a front line first"}
            onClick={() => update((p) => Object.assign(p.lines.find((l) => l.id === selection!.id)!, a.data))}
            className="flex w-full items-center gap-2 rounded border border-slate-800 px-2 py-1 text-left text-[11px] hover:border-sky-600 disabled:opacity-40"
          >
            <span className="h-1 w-10 rounded" style={{ background: String(a.data.color) }} />
            {a.name}
          </button>
        ))}
      </Section>
      <Section title="Arrow styles">
        {byCat("arrowStyle").map((a) => (
          <button
            key={a.id}
            disabled={selection?.type !== "arrow"}
            title={selection?.type === "arrow" ? a.description : "Select an arrow first"}
            onClick={() => update((p) => Object.assign(p.arrows.find((l) => l.id === selection!.id)!, a.data))}
            className="flex w-full items-center gap-2 rounded border border-slate-800 px-2 py-1 text-left text-[11px] hover:border-sky-600 disabled:opacity-40"
          >
            <span className="h-2 w-10 rounded" style={{ background: String(a.data.color) }} />
            {a.name}
          </button>
        ))}
      </Section>
      <Section title="Shape presets">
        {byCat("shape").map((a) => {
          const d = a.data as unknown as { closed: boolean; points: LonLat[] };
          return (
            <button
              key={a.id}
              title={a.description}
              onClick={() => {
                const relative = d.points.every((p) => Math.abs(p[0]) < 3 && Math.abs(p[1]) < 3);
                const pts: LonLat[] = relative ? d.points.map((p) => [cam.center[0] + p[0], cam.center[1] + p[1]]) : d.points.map((p) => [p[0], p[1]]);
                let created = "";
                update((p) => {
                  created = d.closed ? addZone(p, pts, useStudio.getState().activeFactionId ?? p.factions[0]?.id ?? "", ms, a.name).id : addLine(p, pts, ms, a.name).id;
                });
                select({ type: d.closed ? "zone" : "line", id: created });
              }}
              className="block w-full rounded border border-slate-800 px-2 py-1 text-left text-[11px] hover:border-sky-600"
            >
              {a.name} <span className="text-slate-500">· {d.closed ? "zone" : "line"}</span>
            </button>
          );
        })}
      </Section>
    </>
  );
}
