"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronsLeft, ChevronsRight, Pause, Play, Repeat, SkipBack, StepBack, StepForward } from "lucide-react";
import { useStudio } from "@/store/studio";
import { dateAtTime, formatDate, formatElapsed, parseDate, timeAtDate } from "@/lib/time";
import type { Selection } from "@/lib/types";
import { Button } from "./ui";
import { stepFrames } from "./actions";

interface TrackItem {
  sel: Selection;
  name: string;
  color: string;
  keyframes: number[]; // times (s)
  span?: [number, number]; // times (s)
}

export default function Timeline() {
  const project = useStudio((s) => s.project);
  const time = useStudio((s) => s.time);
  const playing = useStudio((s) => s.playing);
  const loop = useStudio((s) => s.loop);
  const rate = useStudio((s) => s.rate);
  const selection = useStudio((s) => s.selection);
  const setTime = useStudio((s) => s.setTime);
  const setPlaying = useStudio((s) => s.setPlaying);
  const setLoop = useStudio((s) => s.setLoop);
  const setRate = useStudio((s) => s.setRate);
  const select = useStudio((s) => s.select);
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const duration = project?.video.duration ?? 1;

  const ticks = useMemo(() => {
    if (!project) return [] as { t: number; label: string; major: boolean }[];
    const start = parseDate(project.time.start);
    const end = parseDate(project.time.end);
    const y0 = new Date(start).getUTCFullYear();
    const y1 = new Date(end).getUTCFullYear();
    const out: { t: number; label: string; major: boolean }[] = [];
    const years = y1 - y0;
    const monthStep = years <= 2 ? 1 : years <= 6 ? 3 : years <= 15 ? 6 : 0;
    for (let y = y0; y <= y1 + 1; y++) {
      for (let mo = 0; mo < 12; mo += monthStep || 12) {
        const ms = Date.UTC(y, mo, 1);
        if (ms < start || ms > end) continue;
        const t = timeAtDate(project, ms);
        out.push({ t, label: mo === 0 ? String(y) : new Date(ms).toLocaleString("en", { month: "short", timeZone: "UTC" }), major: mo === 0 });
      }
    }
    return out;
  }, [project]);

  const tracks = useMemo(() => {
    if (!project) return [] as { group: string; items: TrackItem[] }[];
    const T = (d: string | undefined, fallback: number) => (d ? timeAtDate(project, parseDate(d)) : fallback);
    const fcolor = (id: string) => project.factions.find((f) => f.id === id)?.color ?? "#888";
    const groups: { group: string; items: TrackItem[] }[] = [];
    groups.push({
      group: "Camera",
      items: [{ sel: { type: "camera", id: "0" }, name: "Camera", color: "#38bdf8", keyframes: project.camera.keyframes.map((k) => T(k.date, 0)) }],
    });
    groups.push({
      group: "Events",
      items: [{ sel: { type: "event", id: "*" }, name: `Subtitles (${project.events.length})`, color: "#f472b6", keyframes: project.events.map((e) => T(e.date, 0)) }],
    });
    groups.push({
      group: "Zones",
      items: project.zones.map((z) => {
        const kfs = z.keyframes.map((k) => T(k.date, 0)).sort((a, b) => a - b);
        return { sel: { type: "zone", id: z.id }, name: z.name, color: fcolor(z.factionId), keyframes: kfs, span: [T(z.from, kfs[0] ?? 0), T(z.to, duration)] };
      }),
    });
    groups.push({
      group: "Front lines",
      items: project.lines.map((l) => {
        const kfs = l.keyframes.map((k) => T(k.date, 0)).sort((a, b) => a - b);
        return { sel: { type: "line", id: l.id }, name: l.name, color: l.color, keyframes: kfs, span: [T(l.from, kfs[0] ?? 0), T(l.to, duration)] };
      }),
    });
    groups.push({
      group: "Arrows",
      items: project.arrows.map((a) => ({ sel: { type: "arrow", id: a.id }, name: a.name, color: a.color, keyframes: [T(a.start, 0), T(a.end, 0)], span: [T(a.start, 0), T(a.holdUntil ?? a.end, duration)] })),
    });
    groups.push({
      group: "Markers",
      items: project.markers.map((m) => ({ sel: { type: "marker", id: m.id }, name: m.name, color: m.color, keyframes: [], span: [T(m.from, 0), T(m.to, duration)] })),
    });
    groups.push({
      group: "Labels",
      items: project.labels.map((l) => ({ sel: { type: "label", id: l.id }, name: l.text, color: "#e2e8f0", keyframes: (l.valueKeyframes ?? []).map((k) => T(k.date, 0)), span: [T(l.from, 0), T(l.to, duration)] })),
    });
    return groups.filter((g) => g.items.length);
  }, [project, duration]);

  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / duration) * 100}%`;

  const seekFromEvent = (e: MouseEvent | React.MouseEvent) => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setTime(f * duration);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => scrubbing.current && seekFromEvent(e);
    const up = () => (scrubbing.current = false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // auto-scroll selected track into view
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selection || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-track="${selection.type}:${selection.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  if (!project) return null;
  const dateMs = dateAtTime(project, time);

  return (
    <div className="flex h-full flex-col border-t border-slate-800 bg-slate-900 text-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-1">
        <Button variant="ghost" title="Go to start" onClick={() => setTime(0)}>
          <SkipBack size={14} />
        </Button>
        <Button variant="ghost" title="Back 10 frames" onClick={() => stepFrames(-10)}>
          <ChevronsLeft size={14} />
        </Button>
        <Button variant="ghost" title="Previous frame (←)" onClick={() => stepFrames(-1)}>
          <StepBack size={14} />
        </Button>
        <Button variant="primary" title="Play / pause (Space)" onClick={() => setPlaying(!playing)} className="w-16">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <Button variant="ghost" title="Next frame (→)" onClick={() => stepFrames(1)}>
          <StepForward size={14} />
        </Button>
        <Button variant="ghost" title="Forward 10 frames" onClick={() => stepFrames(10)}>
          <ChevronsRight size={14} />
        </Button>
        <Button variant="ghost" title="Loop" active={loop} onClick={() => setLoop(!loop)}>
          <Repeat size={14} />
        </Button>
        <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px]" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))}>
          {[0.25, 0.5, 1, 2, 4].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <div className="ml-2 font-mono text-xs text-sky-200">
          {formatElapsed(time)} <span className="text-slate-500">/ {formatElapsed(duration)}</span>
        </div>
        <div className="font-mono text-xs text-amber-200">{formatDate(dateMs, "D MMM YYYY")}</div>
        <div className="ml-auto text-[11px] text-slate-500">Click the ruler to seek · click a ◆ to jump to a keyframe · click a track to select</div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0">
        <div className="w-44 shrink-0 border-r border-slate-800">
          <div className="h-7 border-b border-slate-800 px-2 text-[10px] leading-7 text-slate-500">TRACKS</div>
        </div>
        <div className="relative flex-1">
          <div
            ref={rulerRef}
            className="relative h-7 cursor-pointer select-none border-b border-slate-800 bg-slate-950"
            onMouseDown={(e) => {
              scrubbing.current = true;
              seekFromEvent(e);
            }}
          >
            {ticks.map((tk, i) => (
              <div key={i} className="absolute top-0 h-full" style={{ left: pct(tk.t) }}>
                <div className={`${tk.major ? "h-3 bg-slate-400" : "h-1.5 bg-slate-600"} w-px`} />
                <div className={`absolute top-3 -translate-x-1/2 whitespace-nowrap text-[10px] ${tk.major ? "text-slate-200" : "text-slate-500"}`}>{tk.label}</div>
              </div>
            ))}
            {project.time.pacing.map((p, i) => (
              <div key={`p${i}`} title={`Pacing: ${p.date} at ${formatElapsed(p.t)}`} className="absolute bottom-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400" style={{ left: pct(p.t) }} />
            ))}
          </div>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {tracks.map((g) => (
          <div key={g.group}>
            <div className="sticky top-0 z-10 flex bg-slate-900/95">
              <div className="w-44 shrink-0 border-r border-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
              <div className="flex-1" />
            </div>
            {g.items.map((it) => {
              const isSel = selection && (selection.type === it.sel.type && (selection.id === it.sel.id || it.sel.id === "*" || it.sel.type === "camera"));
              return (
                <div key={`${it.sel.type}:${it.sel.id}`} data-track={`${it.sel.type}:${it.sel.id}`} className={`flex h-6 ${isSel ? "bg-sky-900/40" : "hover:bg-slate-800/60"}`}>
                  <button
                    className="w-44 shrink-0 truncate border-r border-slate-800 px-2 text-left text-[11px]"
                    title={it.name}
                    onClick={() => {
                      if (it.sel.id === "*") return;
                      select(it.sel);
                    }}
                  >
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: it.color }} />
                    {it.name}
                  </button>
                  <div
                    className="relative flex-1 cursor-pointer"
                    onMouseDown={(e) => {
                      if (it.sel.id !== "*") select(it.sel);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTime(((e.clientX - rect.left) / rect.width) * duration);
                    }}
                  >
                    {it.span && (
                      <div className="absolute top-2 h-2 rounded-sm opacity-60" style={{ left: pct(it.span[0]), width: `calc(${pct(it.span[1])} - ${pct(it.span[0])})`, background: it.color }} />
                    )}
                    {it.keyframes.map((t, i) => (
                      <button
                        key={i}
                        className="absolute top-1 h-4 w-4 -translate-x-1/2 text-[10px] leading-4 text-white hover:scale-125"
                        style={{ left: pct(t) }}
                        title={formatDate(dateAtTime(project, t), "D MMM YYYY")}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTime(t);
                          if (it.sel.type === "camera") select({ type: "camera", id: String(i) });
                          else if (it.sel.id === "*") {
                            const ev = [...project.events].sort((a, b) => parseDate(a.date) - parseDate(b.date))[i];
                            if (ev) select({ type: "event", id: ev.id });
                          } else select(it.sel);
                        }}
                      >
                        ◆
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="h-4" />
      </div>
      <PlayheadOverlay pct={pct(time)} />
      </div>
    </div>
  );
}

function PlayheadOverlay({ pct }: { pct: string }) {
  return (
    <div className="pointer-events-none absolute bottom-0 left-44 right-0 top-0">
      <div className="absolute bottom-0 top-0 w-px bg-red-500" style={{ left: pct }}>
        <div className="absolute -left-1.5 -top-1 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
      </div>
    </div>
  );
}
