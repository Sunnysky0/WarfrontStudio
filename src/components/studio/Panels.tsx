"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Building2,
  CaseSensitive,
  ChevronRight,
  Droplet,
  Eye,
  EyeOff,
  Flag,
  Grid2x2,
  Grid3x3,
  Info,
  Landmark,
  Map as MapIcon,
  Mountain,
  Plus,
  Route,
  ShieldCheck,
  Sparkles,
  Swords,
  Tag,
  TrainTrack,
  Trash2,
  Type,
  Upload,
  Waves,
} from "lucide-react";
import type { Basemap } from "@/lib/studio/basemap";
import { MARKER_KINDS, drawMarker } from "@/lib/studio/drawing";
import { FLAG_PRESETS, NATION_COLOR_PRESETS } from "@/lib/studio/presets";
import type { Camera, FlagSpec, LayerId, MapSettings, MarkerKind, ProjectDoc } from "@/lib/studio/types";
import { LAYER_LABELS } from "@/lib/studio/types";
import { FlagPreview } from "./FlagPreview";
import { Badge, Button, Card, EmptyState, GroupHeader, IconButton, Kbd, ListRow, PanelHeader, SearchInput, Section, TextInput } from "./ui";

export type LeftTab = "layers" | "nations" | "assets" | "help";

export interface PanelsProps {
  tab: LeftTab;
  project: ProjectDoc;
  basemap: Basemap | null;
  basemapLoading: boolean;
  selectedNationId: string | null;
  ownedBy: Map<string, number>; // nation id -> region count at playhead
  selectionCount: number;
  onSelectNation: (id: string | null) => void;
  onAddNation: () => void;
  onUpdateMap: (patch: Partial<MapSettings>) => void;
  onUpdateProject: (patch: Partial<ProjectDoc>) => void;
  currentCamera: Camera;
  onAddMarker: (kind: MarkerKind) => void;
  onApplyFlag: (spec: FlagSpec) => void;
  onApplyColor: (color: string) => void;
  onOpenMapProperties: () => void;
  onAutoDraw: () => void;
}

/* ------------------------------------------------------------------ layers */

/**
 * The layer tree is grouped for legibility, but the groups are presentation
 * only — every id comes from LayerId and the four groups together cover all 15
 * entries of ALL_LAYERS. If you add a layer to types.ts, add it to a group here
 * too, otherwise it has no switch anywhere in the UI.
 */
const LAYER_GROUPS: { title: string; layers: LayerId[] }[] = [
  { title: "Nation layers", layers: ["nationOutlines", "nationLabels", "countryLabels"] },
  { title: "Base map", layers: ["land", "coastlines", "countries", "provinces", "lakes", "rivers", "railroads"] },
  { title: "Labels & cities", layers: ["cities", "cityLabels", "seaLabels"] },
  { title: "Atmosphere", layers: ["graticule", "vignette"] },
];

const LAYER_ICONS: Record<LayerId, React.ReactNode> = {
  graticule: <Grid3x3 size={14} strokeWidth={1.75} />,
  land: <Mountain size={14} strokeWidth={1.75} />,
  coastlines: <Waves size={14} strokeWidth={1.75} />,
  lakes: <Droplet size={14} strokeWidth={1.75} />,
  rivers: <Route size={14} strokeWidth={1.75} />,
  railroads: <TrainTrack size={14} strokeWidth={1.75} />,
  provinces: <Grid2x2 size={14} strokeWidth={1.75} />,
  countries: <Landmark size={14} strokeWidth={1.75} />,
  nationOutlines: <Flag size={14} strokeWidth={1.75} />,
  cities: <Building2 size={14} strokeWidth={1.75} />,
  cityLabels: <Tag size={14} strokeWidth={1.75} />,
  seaLabels: <Anchor size={14} strokeWidth={1.75} />,
  nationLabels: <Type size={14} strokeWidth={1.75} />,
  countryLabels: <CaseSensitive size={14} strokeWidth={1.75} />,
  vignette: <Sparkles size={14} strokeWidth={1.75} />,
};

