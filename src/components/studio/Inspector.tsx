"use client";

import { Copy, Trash2, Plus, Crosshair } from "lucide-react";
import { useStudio } from "@/store/studio";
import type { Arrow, Easing, FrontLine, IconId, Label, Marker, NumberFormat, Project, Selection, TimelineEvent, Zone } from "@/lib/types";
import { dateAtTime, parseDate, timeAtDate, toISODate } from "@/lib/time";
import { ICONS } from "@/lib/assets";
import { Button, ColorInput, DateInput, Empty, Field, NumberInput, Row, Section, Select, Slider, TextInput, Toggle } from "./ui";
import { addKeyframeNow, deleteSelection, duplicateSelection } from "./actions";

const EASINGS: { value: Easing; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "easeInOut", label: "Ease in-out" },
  { value: "easeOut", label: "Ease out" },
  { value: "easeIn", label: "Ease in" },
  { value: "step", label: "Step (jump)" },
];

export default function Inspector() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  if (!project) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{selection ? `${selection.type} properties` : "Project & overlays"}</h2>
        {selection && selection.type !== "faction" && selection.type !== "membership" && (
          <div className="flex gap-1">
            {selection.type !== "camera" && (
              <Button size="xs" variant="ghost" title="Duplicate" onClick={duplicateSelection}>
                <Copy size={12} />
              </Button>
            )}
            <Button size="xs" variant="danger" title="Delete (Del)" onClick={deleteSelection}>
              <Trash2 size={12} />
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selection && <ProjectInspector project={project} />}
        {selection?.type === "zone" && <ZoneInspector project={project} sel={selection} />}
        {selection?.type === "line" && <LineInspector project={project} sel={selection} />}
        {selection?.type === "label" && <LabelInspector project={project} sel={selection} />}
        {selection?.type === "marker" && <MarkerInspector project={project} sel={selection} />}
        {selection?.type === "arrow" && <ArrowInspector project={project} sel={selection} />}
        {selection?.type === "event" && <EventInspector project={project} sel={selection} />}
        {selection?.type === "camera" && <CameraInspector project={project} sel={selection} />}
        {selection?.type === "faction" && <FactionInspector project={project} sel={selection} />}
      </div>
    </div>
  );
}

function useEdit<T>(pick: (p: Project) => T | undefined) {
  const update = useStudio((s) => s.update);
  return (fn: (x: T) => void, transient = false) =>
    update(
      (p) => {
        const x = pick(p);
        if (x) fn(x);
      },
      { transient },
    );
}

