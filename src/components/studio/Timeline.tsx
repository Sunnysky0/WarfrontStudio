"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { EventType, ProjectDoc, StudioEvent } from "@/lib/studio/types";
import { EVENT_TYPE_LABELS, TRACK_ORDER } from "@/lib/studio/types";
import { formatTime } from "@/lib/studio/state";
import { Button, NumberInput } from "./ui";

const TRACK_COLORS: Record<EventType, string> = {
  year: "bg-amber-600/80 border-amber-400",
  camera: "bg-sky-700/80 border-sky-400",
  territory: "bg-rose-700/80 border-rose-400",
  disintegrate: "bg-fuchsia-700/80 border-fuchsia-400",
  nationChange: "bg-orange-700/80 border-orange-400",
  marker: "bg-red-800/80 border-red-400",
  text: "bg-teal-700/80 border-teal-400",
  subtitle: "bg-emerald-700/80 border-emerald-400",
  flags: "bg-indigo-700/80 border-indigo-400",
  inset: "bg-cyan-800/80 border-cyan-400",
};

export interface TimelineProps {
  project: ProjectDoc;
  time: number;
  playing: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onUpdateEvent: (id: string, patch: Partial<StudioEvent>, record: boolean) => void;
  onAdd: (type: EventType) => void;
  onDuration: (d: number) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
}

function eventTitle(e: StudioEvent): string {
  switch (e.type) {
    case "year":
      return e.text;
    case "subtitle":
      return e.text;
    case "text":
      return e.text;
    case "territory":
      return e.label ?? `→ ${e.toNation} (${e.regions.length})`;
    case "disintegrate":
      return e.label ?? `${e.from} splits ×${e.parts.length}`;
    case "nationChange":
      return e.label ?? `${e.nation}: ${e.name ?? e.color ?? "change"}`;
    case "camera":
      return e.label ?? `cam ${e.camera.lon.toFixed(0)},${e.camera.lat.toFixed(0)} ×${e.camera.scale.toFixed(0)}`;
    case "marker":
      return e.label ?? e.kind;
    case "flags":
      return e.label ?? `${e.left.length} vs ${e.right.length}`;
    case "inset":
      return e.label ?? e.title ?? "inset";
  }
}

