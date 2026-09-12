"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/studio/types";

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");

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
    if (!confirm("Delete this project permanently?")) return;
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

  return (
    <div className="min-h-screen bg-[#0a0910] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.25),transparent_60%)]" />
      <main className="relative mx-auto max-w-5xl px-6 py-14">
        <header className="mb-10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-violet-400">Alternate-history mapping</p>
          <h1 className="text-4xl font-black tracking-tight text-white">⚔ Warfront Animation Studio</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Build delicate, fully customized warfront videos: layered base maps (coastlines, rivers, lakes, railroads, provinces, cities, historical borders 1900 → present), 13 map
            projections, preset themes, auto-drawn animated frontlines, nation transitions & disintegrations, markers, flags, subtitles, inset maps — and frame-accurate MP4 / WebM export.
          </p>
        </header>

        <section className="mb-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-violet-800/60 bg-gradient-to-br from-violet-950/60 to-zinc-900 p-5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-300">Template</div>
            <h2 className="text-lg font-bold text-white">The Great Asian War</h2>
            <p className="mt-1 text-xs text-zinc-400">
              2022–2034 alt-history scenario (Fire Rises inspired): Taiwan crisis, nationalist coup, Pakistan intervention, People’s Heavenly Republic, Operation Xuanyuan, India’s
              disintegration, Purification Zones, Australia inset. Demonstrates every basic operation.
            </p>
            <button
              onClick={() => create("great-asian-war")}
              disabled={busy !== null}
              className="mt-4 w-full rounded bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {busy === "great-asian-war" ? "Creating…" : "Open a fresh copy"}
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">New</div>
            <h2 className="text-lg font-bold text-white">Blank project</h2>
            <p className="mt-1 text-xs text-zinc-400">Start from an empty world. Pick a border year (1900, 1914, 1935, 1939, 1945, 2010, present), projection and theme.</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="mt-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-violet-500"
            />
            <button onClick={() => create()} disabled={busy !== null} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50">
              {busy === "blank" ? "Creating…" : "Create"}
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Import</div>
            <h2 className="text-lg font-bold text-white">From JSON</h2>
            <p className="mt-1 text-xs text-zinc-400">Import a project document exported from the studio.</p>
            <label className="mt-4 block cursor-pointer rounded border border-dashed border-zinc-700 p-3 text-center text-xs text-zinc-400 hover:border-violet-500">
              Choose file…
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Your projects</h2>
          {error && <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
          {!projects && !error && <div className="text-sm text-zinc-500">Loading…</div>}
          {projects && projects.length === 0 && <div className="text-sm text-zinc-500">No projects yet.</div>}
          <div className="grid gap-3 md:grid-cols-2">
            {projects?.map((p) => (
              <div key={p.id} className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-600">
                <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-950 text-2xl">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover" /> : "🗺"}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/studio/${p.id}`} className="block truncate font-semibold text-white hover:text-violet-300">
                    {p.name}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">{p.description || "No description"}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {p.durationSeconds}s · updated {new Date(p.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Link href={`/studio/${p.id}`} className="rounded bg-violet-600 px-3 py-1 text-center text-xs font-semibold text-white hover:bg-violet-500">
                    Open
                  </Link>
                  <button onClick={() => remove(p.id)} className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-red-800 hover:text-red-300">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
