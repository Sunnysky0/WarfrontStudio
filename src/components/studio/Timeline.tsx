"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsLeftRight, Copy, Eye, EyeOff, Lock, Magnet, Minus, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Unlock } from "lucide-react";
import type { EventType, ProjectDoc, StudioEvent } from "@/lib/studio/types";
import { EVENT_TYPE_LABELS, TRACK_ORDER } from "@/lib/studio/types";
import { formatTime } from "@/lib/studio/state";
import { EventIcon, clipStyle } from "./eventStyle";
import { Badge, Divider, IconButton, Menu, MenuItem, MenuLabel, NumberInput } from "./ui";

/**
 * Row geometry. Single source of truth — the track-header column and the lane
 * column must agree exactly or the two halves of every row drift apart.
 * (These used to be a bare `22` written out twice.)
 */
const LANE_H = 28;
const CLIP_H = 24;
const ROW_PAD = 4;
const RULER_H = 26;
const rowHeight = (lanes: number) => lanes * LANE_H + ROW_PAD;

export interface TimelineProps {
  project: ProjectDoc;
  time: number;
  playing: boolean;
  selectedId: string | null;
  collapsed: Set<EventType>;
  locked: Set<EventType>;
  onToggleCollapsed: (t: EventType) => void;
  onToggleLocked: (t: EventType) => void;
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
    case "front":
      return e.label ?? `front ${e.nation} (${e.keyframes.length} kf)`;
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
  const { project, time, playing, selectedId, collapsed, locked } = props;
  const [pps, setPps] = useState(22);
  const [snap, setSnap] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
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

  // the ruler is its own element so it stays pinned; keep it in lockstep with the lanes
  const syncRuler = () => {
    if (rulerRef.current && scrollRef.current) rulerRef.current.scrollLeft = scrollRef.current.scrollLeft;
  };