export default function Timeline(props: TimelineProps) {
  const { project, time, playing, selectedId } = props;
  const [pps, setPps] = useState(22);
  const [snap, setSnap] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = project.duration;
  const totalW = duration * pps + 160;

  // lanes per track
  const tracks = useMemo(() => {
    return TRACK_ORDER.map((type) => {
      const evs = project.events.filter((e) => e.type === type).sort((a, b) => a.start - b.start);
      const laneEnds: number[] = [];
      const placed = evs.map((e) => {
        const minW = 0.35; // seconds of visual width
        const s = e.start;
        const en = Math.max(e.end, s + minW);
        let lane = laneEnds.findIndex((end) => end <= s + 0.01);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(en);
        } else laneEnds[lane] = en;
        return { e, lane };
      });
      return { type, events: placed, lanes: Math.max(1, laneEnds.length) };
    });
  }, [project.events]);

  // auto-scroll while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, x - 120);
  }, [time, playing, pps]);

  // ---------------------------------------------------------------- scrubbing
  const scrubbing = useRef(false);
  const xToTime = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + el.scrollLeft;
    return Math.max(0, Math.min(duration, x / pps));
  };
  const onRulerDown = (e: React.PointerEvent) => {
    scrubbing.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    props.onSeek(xToTime(e.clientX));
  };
  const onRulerMove = (e: React.PointerEvent) => {
    if (scrubbing.current) props.onSeek(xToTime(e.clientX));
  };
  const onRulerUp = () => {
    scrubbing.current = false;
  };

  // ---------------------------------------------------------------- event drag
  const dragRef = useRef<{ id: string; mode: "move" | "start" | "end"; x0: number; start: number; end: number } | null>(null);
  const roundSnap = (v: number) => (snap ? Math.round(v * 4) / 4 : Math.round(v * 100) / 100);
  const onEventDown = (e: React.PointerEvent, ev: StudioEvent) => {
    e.stopPropagation();
    props.onSelect(ev.id);
    const target = e.currentTarget as HTMLElement;
    const r = target.getBoundingClientRect();
    const rel = e.clientX - r.left;
    const mode: "move" | "start" | "end" = rel < 7 && r.width > 20 ? "start" : r.width - rel < 7 && r.width > 20 ? "end" : "move";
    dragRef.current = { id: ev.id, mode, x0: e.clientX, start: ev.start, end: ev.end };
    target.setPointerCapture(e.pointerId);
  };
  const onEventMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dt = (e.clientX - d.x0) / pps;
    const dur = d.end - d.start;
    if (d.mode === "move") {
      const s = Math.max(0, Math.min(duration - dur, roundSnap(d.start + dt)));
      props.onUpdateEvent(d.id, { start: s, end: s + dur }, false);
    } else if (d.mode === "start") {
      const s = Math.max(0, Math.min(d.end - 0.1, roundSnap(d.start + dt)));
      props.onUpdateEvent(d.id, { start: s }, false);
    } else {
      const en = Math.max(d.start + 0.1, Math.min(duration, roundSnap(d.end + dt)));
      props.onUpdateEvent(d.id, { end: en }, false);
    }
  };
  const onEventUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const ev = project.events.find((x) => x.id === d.id);
    if (ev) props.onUpdateEvent(d.id, { start: ev.start, end: ev.end }, true);
  };

  // ruler ticks
  const major = pps >= 40 ? 1 : pps >= 15 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += major) ticks.push(t);

  return (
    <div className="flex h-full flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-200">
      {/* transport */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1">
        <Button onClick={() => props.onSeek(0)} title="Go to start">
          ⏮
        </Button>
        <Button onClick={props.onTogglePlay} variant="primary" title="Play / pause (Space)" className="w-16">
          {playing ? "❚❚ Pause" : "▶ Play"}
        </Button>
        <span className="w-24 font-mono text-xs text-violet-300">{formatTime(time)}</span>
        <span className="text-[10px] text-zinc-500">/ duration</span>
        <div className="w-20">
          <NumberInput value={duration} min={1} step={1} onChange={(v) => props.onDuration(Math.max(1, v))} />
        </div>
        <span className="text-[10px] text-zinc-500">s</span>
        <div className="mx-2 h-5 w-px bg-zinc-800" />
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) props.onAdd(e.target.value as EventType);
          }}
        >
          <option value="">+ Add event at playhead…</option>
          {TRACK_ORDER.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <Button onClick={props.onDuplicateSelected} disabled={!selectedId} title="Duplicate (Ctrl+D)">
          Duplicate
        </Button>
        <Button onClick={props.onDeleteSelected} disabled={!selectedId} variant="danger" title="Delete (Del)">
          Delete
        </Button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-400">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> snap ¼s
          </label>
          <span>zoom</span>
          <input type="range" min={6} max={120} value={pps} onChange={(e) => setPps(+e.target.value)} className="w-28" />
        </div>
      </div>

      {/* tracks */}
      <div className="flex min-h-0 flex-1">
        <div className="w-[150px] shrink-0 border-r border-zinc-800 bg-zinc-900/60">
          <div className="h-6 border-b border-zinc-800" />
          {tracks.map((tr) => (
            <div
              key={tr.type}
              style={{ height: tr.lanes * 22 + 6 }}
              className="flex items-center border-b border-zinc-800/60 px-2 text-[11px] text-zinc-300"
            >
              <span className={`mr-2 inline-block h-2 w-2 rounded-sm border ${TRACK_COLORS[tr.type]}`} />
              {EVENT_TYPE_LABELS[tr.type]}
            </div>
          ))}
        </div>
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: totalW }} className="relative">
            {/* ruler */}
            <div
              className="sticky top-0 z-10 h-6 cursor-ew-resize border-b border-zinc-800 bg-zinc-950"
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
              onPointerUp={onRulerUp}
            >
              {ticks.map((t) => (
                <div key={t} style={{ left: t * pps }} className="absolute top-0 h-full border-l border-zinc-700 pl-1 font-mono text-[9px] text-zinc-500">
                  {formatTime(t).slice(0, 5)}
                </div>
              ))}
            </div>
            {/* rows */}
            {tracks.map((tr) => (
              <div key={tr.type} style={{ height: tr.lanes * 22 + 6 }} className="relative border-b border-zinc-800/60">
                {tr.events.map(({ e, lane }) => {
                  const w = Math.max(8, (e.end - e.start) * pps);
                  const sel = e.id === selectedId;
                  return (
                    <div
                      key={e.id}
                      onPointerDown={(ev) => onEventDown(ev, e)}
                      onPointerMove={onEventMove}
                      onPointerUp={onEventUp}
                      title={`${eventTitle(e)}\n${formatTime(e.start)} → ${formatTime(e.end)}`}
                      style={{ left: e.start * pps, width: w, top: lane * 22 + 3 }}
                      className={`absolute h-[19px] cursor-grab select-none overflow-hidden rounded border px-1 text-[10px] leading-[17px] text-white ${TRACK_COLORS[e.type]} ${
                        sel ? "ring-2 ring-white" : "opacity-90 hover:opacity-100"
                      }`}
                    >
                      <span className="pointer-events-none truncate">{eventTitle(e)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            {/* playhead */}
            <div style={{ left: time * pps }} className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-red-500">
              <div className="-ml-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-red-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
