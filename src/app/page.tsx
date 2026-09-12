"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Film,
  FileJson,
  FolderOpen,
  Keyboard,
  Layers,
  Loader2,
  Map as MapIcon,
  Plus,
  Shapes,
  Sparkles,
  Swords,
  Trash2,
  Upload,
} from "lucide-react";
import type { ProjectSummary } from "@/lib/studio/types";
import { Wordmark } from "@/components/studio/chrome/Header";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  GroupHeader,
  IconButton,
  Kbd,
  Menu,
  MenuItem,
  MenuLabel,
  Pill,
  SearchInput,
  StatusDot,
  TextInput,
} from "@/components/studio/ui";

type Pane = "projects" | "templates" | "assets" | "guide";

const RAIL: { id: Pane; label: string; icon: React.ReactNode; title: string }[] = [
  { id: "projects", label: "Projects", icon: <Film size={17} strokeWidth={1.75} />, title: "Your warfront projects" },
  { id: "templates", label: "New", icon: <Sparkles size={17} strokeWidth={1.75} />, title: "Templates, blank projects and import" },
  { id: "assets", label: "Assets", icon: <Shapes size={17} strokeWidth={1.75} />, title: "What ships with the studio" },
  { id: "guide", label: "Guide", icon: <BookOpen size={17} strokeWidth={1.75} />, title: "How the studio works" },
];

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pane, setPane] = useState<Pane>("projects");
  const [query, setQuery] = useState("");
  /** Which row is asking "really delete?". Replaces a native confirm(). */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () =>
    fetch("/api/projects")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
        return r.json();
      })
      .then(setProjects)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const create = async (template?: string) => {
    setBusy(template ?? "blank");
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, name: name || undefined }),
      });
      const row = await r.json();
      router.push(`/studio/${row.id}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    const row = await r.json();
    router.push(`/studio/${row.id}`);
  };

  const shown = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [projects, query]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-wf-bg font-wf-ui text-wf-text-2">
      {/* Same 64px header as the studio, minus the document controls. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-wf-line bg-wf-surface px-3" style={{ height: "var(--wf-h-header)" }}>
        <Wordmark />
        <Divider vertical className="h-7" />
        <span className="text-wf-md text-wf-text-4">Alternate-history map animation</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="md" onClick={() => setPane("guide")}>
            <BookOpen size={15} strokeWidth={1.75} />
            Field guide
          </Button>
          <Button variant="accent" size="md" onClick={() => setPane("templates")}>
            <Plus size={15} strokeWidth={2} />
            New project
          </Button>
          <span className="ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-wf-line-warm bg-wf-raised-2 text-wf-sm font-semibold text-wf-text-3">W</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex shrink-0 flex-col items-center gap-1 border-r border-wf-line bg-wf-bg py-2" style={{ width: "var(--wf-w-rail)" }} aria-label="Workspace sections">
          {RAIL.map((it) => {
            const on = it.id === pane;
            return (
              <button
                key={it.id}
                type="button"
                title={it.title}
                aria-current={on}
                onClick={() => setPane(it.id)}
                className={`relative flex w-13 cursor-pointer flex-col items-center gap-1 rounded-wf-xl px-1 py-2 transition-colors duration-150 wf-focus ${
                  on ? "bg-wf-raised-2 text-wf-accent-text" : "text-wf-text-4 hover:bg-wf-raised hover:text-wf-text-2"
                }`}
              >
                {on && <span className="absolute top-1/2 -left-2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-wf-accent" />}
                {it.icon}
                <span className="text-wf-xs font-semibold tracking-[0.06em] uppercase">{it.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* One low-opacity accent wash, replacing the old violet radial. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-wf-accent)_9%,transparent),transparent_70%)]" />

          <div className="relative mx-auto max-w-5xl px-6 py-7">
            {pane === "projects" && (
              <ProjectsPane
                projects={projects}
                shown={shown}
                error={error}
                query={query}
                onQuery={setQuery}
                confirmDelete={confirmDelete}
                onConfirmDelete={setConfirmDelete}
                onRemove={remove}
                onNew={() => setPane("templates")}
                onTemplate={() => create("great-asian-war")}
                onImport={importFile}
                busy={busy}
              />
            )}
            {pane === "templates" && (
              <TemplatesPane name={name} onName={setName} busy={busy} onCreate={create} onImport={importFile} />
            )}
            {pane === "assets" && <AssetsPane />}
            {pane === "guide" && <GuidePane />}
          </div>
        </main>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-wf-line bg-wf-surface px-3 text-wf-sm text-wf-text-4" style={{ height: "var(--wf-h-status)" }}>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusDot tone={error ? "danger" : projects ? "ok" : "warn"} pulse={!projects && !error} />
          {error ? "Workspace unreachable" : projects ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "Loading workspace…"}
        </span>
        <Divider vertical className="h-3" />
        <span className="hidden shrink-0 md:inline">Natural Earth basemaps · 13 projections · historical borders 1900 → present</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <Keyboard size={12} strokeWidth={1.75} />
          Client-side MP4 / WebM export
        </span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ projects */

function ProjectsPane({
  projects,
  shown,
  error,
  query,
  onQuery,
  confirmDelete,
  onConfirmDelete,
  onRemove,
  onNew,
  onTemplate,
  onImport,
  busy,
}: {
  projects: ProjectSummary[] | null;
  shown: ProjectSummary[] | null;
  error: string | null;
  query: string;
  onQuery: (v: string) => void;
  confirmDelete: string | null;
  onConfirmDelete: (id: string | null) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
  onTemplate: () => void;
  onImport: (f: File) => void;
  busy: string | null;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <FolderOpen size={16} strokeWidth={1.75} className="shrink-0 text-wf-text-3" />
        <h1 className="text-wf-xl font-semibold text-wf-text">Workspace</h1>
        {projects && <Pill>{projects.length}</Pill>}
        <div className="ml-auto flex items-center gap-2">
          <SearchInput value={query} onChange={onQuery} placeholder="Search projects…" className="w-56" />
          <Menu
            align="right"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-wf-md bg-wf-accent px-3 text-wf-lg font-medium whitespace-nowrap text-wf-accent-ink transition-colors duration-150 hover:bg-wf-accent-hi wf-focus"
              >
                <Plus size={15} strokeWidth={2} />
                New
                <ChevronDown size={13} strokeWidth={2} />
              </button>
            )}
          >
            <MenuLabel>Start from</MenuLabel>
            <MenuItem icon={<MapIcon size={12} strokeWidth={1.75} />} onClick={onNew}>
              Blank project…
            </MenuItem>
            <MenuItem icon={<Swords size={12} strokeWidth={1.75} />} disabled={busy !== null} onClick={onTemplate}>
              The Great Asian War
            </MenuItem>
            <MenuItem icon={<Upload size={12} strokeWidth={1.75} />} onClick={onNew}>
              Import JSON…
            </MenuItem>
          </Menu>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-wf-md border border-wf-danger/40 bg-wf-danger/10 p-3 text-wf-md text-wf-danger">
          {error}
          <p className="mt-1 text-wf-base text-wf-danger/80">
            The studio needs Postgres. Run <code className="rounded-wf-sm bg-wf-lane px-1 py-px">npm run db:up &amp;&amp; npm run db:push</code>.
          </p>
        </div>
      )}

      {!projects && !error && (
        <div className="flex items-center gap-2 px-1 py-8 text-wf-md text-wf-text-4">
          <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          Loading projects…
        </div>
      )}

      {projects && projects.length === 0 && (
        <Card className="py-2">
          <EmptyState icon={<Film size={17} strokeWidth={1.75} />} title="No projects yet" hint="Start from the Great Asian War scenario to see every feature wired up, or open a blank world.">
            <div className="mt-1 flex items-center gap-2">
              <Button variant="accent" size="md" disabled={busy !== null} onClick={onTemplate}>
                <Swords size={14} strokeWidth={1.75} />
                {busy === "great-asian-war" ? "Creating…" : "Open the template"}
              </Button>
              <Button size="md" onClick={onNew}>
                Blank project
              </Button>
            </div>
          </EmptyState>
        </Card>
      )}

      {shown && shown.length === 0 && projects && projects.length > 0 && (
        <EmptyState title="Nothing matches that search" hint="Try part of a project name or description." />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {shown?.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            confirming={confirmDelete === p.id}
            onConfirm={() => onConfirmDelete(p.id)}
            onCancel={() => onConfirmDelete(null)}
            onRemove={() => onRemove(p.id)}
          />
        ))}
      </div>

      {projects && projects.length > 0 && (
        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-wf-lg border border-dashed border-wf-line p-3 text-wf-md text-wf-text-4 transition-colors duration-150 hover:border-wf-accent/40 hover:text-wf-text-3">
          <Upload size={14} strokeWidth={1.75} />
          Import a project document (JSON)
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </label>
      )}
    </>
  );
}

function ProjectCard({
  project: p,
  confirming,
  onConfirm,
  onCancel,
  onRemove,
}: {
  project: ProjectSummary;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-wf-lg border border-wf-line-warm bg-wf-raised transition-colors duration-150 hover:border-wf-accent/30">
      <Link href={`/studio/${p.id}`} className="block wf-focus" title={`Open ${p.name}`}>
        <span className="grid aspect-video w-full place-items-center overflow-hidden border-b border-wf-line-soft bg-wf-void">
          {p.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <MapIcon size={26} strokeWidth={1.25} className="text-wf-text-5" />
          )}
        </span>
        <span className="block px-3 pt-2.5">
          <span className="block truncate text-wf-lg font-semibold text-wf-text">{p.name}</span>
          <span className="mt-0.5 block truncate text-wf-base text-wf-text-4">{p.description || "No description"}</span>
        </span>
      </Link>

      <div className="flex items-center gap-2 px-3 pt-2 pb-2.5 text-wf-sm text-wf-text-4">
        <span className="tnum flex shrink-0 items-center gap-1">
          <Clock size={11} strokeWidth={1.75} />
          {p.durationSeconds}s
        </span>
        <span className="text-wf-text-5">·</span>
        <span className="truncate">updated {new Date(p.updatedAt).toLocaleDateString()}</span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {confirming ? (
            <>
              <span className="text-wf-sm text-wf-danger">Delete?</span>
              <Button variant="danger" size="xs" onClick={onRemove}>
                Yes
              </Button>
              <Button size="xs" onClick={onCancel}>
                No
              </Button>
            </>
          ) : (
            <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton title={`Delete ${p.name}`} size="sm" onClick={onConfirm}>
                <Trash2 size={13} strokeWidth={1.75} />
              </IconButton>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- templates */

function TemplatesPane({
  name,
  onName,
  busy,
  onCreate,
  onImport,
}: {
  name: string;
  onName: (v: string) => void;
  busy: string | null;
  onCreate: (template?: string) => void;
  onImport: (f: File) => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} strokeWidth={1.75} className="shrink-0 text-wf-text-3" />
        <h1 className="text-wf-xl font-semibold text-wf-text">Start a new project</h1>
      </div>

      <Card accent className="mb-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-wf-lg bg-wf-accent text-wf-accent-ink">
            <Swords size={19} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-wf-xl font-semibold text-wf-text">The Great Asian War</h2>
              <Badge tone="accent">Template</Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-wf-md leading-relaxed text-wf-text-3">
              A 2022–2034 alternate-history scenario: the Taiwan crisis, a nationalist coup, Pakistani intervention, the People’s Heavenly Republic, Operation Xuanyuan, India’s
              disintegration, Purification Zones and an Australia inset. It exercises every event type, so it doubles as a worked example.
            </p>
            <Button variant="accent" size="md" className="mt-3" disabled={busy !== null} onClick={() => onCreate("great-asian-war")}>
              {busy === "great-asian-war" ? "Creating…" : "Open a fresh copy"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <MapIcon size={16} strokeWidth={1.75} className="text-wf-text-3" />
            <h2 className="text-wf-lg font-semibold text-wf-text">Blank project</h2>
          </div>
          <p className="mt-1.5 text-wf-md leading-relaxed text-wf-text-3">
            An empty world. Pick a border year (1900 → present), one of 13 projections and a theme once you are inside.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <TextInput value={name} onChange={(e) => onName(e.target.value)} placeholder="Project name" />
            <Button variant="accent" size="md" disabled={busy !== null} onClick={() => onCreate()}>
              {busy === "blank" ? "Creating…" : "Create project"}
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <FileJson size={16} strokeWidth={1.75} className="text-wf-text-3" />
            <h2 className="text-wf-lg font-semibold text-wf-text">Import from JSON</h2>
          </div>
          <p className="mt-1.5 text-wf-md leading-relaxed text-wf-text-3">
            Load a project document exported from the studio. The file is validated on the server before it is stored.
          </p>
          <label className="mt-3 flex cursor-pointer flex-col items-center gap-1.5 rounded-wf-md border border-dashed border-wf-line p-4 text-center text-wf-md text-wf-text-4 transition-colors duration-150 hover:border-wf-accent/40 hover:text-wf-text-3">
            <Upload size={16} strokeWidth={1.75} />
            Choose a .json file…
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- assets */

const ASSET_GROUPS: { title: string; items: string[] }[] = [
  { title: "Base map", items: ["Land & coastlines", "Countries and provinces", "Lakes and rivers", "Railroads", "Cities with population ranks", "Graticule"] },
  { title: "Historical borders", items: ["1900", "1914", "1935", "1939", "1945", "2010", "Present day"] },
  { title: "Events", items: ["Territory transfer with auto frontline", "Nation change", "Disintegration", "Camera moves", "Year & subtitle titles", "Map text", "Markers", "Flag clashes", "Inset maps"] },
  { title: "Export", items: ["MP4 (H.264) via WebCodecs", "WebM (VP9)", "PNG frame snapshot", "Frame-accurate offline render"] },
];

function AssetsPane() {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Shapes size={16} strokeWidth={1.75} className="shrink-0 text-wf-text-3" />
        <h1 className="text-wf-xl font-semibold text-wf-text">What ships with the studio</h1>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ASSET_GROUPS.map((g) => (
          <Card key={g.title} padded={false} className="overflow-hidden">
            <GroupHeader title={g.title} count={g.items.length} />
            <ul className="flex flex-col gap-1 px-2.5 pb-2.5">
              {g.items.map((i) => (
                <li key={i} className="flex items-center gap-2 text-wf-md text-wf-text-2">
                  <Layers size={12} strokeWidth={1.75} className="shrink-0 text-wf-text-5" />
                  {i}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-wf-base text-wf-text-5">Basemap geometry derived from Natural Earth (public domain).</p>
    </>
  );
}

/* --------------------------------------------------------------------- guide */

const STEPS: { title: string; body: string }[] = [
  { title: "Create a project", body: "Start from the Great Asian War template to see a finished timeline, or open a blank world and pick a border year." },
  { title: "Add your nations", body: "In the Nations panel, give each side a colour and a flag. Nations own regions; events move regions between them." },
  { title: "Paint territory", body: "Select regions on the map — click, or shift+drag to paint — then hand them to a nation. The frontline is drawn for you." },
  { title: "Move the camera", body: "Pan and zoom the preview, then set a camera keyframe from the view. Keyframes interpolate between each other." },
  { title: "Narrate it", body: "Year markers, subtitles, map text, markers, flag clashes and inset maps are all events on the timeline." },
  { title: "Export", body: "Render an MP4 or WebM entirely in the browser. The export uses the same renderer as the preview, frame for frame." },
];

function GuidePane() {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <BookOpen size={16} strokeWidth={1.75} className="shrink-0 text-wf-text-3" />
        <h1 className="text-wf-xl font-semibold text-wf-text">Field guide</h1>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="p-3.5">
            <div className="flex items-center gap-2">
              <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-wf-md bg-wf-accent-soft text-wf-sm font-semibold text-wf-accent-text">{i + 1}</span>
              <h2 className="text-wf-lg font-semibold text-wf-text">{s.title}</h2>
            </div>
            <p className="mt-1.5 text-wf-md leading-relaxed text-wf-text-3">{s.body}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-3 p-3.5">
        <h2 className="text-wf-lg font-semibold text-wf-text">Shortcuts inside the studio</h2>
        <div className="mt-2 grid gap-1.5 text-wf-md text-wf-text-3 sm:grid-cols-2">
          {[
            ["Space", "Play / pause"],
            ["← →", "Nudge the playhead (⇧ for 5s)"],
            ["Ctrl+Z / ⇧+Ctrl+Z", "Undo / redo"],
            ["Ctrl+D", "Duplicate the selected event"],
            ["Del", "Delete the selected event"],
            ["Ctrl+S", "Save now"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <Kbd>{k}</Kbd>
              <span className="min-w-0 truncate">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