  // ---------------------------------------------------------------- scrubbing
  const scrubbing = useRef(false);
  const xToTime = (clientX: number) => {
    const el = rulerRef.current!;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left + (scrollRef.current?.scrollLeft ?? 0);
    return Math.max(0, Math.min(duration, x / pps));
  };
  const onRulerDown = (e: React.PointerEvent) => {
    scrubbing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    if (locked.has(ev.type)) return; // locked tracks are selectable but not draggable
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

  const head = { width: "var(--wf-w-trackhead)" };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-wf-line bg-wf-band">
      {/* ------------------------------------------------------------ header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-wf-line px-2.5" style={{ height: "var(--wf-h-tl-header)" }}>
        <span className="relative shrink-0 pb-1 text-wf-lg font-semibold text-wf-text">
          Timeline
          <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-wf-accent" />
        </span>
        <Badge>{project.events.length} events</Badge>

        <div className="mx-auto flex items-center gap-1.5">
          <IconButton title="Jump to start (Home)" onClick={() => props.onSeek(0)}>
            <SkipBack size={15} strokeWidth={1.75} />
          </IconButton>
          <IconButton title={playing ? "Pause (Space)" : "Play (Space)"} variant="accent" size="lg" onClick={props.onTogglePlay}>
            {playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
          </IconButton>
          <IconButton title="Jump to end" onClick={() => props.onSeek(duration)}>
            <SkipForward size={15} strokeWidth={1.75} />
          </IconButton>
          <span className="tnum ml-1 text-wf-lg font-semibold text-wf-accent-text">{formatTime(time)}</span>
          <span className="tnum text-wf-md text-wf-text-4">/ {formatTime(duration)}</span>
          <div className="w-16" title="Total duration in seconds">
            <NumberInput value={duration} min={1} step={1} onChange={(v) => props.onDuration(Math.max(1, v))} />
          </div>
        </div>

        <IconButton title="Duplicate selected event (Ctrl+D)" disabled={!selectedId} onClick={props.onDuplicateSelected}>
          <Copy size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton title="Delete selected event (Del)" disabled={!selectedId} onClick={props.onDeleteSelected}>
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
        <Divider vertical />
        <IconButton title={snap ? "Snapping to ¼ s — click to disable" : "Snapping off — click to snap to ¼ s"} active={snap} onClick={() => setSnap((v) => !v)}>
          <Magnet size={14} strokeWidth={1.75} />
        </IconButton>
        <Divider vertical />
        <IconButton title="Zoom out" size="sm" onClick={() => setPps((p) => Math.max(6, Math.round(p / 1.4)))}>
          <Minus size={13} strokeWidth={2} />
        </IconButton>
        <input
          type="range"
          min={6}
          max={120}
          value={pps}
          onChange={(e) => setPps(+e.target.value)}
          title="Timeline zoom"
          aria-label="Timeline zoom"
          className="w-24 cursor-pointer wf-focus"
        />
        <IconButton title="Zoom in" size="sm" onClick={() => setPps((p) => Math.min(120, Math.round(p * 1.4)))}>
          <Plus size={13} strokeWidth={2} />
        </IconButton>
      </div>

      {/* ------------------------------------------------------------- ruler */}
      <div className="flex shrink-0 border-b border-wf-line">
        <div className="flex shrink-0 items-center justify-between gap-1 border-r border-wf-line px-2.5" style={{ ...head, height: RULER_H }}>
          <span className="text-wf-xs font-semibold uppercase tracking-[0.12em] text-wf-text-4">Tracks</span>
          <Menu
            width={224}
            align="left"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                title="Add an event at the playhead"
                className={`grid h-5 w-5 cursor-pointer place-items-center rounded-wf-sm transition-colors duration-150 wf-focus ${
                  open ? "bg-wf-accent-soft text-wf-accent-text" : "text-wf-text-4 hover:bg-wf-raised-2 hover:text-wf-text-2"
                }`}
              >
                <Plus size={13} strokeWidth={2.5} />
              </button>
            )}
          >
            <MenuLabel>Add at playhead</MenuLabel>
            {TRACK_ORDER.map((t) => (
              <MenuItem key={t} icon={<EventIcon type={t} size={12} />} onClick={() => props.onAdd(t)}>
                {EVENT_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </Menu>
        </div>
        <div
          ref={rulerRef}
          className="relative min-w-0 flex-1 cursor-ew-resize overflow-hidden"
          style={{ height: RULER_H }}
          onPointerDown={onRulerDown}
          onPointerMove={onRulerMove}
          onPointerUp={onRulerUp}
        >
          <div className="relative h-full" style={{ width: totalW }}>
            {ticks.map((t) => (
              <div key={t} style={{ left: t * pps }} className="tnum absolute top-0 h-full border-l border-wf-line pt-1 pl-1 text-wf-sm text-wf-text-4">
                {formatTime(t).slice(0, 5)}
              </div>
            ))}
            {/* playhead handle lives in the ruler so it is never scrolled out of reach vertically */}
            <div style={{ left: time * pps }} className="pointer-events-none absolute top-0 bottom-0 z-10">
              <span className="absolute top-0.5 -translate-x-1/2 rounded-wf-sm bg-wf-accent px-1 text-wf-sm font-semibold text-wf-accent-ink tnum">
                {formatTime(time).slice(0, 5)}
              </span>
              <span className="absolute bottom-0 -ml-[4px] h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-wf-accent" />
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- body */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {/* track headers */}
        <div className="shrink-0 border-r border-wf-line bg-wf-surface/50" style={head}>
          {tracks.map((tr) => {
            const isCollapsed = collapsed.has(tr.type);
            const isLocked = locked.has(tr.type);
            return (
              <div
                key={tr.type}
                style={{ height: isCollapsed ? LANE_H : rowHeight(tr.lanes) }}
                className="group flex items-center gap-1.5 border-b border-wf-line-soft px-2.5 text-wf-md"
              >
                <span className="shrink-0" style={{ color: isCollapsed ? "var(--color-wf-text-5)" : undefined }}>
                  <EventIcon type={tr.type} size={13} />
                </span>
                <span className={`min-w-0 flex-1 truncate ${isCollapsed ? "text-wf-text-5" : "text-wf-text-2"}`}>{EVENT_TYPE_LABELS[tr.type]}</span>
                {tr.events.length > 0 && <span className="tnum shrink-0 text-wf-sm text-wf-text-5">{tr.events.length}</span>}
                <button
                  type="button"
                  title={isLocked ? "Unlock this track" : "Lock this track (no dragging)"}
                  onClick={() => props.onToggleLocked(tr.type)}
                  className={`shrink-0 cursor-pointer rounded-[3px] p-0.5 transition-colors duration-150 wf-focus ${
                    isLocked ? "text-wf-warn" : "text-wf-text-5 opacity-0 group-hover:opacity-100 hover:text-wf-text-2"
                  }`}
                >
                  {isLocked ? <Lock size={11} strokeWidth={2} /> : <Unlock size={11} strokeWidth={2} />}
                </button>
                <button
                  type="button"
                  title={isCollapsed ? "Expand this track" : "Collapse this track"}
                  onClick={() => props.onToggleCollapsed(tr.type)}
                  className={`shrink-0 cursor-pointer rounded-[3px] p-0.5 transition-colors duration-150 wf-focus ${
                    isCollapsed ? "text-wf-text-4" : "text-wf-text-5 opacity-0 group-hover:opacity-100 hover:text-wf-text-2"
                  }`}
                >
                  {isCollapsed ? <EyeOff size={11} strokeWidth={2} /> : <Eye size={11} strokeWidth={2} />}
                </button>
              </div>
            );
          })}
        </div>

        {/* lanes */}
        <div ref={scrollRef} onScroll={syncRuler} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: totalW }} className="relative">
            {/* gridlines */}
            <div className="pointer-events-none absolute inset-0">
              {ticks.map((t) => (
                <span key={t} style={{ left: t * pps }} className="absolute top-0 bottom-0 w-px bg-wf-line-soft/70" />
              ))}
            </div>

            {tracks.map((tr) => {
              const isCollapsed = collapsed.has(tr.type);
              const isLocked = locked.has(tr.type);
              return (
                <div
                  key={tr.type}
                  style={{ height: isCollapsed ? LANE_H : rowHeight(tr.lanes) }}
                  className="relative border-b border-wf-line-soft odd:bg-wf-lane/40"
                >
                  {isCollapsed
                    ? tr.events.map(({ e }) => (
                        // collapsed: every clip flattens onto one thin summary bar
                        <span
                          key={e.id}
                          title={eventTitle(e)}
                          style={{ left: e.start * pps, width: Math.max(3, (e.end - e.start) * pps), ...clipStyle(e.type, e.id === selectedId) }}
                          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                        />
                      ))
                    : tr.events.map(({ e, lane }) => {
                        const w = Math.max(8, (e.end - e.start) * pps);
                        const sel = e.id === selectedId;
                        return (
                          <div
                            key={e.id}
                            onPointerDown={(pe) => onEventDown(pe, e)}
                            onPointerMove={onEventMove}
                            onPointerUp={onEventUp}
                            title={`${eventTitle(e)}\n${formatTime(e.start)} → ${formatTime(e.end)}${isLocked ? "\n(track locked)" : ""}`}
                            style={{
                              left: e.start * pps,
                              width: w,
                              top: lane * LANE_H + (LANE_H - CLIP_H) / 2,
                              height: CLIP_H,
                              ...clipStyle(e.type, sel),
                            }}
                            className={`absolute flex select-none items-center gap-1 overflow-hidden rounded-wf-sm border pr-1 pl-1.5 text-wf-sm ${
                              isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            {w > 34 && (
                              <span className="pointer-events-none shrink-0 opacity-80">
                                <EventIcon type={e.type} size={11} />
                              </span>
                            )}
                            <span className="pointer-events-none truncate">{eventTitle(e)}</span>
                            {sel && !isLocked && w > 44 && <ChevronsLeftRight size={10} strokeWidth={2} className="pointer-events-none ml-auto shrink-0 opacity-50" />}
                          </div>
                        );
                      })}
                </div>
              );
            })}

            {/* playhead */}
            <div style={{ left: time * pps }} className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-wf-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
