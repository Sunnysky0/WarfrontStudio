import type {
  Camera,
  Easing,
  FlagSpec,
  FlagsEvent,
  FrontMode,
  FrontTheater,
  InsetEvent,
  MarkerEvent,
  Nation,
  ProjectDoc,
  StudioEvent,
  SubtitleEvent,
  TerritoryEvent,
  DisintegrateEvent,
  TextEvent,
} from "./types";
import { defaultTheater, interpolateFront, isClosedPolyline, keyframeAnchors, sortedKeyframes } from "./frontline";

// ---------------------------------------------------------------- easing / math
export function ease(kind: Easing | undefined, x: number): number {
  const t = Math.max(0, Math.min(1, x));
  switch (kind) {
    case "easeIn":
      return t * t * t;
    case "easeOut":
      return 1 - Math.pow(1 - t, 3);
    case "easeInOut":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * t;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)]);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

export function interpolateCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    lon: lerpAngle(a.lon, b.lon, t),
    lat: lerp(a.lat, b.lat, t),
    scale: Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), t)),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, t),
  };
}

// ---------------------------------------------------------------- resolved state
export interface NationState {
  id: string;
  name: string;
  color: string;
  flag?: FlagSpec;
  labelPos?: [number, number];
  labelScale?: number;
  labelHidden?: boolean;
  labelColor?: string;
  /** previous name during a transition crossfade */
  prevName?: string;
  nameMix?: number;
}

export interface ActiveTransfer {
  id: string;
  eventId: string;
  regions: string[];
  toNation: string;
  fromNation?: string;
  progress: number;
  mode: FrontMode;
  origin?: [number, number];
  direction?: number;
  roughness: number;
  showFrontline: boolean;
  seed: number;
}

export interface ActiveFront {
  id: string;
  eventId: string;
  nation: string;
  against?: string;
  points: [number, number][];
  capturedSide: [number, number];
  closed: boolean;
  theater: FrontTheater;
  clipRegions?: string[];
  fillOccupation: boolean;
  showFrontline: boolean;
  roughness: number;
  seed: number;
}

export interface ResolvedState {
  t: number;
  camera: Camera;
  nations: Map<string, NationState>;
  /** canonical region key -> nation id */
  ownership: Map<string, string>;
  transfers: ActiveTransfer[];
  fronts: ActiveFront[];
  year: string | null;
  subtitles: SubtitleEvent[];
  texts: TextEvent[];
  markers: { event: MarkerEvent; progress: number; age: number }[];
  flags: FlagsEvent | null;
  insets: InsetEvent[];
}

export type KeyResolver = (key: string) => string;
export type ProvinceLookup = (countryKey: string) => string[] | undefined;

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function applyTransfer(
  ownership: Map<string, string>,
  regions: string[],
  toNation: string,
  resolve: KeyResolver,
  provincesOf: ProvinceLookup | undefined,
  clearProvinces: boolean
) {
  for (const raw of regions) {
    const k = resolve(raw);
    ownership.set(k, toNation);
    if (clearProvinces && k.startsWith("c:") && provincesOf) {
      const provs = provincesOf(k);
      if (provs) for (const p of provs) ownership.delete(p);
    }
  }
}

export function resolveCamera(project: ProjectDoc, t: number): Camera {
  const cams = project.events
    .filter((e): e is Extract<StudioEvent, { type: "camera" }> => e.type === "camera")
    .sort((a, b) => a.start - b.start);
  let current: Camera = { ...project.map.defaultCamera };
  for (const e of cams) {
    if (t >= e.end) {
      current = { ...e.camera };
    } else if (t >= e.start) {
      const p = ease(e.easing, (t - e.start) / Math.max(1e-6, e.end - e.start));
      current = interpolateCamera(current, e.camera, p);
      break;
    } else break;
  }
  return current;
}