function LayersPanel(props: PanelsProps) {
  const { project, onUpdateMap } = props;
  const m = project.map;
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const needle = q.trim().toLowerCase();
  const groups = useMemo(
    () =>
      LAYER_GROUPS.map((g) => ({
        ...g,
        matches: needle ? g.layers.filter((l) => LAYER_LABELS[l].toLowerCase().includes(needle)) : g.layers,
      })).filter((g) => g.matches.length > 0),
    [needle]
  );
  const visibleCount = LAYER_GROUPS.flatMap((g) => g.layers).filter((l) => m.layers[l]).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Project" icon={<MapIcon size={14} strokeWidth={1.75} />}>
        <Badge tone="accent">{visibleCount}/15 on</Badge>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-2.5">
          <Card onClick={props.onOpenMapProperties} className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-wf-md bg-wf-accent-soft text-wf-accent-text">
              <MapIcon size={17} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-wf-md font-semibold text-wf-text">{project.name}</span>
              <span className="block truncate text-wf-sm text-wf-text-4">
                {project.description || "No description"} · {project.events.length} events
              </span>
            </span>
            <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-wf-text-4" />
          </Card>
        </div>

        <div className="px-2.5 pb-2">
          <SearchInput value={q} onChange={setQ} placeholder="Filter layers…" kbd="⌘K" />
        </div>

        {groups.map((g) => {
          const open = !closed.has(g.title);
          const on = g.layers.filter((l) => m.layers[l]).length;
          return (
            <div key={g.title} className="border-t border-wf-line-soft">
              <GroupHeader
                title={g.title}
                count={on}
                open={open}
                onToggle={() =>
                  setClosed((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.title)) next.delete(g.title);
                    else next.add(g.title);
                    return next;
                  })
                }
              />
              {open && (
                <div className="px-1.5 pb-1.5">
                  {g.matches.map((l) => {
                    const vis = m.layers[l];
                    return (
                      <ListRow
                        key={l}
                        onClick={() => onUpdateMap({ layers: { ...m.layers, [l]: !vis } })}
                        title={vis ? `Hide ${LAYER_LABELS[l]}` : `Show ${LAYER_LABELS[l]}`}
                      >
                        <span className={vis ? "text-wf-accent-text" : "text-wf-text-5"}>{LAYER_ICONS[l]}</span>
                        <span className={`min-w-0 flex-1 truncate ${vis ? "text-wf-text-2" : "text-wf-text-5"}`}>{LAYER_LABELS[l]}</span>
                        <span className={vis ? "text-wf-text-3" : "text-wf-text-5"}>
                          {vis ? <Eye size={13} strokeWidth={1.75} /> : <EyeOff size={13} strokeWidth={1.75} />}
                        </span>
                      </ListRow>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="border-t border-wf-line-soft p-2.5">
          <Card accent>
            <p className="text-wf-md font-semibold text-wf-text">Your story. Less busywork.</p>
            <p className="mt-1 text-wf-base leading-relaxed text-wf-text-3">
              Select regions on the map, then hand them to a nation — the frontline is drawn for you from the attacker’s heartland.
            </p>
            <Button variant="outline" size="sm" className="mt-2 w-full" disabled={!props.selectionCount} onClick={props.onAutoDraw}>
              <Swords size={13} strokeWidth={1.75} />
              {props.selectionCount ? `Auto-draw ${props.selectionCount} region${props.selectionCount > 1 ? "s" : ""}` : "Auto-draw frontlines"}
            </Button>
          </Card>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-wf-line px-2.5 py-1.5 text-wf-sm text-wf-text-5">
        <ShieldCheck size={12} strokeWidth={1.75} />
        Basemap: Natural Earth · historical-basemaps
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- nations */

function NationsPanel(props: PanelsProps) {
  const { project } = props;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle ? project.nations.filter((n) => n.name.toLowerCase().includes(needle)) : project.nations;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Nations" icon={<Flag size={14} strokeWidth={1.75} />}>
        <Badge>{project.nations.length}</Badge>
        <IconButton title="New nation" onClick={props.onAddNation}>
          <Plus size={15} strokeWidth={2} />
        </IconButton>
      </PanelHeader>

      <div className="px-2.5 py-2">
        <SearchInput value={q} onChange={setQ} placeholder="Find a nation…" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {project.nations.length === 0 && (
          <EmptyState icon={<Flag size={17} strokeWidth={1.75} />} title="No nations yet" hint="Add a nation, then give it starting territory by selecting regions on the map.">
            <Button variant="accent" size="sm" className="mt-1" onClick={props.onAddNation}>
              <Plus size={13} strokeWidth={2} />
              New nation
            </Button>
          </EmptyState>
        )}
        {rows.map((n) => {
          const sel = n.id === props.selectedNationId;
          const owned = props.ownedBy.get(n.id) ?? 0;
          return (
            <ListRow key={n.id} active={sel} onClick={() => props.onSelectNation(sel ? null : n.id)} title={n.note ?? n.name}>
              <span className="h-4 w-4 shrink-0 rounded-[3px] border border-wf-line" style={{ background: n.color }} />
              <FlagPreview spec={n.flag} color={n.color} w={26} h={17} />
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              <span className={`tnum shrink-0 text-wf-sm ${owned ? "text-wf-text-3" : "text-wf-text-5"}`}>{owned}</span>
            </ListRow>
          );
        })}
        {project.nations.length > 0 && rows.length === 0 && <p className="px-2 py-4 text-center text-wf-base text-wf-text-4">No match for “{q}”.</p>}
      </div>

      <div className="shrink-0 border-t border-wf-line px-2.5 py-1.5 text-wf-sm text-wf-text-5">Counts are regions owned at the playhead.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ assets */

function MarkerIcon({ kind, color }: { kind: MarkerKind; color: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 40, 40);
    drawMarker(ctx, kind, 20, 20, 9, color, 0.4, false);
  }, [kind, color]);
  return <canvas ref={ref} width={40} height={40} className="h-8 w-8" />;
}

interface AssetRow {
  id: string;
  name: string;
  kind: string;
  data: string;
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
  const hint = hasNation ? "click to assign" : "select a nation first";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Assets" icon={<Sparkles size={14} strokeWidth={1.75} />}>
        <Badge tone={hasNation ? "accent" : "neutral"}>{hint}</Badge>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Flag presets">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-wf-xs font-semibold uppercase tracking-[0.1em] text-wf-text-5">{g}</div>
              <div className="flex flex-wrap gap-1">
                {FLAG_PRESETS.filter((f) => f.group === g).map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    title={f.name}
                    disabled={!hasNation}
                    onClick={() => props.onApplyFlag(f.spec)}
                    className="cursor-pointer rounded-[3px] transition-shadow duration-150 hover:ring-2 hover:ring-wf-accent/70 disabled:cursor-not-allowed disabled:opacity-40 wf-focus"
                  >
                    <FlagPreview spec={f.spec} w={36} h={24} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Your uploads">
          <div className="flex flex-wrap gap-1.5">
            {assets.map((a) => (
              <div key={a.id} className="relative">
                <button
                  type="button"
                  title={a.name}
                  disabled={!hasNation}
                  onClick={() => props.onApplyFlag({ kind: "image", url: a.data })}
                  className="cursor-pointer rounded-[3px] transition-shadow duration-150 hover:ring-2 hover:ring-wf-accent/70 disabled:cursor-not-allowed disabled:opacity-40 wf-focus"
                >
                  <FlagPreview spec={{ kind: "image", url: a.data }} w={36} h={24} />
                </button>
                <button
                  type="button"
                  title="Delete asset"
                  onClick={async () => {
                    await fetch(`/api/assets?id=${a.id}`, { method: "DELETE" });
                    refresh();
                  }}
                  className="absolute -top-1.5 -right-1.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full border border-wf-line bg-wf-raised text-wf-text-4 transition-colors duration-150 hover:border-wf-danger/50 hover:text-wf-danger wf-focus"
                >
                  <Trash2 size={9} strokeWidth={2} />
                </button>
              </div>
            ))}
            {assets.length === 0 && <span className="text-wf-base text-wf-text-4">No uploads yet.</span>}
          </div>
          <TextInput placeholder="Asset name (optional)" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-wf-md border border-dashed border-wf-line px-2 py-2 text-wf-md text-wf-text-3 transition-colors duration-150 hover:border-wf-accent/50 hover:text-wf-text-2">
            <Upload size={13} strokeWidth={1.75} />
            Upload an image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
          <span className="text-wf-sm text-wf-text-4">PNG/SVG/JPG up to ~1.5 MB. Stored in the database and reusable in every project.</span>
        </Section>

        <Section title="Markers" right={<span className="text-wf-sm text-wf-text-5">adds at view centre</span>}>
          <div className="grid grid-cols-4 gap-1">
            {MARKER_KINDS.map((mk) => (
              <button
                key={mk.id}
                type="button"
                title={mk.label}
                onClick={() => props.onAddMarker(mk.id)}
                className="flex cursor-pointer flex-col items-center gap-0.5 rounded-wf-md border border-wf-line bg-wf-lane p-1 transition-colors duration-150 hover:border-wf-accent/50 hover:bg-wf-raised-2 wf-focus"
              >
                <MarkerIcon kind={mk.id} color="#d98080" />
                <span className="w-full truncate text-center text-wf-xs text-wf-text-4">{mk.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Colour palette" right={<span className="text-wf-sm text-wf-text-5">{hint}</span>}>
          <div className="flex flex-wrap gap-1">
            {NATION_COLOR_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                title={p.name}
                disabled={!hasNation}
                onClick={() => props.onApplyColor(p.color)}
                className="h-6 w-6 cursor-pointer rounded-wf-sm border border-wf-line transition-transform duration-150 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40 wf-focus"
                style={{ background: p.color }}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- guide */

function GuidePanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Field guide" icon={<Info size={14} strokeWidth={1.75} />} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 text-wf-base leading-relaxed text-wf-text-2">
        <ol className="flex flex-col gap-2.5">
          {[
            ["Set up the map", "Open Project → Map properties for projection, border year (1900 → present), detail, theme; toggle layers in this panel."],
            ["Create nations", "Nations tab: name, colour, flag. Select countries or provinces on the map (click; shift+drag paints) and add them as starting territory."],
            ["Animate conquests", "Select regions, pick the conquering nation in Properties and press Create territory event. The frontline is auto-drawn from the attacker’s heartland."],
            ["Nation transitions", "Add a Nation transition event to rename/recolour/re-flag a state. Colours and names crossfade."],
            ["Disintegration", "Add a Disintegration event and list successor states with their provinces. Enable dissolve remainder to remove the old state entirely."],
            ["Camera", "Pan/zoom freely, then Set keyframe from view. The camera glides between keyframes."],
            ["Story layer", "Year counter, subtitles, map text, markers, belligerent flags and inset maps all live on the timeline. Drag clips to move, drag edges to resize."],
            ["Export", "Press Export video for a frame-accurate MP4/WebM at any resolution."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-2">
              <span className="tnum grid h-4 w-4 shrink-0 place-items-center rounded-[3px] bg-wf-accent-soft text-wf-xs font-semibold text-wf-accent-text">{i + 1}</span>
              <span>
                <b className="font-semibold text-wf-text">{title}</b> — {body}
              </span>
            </li>
          ))}
        </ol>

        <h4 className="mt-4 mb-1.5 text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-3">Shortcuts</h4>
        <div className="flex flex-col gap-1">
          {[
            ["Play / pause", "Space"],
            ["Jump to start", "Home"],
            ["Step 0.5s · 5s", "← →  ⇧←  ⇧→"],
            ["Delete event", "Del"],
            ["Duplicate event", "Ctrl+D"],
            ["Undo · redo", "Ctrl+Z · Ctrl+⇧+Z"],
            ["Save now", "Ctrl+S"],
            ["Clear selection", "Esc"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="text-wf-text-3">{k}</span>
              <Kbd>{v}</Kbd>
            </div>
          ))}
        </div>

        <h4 className="mt-4 mb-1.5 text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-3">Region keys</h4>
        <ul className="flex flex-col gap-1 text-wf-text-3">
          {[
            ["c:CHN", "country (ADM0 code)"],
            ["p:JPN-1850", "province (admin-1 code)"],
            ["pn:JPN:Tokyo", "province by name"],
            ["cn:Austro-Hungarian Empire", "country by name (historical)"],
          ].map(([k, v]) => (
            <li key={k} className="flex flex-wrap items-baseline gap-1.5">
              <code className="rounded-[3px] border border-wf-line bg-wf-lane px-1 py-px font-mono text-wf-sm text-wf-accent-text">{k}</code>
              {v}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Panels(props: PanelsProps) {
  if (props.tab === "layers") return <LayersPanel {...props} />;
  if (props.tab === "nations") return <NationsPanel {...props} />;
  if (props.tab === "assets") return <AssetsPanel {...props} />;
  return <GuidePanel />;
}
