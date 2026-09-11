"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Film, Layers, Map as MapIcon, Play, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { ProjectSummary } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/projects");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProjects(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      router.push(`/studio/${j.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this project permanently?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  };

  const template = projects?.find((p) => p.isTemplate);
  const mine = projects?.filter((p) => !p.isTemplate) ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(77,118,173,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(94,96,63,0.45),transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,#fff_0_1px,transparent_1px_8px)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-16">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-800 bg-sky-950/60 px-3 py-1 text-xs text-sky-200">
            <Sparkles size={12} /> Automated historical map animation
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Warfront Animation Studio</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Build delicate, fully customised war-front videos: paint alliances by date, draw occupation zones and front lines that morph between keyframes, add offensive arrows, battle
            markers, troop counters and subtitles – then export a frame-accurate MP4 straight from your browser.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              disabled={!template || !!busy}
              onClick={() => template && router.push(`/studio/${template.id}`)}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 hover:bg-sky-500 disabled:opacity-50"
            >
              <Play size={16} /> Open the WWI 1914–1919 template
            </button>
            <button
              disabled={!!busy}
              onClick={() => create({ from: "wwi" }, "wwi")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <Copy size={16} /> {busy === "wwi" ? "Creating…" : "New project from WWI template"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => create({ from: "blank", name: "Untitled warfront" }, "blank")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus size={16} /> {busy === "blank" ? "Creating…" : "Blank project"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {error && <div className="mb-6 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Layers, title: "Layered base map", text: "Coastlines, rivers, lakes, railroads, provinces, 7,000+ cities and country borders for 1900, 1914, 1920, 1930/35, 1938/39, 1945, 1960, 1994 and 2010 – each in low, medium or high (1:10m) granularity." },
            { icon: MapIcon, title: "20 projections", text: "Lambert conic, Mercator, Albers, orthographic globe, Robinson, Winkel Tripel, Equal Earth and more – with keyframed camera moves." },
            { icon: Wand2, title: "Automation", text: "Alliances by join/leave dates, zones and fronts morph between keyframes, counters interpolate, subtitles time themselves, auto-framing camera." },
            { icon: Film, title: "Export", text: "Frame-accurate MP4 (H.264) via WebCodecs at 720p–4K, WebM fallback, PNG stills and portable project JSON." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <f.icon className="mb-2 text-sky-400" size={20} />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">Your projects</h2>
          {projects === null && !error && <div className="text-slate-400">Loading…</div>}
          {projects && !mine.length && (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              No projects yet. Start from the WWI template to see every feature in action, or create a blank project.
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {template && <ProjectCard p={template} onOpen={() => router.push(`/studio/${template.id}`)} onClone={() => create({ cloneOf: template.id, name: "My copy of the WWI template" }, template.id)} />}
            {mine.map((p) => (
              <ProjectCard key={p.id} p={p} onOpen={() => router.push(`/studio/${p.id}`)} onClone={() => create({ cloneOf: p.id }, p.id)} onDelete={() => remove(p.id)} />
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
          <h2 className="mb-2 text-base font-semibold text-slate-200">Workflow in 60 seconds</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Pick projection, border year and layer granularity in the <b>Map</b> tab; pan/zoom the preview to set the camera.</li>
            <li>Create factions, press <b>P</b> and click countries at a date to make them join – colonies follow automatically.</li>
            <li>Press <b>Z</b>, click out an occupation zone at the first date; move the playhead, drag vertices – the front morphs between keyframes.</li>
            <li>Add arrows (<b>A</b>), battle markers (<b>M</b>), troop counters (<b>T</b>) and subtitled events; tune pacing so dramatic months play slower.</li>
            <li>Press <b>Export video</b> – every frame is rendered deterministically to MP4.</li>
          </ol>
        </section>
      </main>
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">Base map data: Natural Earth (public domain) · historical borders: aourednik/historical-basemaps (CC BY-NC-SA).</footer>
    </div>
  );
}

function ProjectCard({ p, onOpen, onClone, onDelete }: { p: ProjectSummary; onOpen: () => void; onClone: () => void; onDelete?: () => void }) {
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${p.isTemplate ? "border-sky-800 bg-sky-950/30" : "border-slate-800 bg-slate-900/60"}`}>
      <div className="mb-1 flex items-center gap-2">
        {p.isTemplate && <span className="rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Template</span>}
        <h3 className="truncate font-semibold">{p.name}</h3>
      </div>
      <p className="line-clamp-3 flex-1 text-sm text-slate-400">{p.description || "No description"}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={onOpen} className="rounded bg-sky-600 px-2 py-1 font-medium text-white hover:bg-sky-500">
            Open
          </button>
          <button onClick={onClone} title="Duplicate" className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">
            <Copy size={12} />
          </button>
          {onDelete && (
            <button onClick={onDelete} title="Delete" className="rounded border border-slate-700 px-2 py-1 text-red-300 hover:bg-red-950">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