export function resolveState(
  project: ProjectDoc,
  t: number,
  resolve: KeyResolver = (k) => k,
  provincesOf?: ProvinceLookup
): ResolvedState {
  const events = [...project.events].sort((a, b) => a.start - b.start);

  // --- nations (with transitions)
  const nations = new Map<string, NationState>();
  for (const n of project.nations) {
    nations.set(n.id, {
      id: n.id,
      name: n.name,
      color: n.color,
      flag: n.flag,
      labelPos: n.labelPos,
      labelScale: n.labelScale,
      labelHidden: n.labelHidden,
      labelColor: n.labelColor,
    });
  }
  for (const e of events) {
    if (e.type !== "nationChange" || e.start > t) continue;
    const ns = nations.get(e.nation);
    if (!ns) continue;
    const dur = Math.max(0, e.end - e.start);
    const p = dur > 0 ? clamp((t - e.start) / dur, 0, 1) : 1;
    if (e.color) ns.color = mixColor(ns.color, e.color, p);
    if (e.name && e.name !== ns.name) {
      if (p < 1) {
        ns.prevName = ns.name;
        ns.nameMix = p;
      } else {
        ns.prevName = undefined;
        ns.nameMix = undefined;
      }
      if (p >= 0.5 || p >= 1) ns.name = e.name;
      else {
        // keep old name as primary until midpoint
        ns.prevName = e.name;
        ns.nameMix = 1 - p;
      }
    }
    if (e.flag && p >= 0.5) ns.flag = e.flag;
    if (e.labelPos) ns.labelPos = e.labelPos;
    if (e.labelScale !== undefined) ns.labelScale = e.labelScale;
  }

  // --- ownership
  const ownership = new Map<string, string>();
  for (const n of project.nations) {
    for (const r of n.regions) ownership.set(resolve(r), n.id);
  }
  const transfers: ActiveTransfer[] = [];
  type Applicable = { at: number; order: number; apply: () => void };
  const toApply: Applicable[] = [];
  events.forEach((e, order) => {
    if (e.type === "territory") {
      const instant = e.mode === "instant" || e.end <= e.start;
      const at = instant ? e.start : e.end;
      if (at <= t) {
        toApply.push({
          at,
          order,
          apply: () => applyTransfer(ownership, e.regions, e.toNation, resolve, provincesOf, e.clearProvinces !== false),
        });
      } else if (!instant && e.start <= t) {
        transfers.push({
          id: e.id,
          eventId: e.id,
          regions: e.regions.map(resolve),
          toNation: e.toNation,
          fromNation: e.fromNation,
          progress: ease(e.easing ?? "easeInOut", (t - e.start) / Math.max(1e-6, e.end - e.start)),
          mode: e.mode,
          origin: e.origin,
          direction: e.direction,
          roughness: e.roughness ?? 0.5,
          showFrontline: e.showFrontline !== false,
          seed: hashSeed(e.id),
        });
      }
    } else if (e.type === "disintegrate") {
      const instant = e.mode === "instant" || e.end <= e.start;
      const at = instant ? e.start : e.end;
      if (at <= t) {
        toApply.push({
          at,
          order,
          apply: () => {
            for (const part of e.parts) applyTransfer(ownership, part.regions, part.nation, resolve, provincesOf, false);
            if (e.dissolveRemainder) {
              for (const [k, v] of Array.from(ownership.entries())) {
                if (v === e.from) {
                  if (e.remainderNation) ownership.set(k, e.remainderNation);
                  else ownership.delete(k);
                }
              }
            }
          },
        });
      } else if (!instant && e.start <= t) {
        const n = e.parts.length;
        e.parts.forEach((part, i) => {
          const local =
            e.mode === "shatter"
              ? clamp(((t - e.start) / Math.max(1e-6, e.end - e.start)) * (1 + n * 0.35) - i * 0.35, 0, 1)
              : (t - e.start) / Math.max(1e-6, e.end - e.start);
          transfers.push({
            id: `${e.id}:${i}`,
            eventId: e.id,
            regions: part.regions.map(resolve),
            toNation: part.nation,
            fromNation: e.from,
            progress: ease("easeInOut", local),
            mode: "fade",
            roughness: 0,
            showFrontline: false,
            seed: hashSeed(e.id + i),
          });
        });
      }
    }
  });
  toApply.sort((a, b) => a.at - b.at || a.order - b.order).forEach((a) => a.apply());

  const fronts: ActiveFront[] = [];
  for (const e of events) {
    if (e.type !== "front" || e.keyframes.length < 1) continue;
    if (t < e.start) continue;
    const holding = e.holdAfterEnd !== false;
    if (t >= e.end && !holding) continue;
    const local = t >= e.end ? Math.max(0, e.end - e.start) : t - e.start;
    const points = interpolateFront(e, local);
    if (!points || points.length < 2) continue;
    const firstKeyframe = sortedKeyframes(e.keyframes)[0];
    const closed = isClosedPolyline(firstKeyframe ? keyframeAnchors(firstKeyframe) : points, e.closed);
    fronts.push({
      id: e.id,
      eventId: e.id,
      nation: e.nation,
      against: e.against,
      points,
      capturedSide: e.capturedSide,
      closed,
      theater: e.theater ?? defaultTheater(e.against),
      clipRegions: e.clipRegions,
      fillOccupation: e.fillOccupation !== false,
      showFrontline: e.showFrontline !== false,
      roughness: e.roughness ?? 0.35,
      seed: hashSeed(e.id),
    });
  }

  // --- HUD
  let year: string | null = null;
  const subtitles: SubtitleEvent[] = [];
  const texts: TextEvent[] = [];
  const markers: ResolvedState["markers"] = [];
  let flags: FlagsEvent | null = null;
  const insets: InsetEvent[] = [];
  for (const e of events) {
    if (e.type === "year" && e.start <= t) year = e.text;
    if (e.start <= t && t < e.end) {
      if (e.type === "subtitle") subtitles.push(e);
      else if (e.type === "text") texts.push(e);
      else if (e.type === "marker")
        markers.push({ event: e, progress: (t - e.start) / Math.max(1e-6, e.end - e.start), age: t - e.start });
      else if (e.type === "flags") flags = e;
      else if (e.type === "inset") insets.push(e);
    }
  }

  return {
    t,
    camera: resolveCamera(project, t),
    nations,
    ownership,
    transfers,
    fronts,
    year,
    subtitles,
    texts,
    markers,
    flags,
    insets,
  };
}

/** All nation ids that currently own at least one region */
export function nationsWithTerritory(state: ResolvedState): Set<string> {
  const s = new Set<string>();
  for (const v of state.ownership.values()) s.add(v);
  for (const tr of state.transfers) s.add(tr.toNation);
  return s;
}

export function eventDuration(e: StudioEvent): number {
  return Math.max(0, e.end - e.start);
}

export function isTerritoryLike(e: StudioEvent): e is TerritoryEvent | DisintegrateEvent {
  return e.type === "territory" || e.type === "disintegrate";
}

export function nationById(project: ProjectDoc, id: string): Nation | undefined {
  return project.nations.find((n) => n.id === id);
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m.toString().padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}