function KeyframeList({ el, sel }: { el: Zone | FrontLine; sel: Selection }) {
  const project = useStudio((s) => s.project)!;
  const time = useStudio((s) => s.time);
  const setTime = useStudio((s) => s.setTime);
  const update = useStudio((s) => s.update);
  const ms = dateAtTime(project, time);
  const kfs = [...el.keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const counts = new Set(el.keyframes.map((k) => k.points.length));
  return (
    <Section
      title={`Shape keyframes (${kfs.length})`}
      right={
        <Button size="xs" onClick={addKeyframeNow} title="Duplicate the current (interpolated) shape as a keyframe at the playhead date (K)">
          <Plus size={12} /> At playhead
        </Button>
      }
    >
      <p className="text-[10px] text-slate-500">
        {counts.size === 1 ? `All keyframes have ${[...counts][0]} vertices → exact vertex-to-vertex morphing.` : "Keyframes have different vertex counts → shapes are resampled and morphed automatically."}
      </p>
      {kfs.map((k) => {
        const idx = el.keyframes.indexOf(k);
        const active = parseDate(k.date) === ms;
        return (
          <div key={idx} className={`flex items-center gap-1 rounded px-1 py-0.5 ${active ? "bg-sky-900/50" : ""}`}>
            <button title="Go to keyframe" className="text-slate-400 hover:text-sky-300" onClick={() => setTime(timeAtDate(project, parseDate(k.date)))}>
              <Crosshair size={12} />
            </button>
            <DateInput value={k.date} onChange={(v) => v && update((p) => void ((sel.type === "zone" ? p.zones : p.lines).find((z) => z.id === sel.id)!.keyframes[idx].date = v))} />
            <select
              className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
              value={k.easing ?? "linear"}
              onChange={(e) => update((p) => void ((sel.type === "zone" ? p.zones : p.lines).find((z) => z.id === sel.id)!.keyframes[idx].easing = e.target.value as Easing))}
            >
              {EASINGS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <span className="w-8 text-right font-mono text-[10px] text-slate-500">{k.points.length}</span>
            <button
              className="text-slate-500 hover:text-red-400 disabled:opacity-30"
              disabled={el.keyframes.length <= 1}
              onClick={() => update((p) => void (sel.type === "zone" ? p.zones : p.lines).find((z) => z.id === sel.id)!.keyframes.splice(idx, 1))}
            >
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
    </Section>
  );
}

function ZoneInspector({ project, sel }: { project: Project; sel: Selection }) {
  const z = project.zones.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.zones.find((x) => x.id === sel.id));
  if (!z) return <Empty>Zone not found.</Empty>;
  return (
    <>
      <Section title="Zone">
        <Field label="Name">
          <TextInput value={z.name} onChange={(v) => edit((x) => (x.name = v))} />
        </Field>
        <Field label="Faction (fill colour)">
          <Select value={z.factionId} onChange={(v) => edit((x) => (x.factionId = v))} options={project.factions.map((f) => ({ value: f.id, label: f.name }))} />
        </Field>
        <Field label={`Opacity ${z.opacity.toFixed(2)}`}>
          <Slider value={z.opacity} min={0.1} max={1} onChange={(v) => edit((x) => (x.opacity = v), true)} />
        </Field>
        <Toggle label="Draw front outline" checked={z.outline} onChange={(v) => edit((x) => (x.outline = v))} />
        <Row>
          <Field label="Outline colour" hint="blank = auto">
            <TextInput value={z.outlineColor ?? ""} onChange={(v) => edit((x) => (x.outlineColor = v || undefined))} placeholder="auto" mono />
          </Field>
          <Field label="Outline width">
            <NumberInput value={z.outlineWidth} step={0.2} min={0} onChange={(v) => edit((x) => (x.outlineWidth = v))} />
          </Field>
        </Row>
        <Row>
          <Field label="Visible from" hint="blank = first keyframe">
            <DateInput value={z.from} onChange={(v) => edit((x) => (x.from = v))} allowEmpty />
          </Field>
          <Field label="Visible until" hint="blank = end">
            <DateInput value={z.to} onChange={(v) => edit((x) => (x.to = v))} allowEmpty />
          </Field>
        </Row>
      </Section>
      <KeyframeList el={z} sel={sel} />
    </>
  );
}

function LineInspector({ project, sel }: { project: Project; sel: Selection }) {
  const l = project.lines.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.lines.find((x) => x.id === sel.id));
  if (!l) return <Empty>Line not found.</Empty>;
  return (
    <>
      <Section title="Front line">
        <Field label="Name">
          <TextInput value={l.name} onChange={(v) => edit((x) => (x.name = v))} />
        </Field>
        <Row>
          <Field label="Colour">
            <ColorInput value={l.color} onChange={(v) => edit((x) => (x.color = v))} />
          </Field>
          <Field label="Width">
            <NumberInput value={l.width} step={0.5} min={0.5} onChange={(v) => edit((x) => (x.width = v))} />
          </Field>
        </Row>
        <Field label="Dash pattern" hint="e.g. 8,5 – blank = solid">
          <TextInput value={l.dash.join(",")} onChange={(v) => edit((x) => (x.dash = v.split(",").map((s) => parseFloat(s)).filter((n) => isFinite(n) && n > 0)))} mono />
        </Field>
        <Toggle label="Glow" checked={l.glow} onChange={(v) => edit((x) => (x.glow = v))} />
        <Row>
          <Field label="Visible from">
            <DateInput value={l.from} onChange={(v) => edit((x) => (x.from = v))} allowEmpty />
          </Field>
          <Field label="Visible until">
            <DateInput value={l.to} onChange={(v) => edit((x) => (x.to = v))} allowEmpty />
          </Field>
        </Row>
      </Section>
      <KeyframeList el={l} sel={sel} />
    </>
  );
}

function LabelInspector({ project, sel }: { project: Project; sel: Selection }) {
  const l = project.labels.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.labels.find((x) => x.id === sel.id));
  const time = useStudio((s) => s.time);
  const ms = dateAtTime(project, time);
  if (!l) return <Empty>Label not found.</Empty>;
  const vk = [...(l.valueKeyframes ?? [])].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return (
    <>
      <Section title="Label / counter">
        <Field label="Text" hint="use {value} to embed the counter">
          <TextInput value={l.text} onChange={(v) => edit((x) => (x.text = v))} />
        </Field>
        <Row>
          <Field label="Longitude">
            <NumberInput value={l.position[0]} step={0.1} onChange={(v) => edit((x) => (x.position = [v, x.position[1]]))} />
          </Field>
          <Field label="Latitude">
            <NumberInput value={l.position[1]} step={0.1} onChange={(v) => edit((x) => (x.position = [x.position[0], v]))} />
          </Field>
          <Field label="Rotation °">
            <NumberInput value={l.rotation} step={5} onChange={(v) => edit((x) => (x.rotation = v))} />
          </Field>
          <Field label="Font size">
            <NumberInput value={l.fontSize} step={1} min={6} onChange={(v) => edit((x) => (x.fontSize = v))} />
          </Field>
          <Field label="Colour">
            <ColorInput value={l.color} onChange={(v) => edit((x) => (x.color = v))} />
          </Field>
          <Field label="Outline" hint="css colour or none">
            <TextInput value={l.outline} onChange={(v) => edit((x) => (x.outline = v))} mono />
          </Field>
        </Row>
        <Toggle label="Bold" checked={l.bold} onChange={(v) => edit((x) => (x.bold = v))} />
        <Field label="Number format">
          <Select<NumberFormat>
            value={l.numberFormat}
            onChange={(v) => edit((x) => (x.numberFormat = v))}
            options={[
              { value: "dot", label: "1.234.567" },
              { value: "comma", label: "1,234,567" },
              { value: "space", label: "1 234 567" },
              { value: "compact", label: "1.23M" },
              { value: "none", label: "1234567" },
            ]}
          />
        </Field>
        <Row>
          <Field label="Visible from">
            <DateInput value={l.from} onChange={(v) => edit((x) => (x.from = v))} allowEmpty />
          </Field>
          <Field label="Visible until">
            <DateInput value={l.to} onChange={(v) => edit((x) => (x.to = v))} allowEmpty />
          </Field>
        </Row>
      </Section>
      <Section
        title={`Counter values (${vk.length})`}
        right={
          <Button
            size="xs"
            onClick={() =>
              edit((x) => {
                x.valueKeyframes = [...(x.valueKeyframes ?? []), { date: toISODate(ms), value: x.valueKeyframes?.length ? x.valueKeyframes[x.valueKeyframes.length - 1].value : 100000 }];
              })
            }
          >
            <Plus size={12} /> At playhead
          </Button>
        }
      >
        <p className="text-[10px] text-slate-500">Values interpolate linearly between dates – e.g. troop strength counters.</p>
        {vk.map((k) => {
          const idx = (l.valueKeyframes ?? []).indexOf(k);
          return (
            <div key={idx} className="flex items-center gap-1">
              <DateInput value={k.date} onChange={(v) => v && edit((x) => (x.valueKeyframes![idx].date = v))} />
              <NumberInput value={k.value} step={1000} onChange={(v) => edit((x) => (x.valueKeyframes![idx].value = v))} />
              <button className="text-slate-500 hover:text-red-400" onClick={() => edit((x) => void x.valueKeyframes!.splice(idx, 1))}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </Section>
    </>
  );
}

function MarkerInspector({ project, sel }: { project: Project; sel: Selection }) {
  const m = project.markers.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.markers.find((x) => x.id === sel.id));
  if (!m) return <Empty>Marker not found.</Empty>;
  return (
    <Section title="Marker">
      <Field label="Name">
        <TextInput value={m.name} onChange={(v) => edit((x) => (x.name = v))} />
      </Field>
      <Field label="Icon">
        <Select<IconId> value={m.icon} onChange={(v) => edit((x) => (x.icon = v))} options={Object.entries(ICONS).map(([k, v]) => ({ value: k as IconId, label: v.name }))} />
      </Field>
      <Row>
        <Field label="Longitude">
          <NumberInput value={m.position[0]} step={0.1} onChange={(v) => edit((x) => (x.position = [v, x.position[1]]))} />
        </Field>
        <Field label="Latitude">
          <NumberInput value={m.position[1]} step={0.1} onChange={(v) => edit((x) => (x.position = [x.position[0], v]))} />
        </Field>
        <Field label="Size">
          <NumberInput value={m.size} step={2} min={6} onChange={(v) => edit((x) => (x.size = v))} />
        </Field>
        <Field label="Colour">
          <ColorInput value={m.color} onChange={(v) => edit((x) => (x.color = v))} />
        </Field>
        <Field label="From">
          <DateInput value={m.from} onChange={(v) => edit((x) => (x.from = v))} allowEmpty />
        </Field>
        <Field label="Until">
          <DateInput value={m.to} onChange={(v) => edit((x) => (x.to = v))} allowEmpty />
        </Field>
      </Row>
      <Field label="Animation">
        <Select<Marker["animation"]>
          value={m.animation}
          onChange={(v) => edit((x) => (x.animation = v))}
          options={[
            { value: "pulse", label: "Pulse" },
            { value: "blink", label: "Blink" },
            { value: "none", label: "None" },
          ]}
        />
      </Field>
      <Row>
        <Field label="Label">
          <TextInput value={m.label ?? ""} onChange={(v) => edit((x) => (x.label = v))} />
        </Field>
        <Field label="Label position">
          <Select<Marker["labelPosition"]>
            value={m.labelPosition}
            onChange={(v) => edit((x) => (x.labelPosition = v))}
            options={[
              { value: "below", label: "Below" },
              { value: "right", label: "Right" },
              { value: "above", label: "Above" },
            ]}
          />
        </Field>
      </Row>
    </Section>
  );
}

function ArrowInspector({ project, sel }: { project: Project; sel: Selection }) {
  const a = project.arrows.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.arrows.find((x) => x.id === sel.id));
  if (!a) return <Empty>Arrow not found.</Empty>;
  const num = (k: keyof Arrow, i: 0 | 1) => (v: number) => edit((x) => ((x[k] as [number, number])[i] = v));
  return (
    <Section title="Arrow">
      <Field label="Name">
        <TextInput value={a.name} onChange={(v) => edit((x) => (x.name = v))} />
      </Field>
      <Row cols={4}>
        <Field label="From lon">
          <NumberInput value={a.from[0]} step={0.1} onChange={num("from", 0)} />
        </Field>
        <Field label="From lat">
          <NumberInput value={a.from[1]} step={0.1} onChange={num("from", 1)} />
        </Field>
        <Field label="To lon">
          <NumberInput value={a.to[0]} step={0.1} onChange={num("to", 0)} />
        </Field>
        <Field label="To lat">
          <NumberInput value={a.to[1]} step={0.1} onChange={num("to", 1)} />
        </Field>
      </Row>
      <Field label={`Curve ${a.curve.toFixed(2)}`}>
        <Slider value={a.curve} min={-0.6} max={0.6} onChange={(v) => edit((x) => (x.curve = v), true)} />
      </Field>
      <Row>
        <Field label="Colour">
          <ColorInput value={a.color} onChange={(v) => edit((x) => (x.color = v))} />
        </Field>
        <Field label="Width">
          <NumberInput value={a.width} step={1} min={1} onChange={(v) => edit((x) => (x.width = v))} />
        </Field>
      </Row>
      <Row cols={3}>
        <Field label="Starts">
          <DateInput value={a.start} onChange={(v) => v && edit((x) => (x.start = v))} />
        </Field>
        <Field label="Fully drawn">
          <DateInput value={a.end} onChange={(v) => v && edit((x) => (x.end = v))} />
        </Field>
        <Field label="Fades after">
          <DateInput value={a.holdUntil} onChange={(v) => edit((x) => (x.holdUntil = v))} allowEmpty />
        </Field>
      </Row>
      <Toggle label="Arrow head" checked={a.head} onChange={(v) => edit((x) => (x.head = v))} />
      <Toggle label="Dashed" checked={a.dash} onChange={(v) => edit((x) => (x.dash = v))} />
    </Section>
  );
}

function EventInspector({ project, sel }: { project: Project; sel: Selection }) {
  const e = project.events.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.events.find((x) => x.id === sel.id));
  if (!e) return <Empty>Event not found.</Empty>;
  return (
    <Section title="Event / subtitle">
      <Field label="Date">
        <DateInput value={e.date} onChange={(v) => v && edit((x) => (x.date = v))} />
      </Field>
      <Field label="Text">
        <textarea className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" rows={3} value={e.text} onChange={(ev) => edit((x) => (x.text = ev.target.value))} />
      </Field>
      <Row>
        <Field label="Style">
          <Select<TimelineEvent["style"]>
            value={e.style}
            onChange={(v) => edit((x) => (x.style = v))}
            options={[
              { value: "subtitle", label: "Subtitle" },
              { value: "headline", label: "Headline (centered)" },
            ]}
          />
        </Field>
        <Field label="Max duration (days)" hint="blank = 45">
          <NumberInput value={e.durationDays ?? 45} step={1} min={1} onChange={(v) => edit((x) => (x.durationDays = v))} />
        </Field>
      </Row>
    </Section>
  );
}

function CameraInspector({ project, sel }: { project: Project; sel: Selection }) {
  const idx = Number(sel.id);
  const k = project.camera.keyframes[idx];
  const edit = useEdit((p) => p.camera.keyframes[idx]);
  if (!k) return <Empty>Camera keyframe not found.</Empty>;
  return (
    <Section title={`Camera keyframe #${idx + 1}`}>
      <Field label="Date">
        <DateInput value={k.date} onChange={(v) => v && edit((x) => (x.date = v))} />
      </Field>
      <Row cols={3}>
        <Field label="Centre lon">
          <NumberInput value={k.center[0]} step={0.5} onChange={(v) => edit((x) => (x.center = [v, x.center[1]]))} />
        </Field>
        <Field label="Centre lat">
          <NumberInput value={k.center[1]} step={0.5} onChange={(v) => edit((x) => (x.center = [x.center[0], v]))} />
        </Field>
        <Field label="Zoom">
          <NumberInput value={k.zoom} step={0.5} min={0.3} onChange={(v) => edit((x) => (x.zoom = v))} />
        </Field>
      </Row>
      <Row>
        <Field label="Roll °">
          <NumberInput value={k.roll ?? 0} step={1} onChange={(v) => edit((x) => (x.roll = v))} />
        </Field>
        <Field label="Easing (into this keyframe)">
          <Select<Easing> value={k.easing} onChange={(v) => edit((x) => (x.easing = v))} options={EASINGS} />
        </Field>
      </Row>
      <p className="text-[10px] text-slate-500">Tip: pan and zoom the preview while the playhead is on this keyframe to set it visually.</p>
    </Section>
  );
}

function FactionInspector({ project, sel }: { project: Project; sel: Selection }) {
  const f = project.factions.find((x) => x.id === sel.id);
  const edit = useEdit((p) => p.factions.find((x) => x.id === sel.id));
  if (!f) return <Empty>Faction not found.</Empty>;
  const count = project.memberships.filter((m) => m.factionId === f.id).length;
  return (
    <Section title="Faction">
      <Field label="Name">
        <TextInput value={f.name} onChange={(v) => edit((x) => (x.name = v))} />
      </Field>
      <Field label="Colour">
        <ColorInput value={f.color} onChange={(v) => edit((x) => (x.color = v))} />
      </Field>
      <Toggle label="Hatch pattern over fills" checked={!!f.hatch} onChange={(v) => edit((x) => (x.hatch = v))} />
      <p className="text-[10px] text-slate-500">{count} membership(s), {project.zones.filter((z) => z.factionId === f.id).length} zone(s).</p>
      <Button variant="danger" size="xs" onClick={deleteSelection}>
        <Trash2 size={12} /> Delete faction & its memberships
      </Button>
    </Section>
  );
}

function ProjectInspector({ project }: { project: Project }) {
  const update = useStudio((s) => s.update);
  const ov = project.overlays;
  const set = (fn: (p: Project) => void) => update(fn);
  return (
    <>
      <Section title="Project">
        <Field label="Name">
          <TextInput value={project.name} onChange={(v) => set((p) => (p.name = v))} />
        </Field>
        <Field label="Description">
          <textarea className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" rows={2} value={project.description} onChange={(e) => set((p) => (p.description = e.target.value))} />
        </Field>
      </Section>
      <Section title="Date & clock overlay">
        <Toggle label="Show date" checked={ov.date.show} onChange={(v) => set((p) => (p.overlays.date.show = v))} />
        <Row>
          <Field label="Format">
            <Select
              value={ov.date.format}
              onChange={(v) => set((p) => (p.overlays.date.format = v))}
              options={[
                { value: "D MMM YYYY", label: "12 SEP 1915" },
                { value: "DD.MM.YYYY", label: "12.09.1915" },
                { value: "MMMM D, YYYY", label: "September 12, 1915" },
                { value: "YYYY-MM-DD", label: "1915-09-12" },
              ]}
            />
          </Field>
          <Field label="Font size">
            <NumberInput value={ov.date.fontSize} step={2} min={10} onChange={(v) => set((p) => (p.overlays.date.fontSize = v))} />
          </Field>
        </Row>
        <Field label="Colour">
          <ColorInput value={ov.date.color} onChange={(v) => set((p) => (p.overlays.date.color = v))} />
        </Field>
        <Toggle label="Show clock line" checked={ov.clock.show} onChange={(v) => set((p) => (p.overlays.clock.show = v))} />
        <Field label="Clock mode">
          <Select
            value={ov.clock.mode}
            onChange={(v) => set((p) => (p.overlays.clock.mode = v))}
            options={[
              { value: "timeOfDay", label: "Time of day (05:00)" },
              { value: "elapsed", label: "Elapsed video time" },
              { value: "dayCount", label: "Day counter" },
            ]}
          />
        </Field>
      </Section>
      <Section title="Subtitles">
        <Toggle label="Show subtitles" checked={ov.subtitle.show} onChange={(v) => set((p) => (p.overlays.subtitle.show = v))} />
        <Row>
          <Field label="Font size">
            <NumberInput value={ov.subtitle.fontSize} step={2} min={10} onChange={(v) => set((p) => (p.overlays.subtitle.fontSize = v))} />
          </Field>
          <Field label="Colour">
            <ColorInput value={ov.subtitle.color} onChange={(v) => set((p) => (p.overlays.subtitle.color = v))} />
          </Field>
        </Row>
        <Toggle label="Dark background box" checked={ov.subtitle.background} onChange={(v) => set((p) => (p.overlays.subtitle.background = v))} />
        <Field label="Position">
          <Select
            value={ov.subtitle.position}
            onChange={(v) => set((p) => (p.overlays.subtitle.position = v))}
            options={[
              { value: "bottom-left", label: "Bottom left" },
              { value: "bottom-center", label: "Bottom centre" },
            ]}
          />
        </Field>
      </Section>
      <Section title="Title card, legend & watermark">
        <Toggle label="Show title card at start" checked={ov.title.show} onChange={(v) => set((p) => (p.overlays.title.show = v))} />
        <Field label="Title">
          <TextInput value={ov.title.text} onChange={(v) => set((p) => (p.overlays.title.text = v))} />
        </Field>
        <Field label="Subtitle">
          <TextInput value={ov.title.subtitle} onChange={(v) => set((p) => (p.overlays.title.subtitle = v))} />
        </Field>
        <Field label="Title duration (s)">
          <NumberInput value={ov.title.seconds} step={0.5} min={0} onChange={(v) => set((p) => (p.overlays.title.seconds = v))} />
        </Field>
        <Toggle label="Show faction legend" checked={ov.legend.show} onChange={(v) => set((p) => (p.overlays.legend.show = v))} />
        <Field label="Legend position">
          <Select
            value={ov.legend.position}
            onChange={(v) => set((p) => (p.overlays.legend.position = v))}
            options={[
              { value: "top-right", label: "Top right" },
              { value: "bottom-right", label: "Bottom right" },
            ]}
          />
        </Field>
        <Field label="Watermark">
          <TextInput value={ov.watermark} onChange={(v) => set((p) => (p.overlays.watermark = v))} />
        </Field>
      </Section>
      <Section title="How to edit">
        <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          <li>Select an element on the map or in the timeline to edit it here.</li>
          <li>Move the playhead, then drag a zone vertex – a keyframe is created automatically.</li>
          <li>Paint countries (P) to change alliances from the current date.</li>
          <li>Ctrl+Z / Ctrl+Shift+Z undo & redo. Space plays. K adds a keyframe.</li>
        </ul>
      </Section>
    </>
  );
}

export type { Label };
