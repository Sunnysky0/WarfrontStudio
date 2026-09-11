import type { Arrow, CameraKeyframe, FrontLine, Label, LonLat, Marker, Project, Selection, ShapeKeyframe, TimelineEvent, Zone } from "./types";
import { uid } from "./types";
import { cameraAt, shapeAt, type CameraState } from "./interpolate";
import { parseDate, toISODate } from "./time";

export function findShape(p: Project, sel: Selection | null): Zone | FrontLine | null {
  if (!sel) return null;
  if (sel.type === "zone") return p.zones.find((z) => z.id === sel.id) ?? null;
  if (sel.type === "line") return p.lines.find((l) => l.id === sel.id) ?? null;
  return null;
}

/** Ensure a keyframe exists exactly at the date (copying the interpolated shape) and return it. */
export function ensureKeyframe(el: Zone | FrontLine, ms: number, closed: boolean): ShapeKeyframe {
  const existing = el.keyframes.find((k) => parseDate(k.date) === ms);
  if (existing) return existing;
  const pts = shapeAt(el.keyframes, ms, closed) ?? [];
  const k: ShapeKeyframe = { date: toISODate(ms), points: pts.map((q) => [q[0], q[1]] as LonLat) };
  el.keyframes.push(k);
  el.keyframes.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return k;
}

export function setVertex(p: Project, sel: Selection, index: number, ll: LonLat, ms: number) {
  const el = findShape(p, sel);
  if (!el) return;
  const k = ensureKeyframe(el, ms, sel.type === "zone");
  if (k.points[index]) k.points[index] = [ll[0], ll[1]];
}

export function insertVertex(p: Project, sel: Selection, index: number, ll: LonLat, ms: number) {
  const el = findShape(p, sel);
  if (!el) return;
  const closed = sel.type === "zone";
  // keep vertex counts aligned across all keyframes so morphs stay vertex-exact
  const counts = new Set(el.keyframes.map((k) => k.points.length));
  if (counts.size === 1) {
    for (const k of el.keyframes) {
      const a = k.points[index - 1];
      const b = k.points[index % k.points.length] ?? a;
      k.points.splice(index, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    const k = ensureKeyframe(el, ms, closed);
    k.points[index] = [ll[0], ll[1]];
  } else {
    const k = ensureKeyframe(el, ms, closed);
    k.points.splice(index, 0, [ll[0], ll[1]]);
  }
}

export function removeVertex(p: Project, sel: Selection, index: number, ms: number) {
  const el = findShape(p, sel);
  if (!el) return;
  const closed = sel.type === "zone";
  const counts = new Set(el.keyframes.map((k) => k.points.length));
  const min = closed ? 3 : 2;
  if (counts.size === 1) {
    if (el.keyframes[0].points.length <= min) return;
    for (const k of el.keyframes) k.points.splice(index, 1);
  } else {
    const k = ensureKeyframe(el, ms, closed);
    if (k.points.length <= min) return;
    k.points.splice(index, 1);
  }
}

export function addKeyframe(p: Project, sel: Selection, ms: number) {
  const el = findShape(p, sel);
  if (el) ensureKeyframe(el, ms, sel.type === "zone");
}

export function deleteKeyframe(p: Project, sel: Selection, index: number) {
  const el = findShape(p, sel);
  if (el && el.keyframes.length > 1) el.keyframes.splice(index, 1);
}

export function translateShape(p: Project, sel: Selection, dLon: number, dLat: number, ms: number) {
  const el = findShape(p, sel);
  if (!el) return;
  const k = ensureKeyframe(el, ms, sel.type === "zone");
  k.points = k.points.map((q) => [q[0] + dLon, q[1] + dLat]);
}

export function addZone(p: Project, points: LonLat[], factionId: string, ms: number, name?: string): Zone {
  const z: Zone = {
    id: uid(),
    name: name ?? `Zone ${p.zones.length + 1}`,
    factionId,
    opacity: 1,
    outline: true,
    outlineWidth: 1.6,
    keyframes: [{ date: toISODate(ms), points }],
  };
  p.zones.push(z);
  return z;
}

export function addLine(p: Project, points: LonLat[], ms: number, name?: string, style?: Partial<FrontLine>): FrontLine {
  const l: FrontLine = {
    id: uid(),
    name: name ?? `Front ${p.lines.length + 1}`,
    color: "#d62828",
    width: 3,
    dash: [],
    glow: true,
    keyframes: [{ date: toISODate(ms), points }],
    ...style,
  };
  p.lines.push(l);
  return l;
}

export function addMarker(p: Project, position: LonLat, ms: number, icon: Marker["icon"] = "battle"): Marker {
  const mk: Marker = {
    id: uid(),
    name: `Marker ${p.markers.length + 1}`,
    icon,
    position,
    size: 30,
    color: "#b91c1c",
    from: toISODate(ms),
    to: toISODate(ms + 30 * 86400000),
    animation: "pulse",
    label: "",
    labelPosition: "below",
  };
  p.markers.push(mk);
  return mk;
}

export function addLabel(p: Project, position: LonLat, ms: number): Label {
  const l: Label = {
    id: uid(),
    text: "New label",
    position,
    rotation: 0,
    fontSize: 26,
    color: "#ffffff",
    outline: "rgba(20,30,40,0.55)",
    bold: true,
    from: toISODate(ms),
    numberFormat: "dot",
  };
  p.labels.push(l);
  return l;
}

export function addArrow(p: Project, from: LonLat, to: LonLat, ms: number): Arrow {
  const a: Arrow = {
    id: uid(),
    name: `Arrow ${p.arrows.length + 1}`,
    from,
    to,
    curve: 0.15,
    color: "#b91c1c",
    width: 12,
    start: toISODate(ms),
    end: toISODate(ms + 20 * 86400000),
    holdUntil: toISODate(ms + 40 * 86400000),
    head: true,
    dash: false,
  };
  p.arrows.push(a);
  return a;
}

export function addEvent(p: Project, ms: number, text = "New event"): TimelineEvent {
  const e: TimelineEvent = { id: uid(), date: toISODate(ms), text, style: "subtitle" };
  p.events.push(e);
  p.events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return e;
}

export function activeCameraIndex(p: Project, ms: number): number {
  const kfs = p.camera.keyframes;
  if (!kfs.length) return -1;
  let idx = 0;
  let best = -Infinity;
  kfs.forEach((k, i) => {
    const d = parseDate(k.date);
    if (d <= ms && d >= best) {
      best = d;
      idx = i;
    }
  });
  return idx;
}

/** Apply a camera state to the active keyframe (or create one). */
export function setCamera(p: Project, cam: CameraState, ms: number) {
  const idx = activeCameraIndex(p, ms);
  if (idx < 0) {
    p.camera.keyframes.push({ date: toISODate(ms), center: cam.center, zoom: cam.zoom, roll: cam.roll, easing: "easeInOut" });
    return;
  }
  const k = p.camera.keyframes[idx];
  k.center = [cam.center[0], cam.center[1]];
  k.zoom = cam.zoom;
  k.roll = cam.roll;
}

export function addCameraKeyframe(p: Project, ms: number): CameraKeyframe {
  const existing = p.camera.keyframes.find((k) => parseDate(k.date) === ms);
  if (existing) return existing;
  const cam = cameraAt(p.camera.keyframes, ms);
  const k: CameraKeyframe = { date: toISODate(ms), center: cam.center, zoom: cam.zoom, roll: cam.roll, easing: "easeInOut" };
  p.camera.keyframes.push(k);
  p.camera.keyframes.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return k;
}

/** Assign a country to a faction from the given date (null = make neutral). */
export function paintCountry(p: Project, country: string, factionId: string | null, ms: number) {
  const date = toISODate(ms);
  // close memberships that are active at this date for the same country
  for (const mem of p.memberships) {
    if (mem.country !== country) continue;
    const from = mem.from ? parseDate(mem.from) : -Infinity;
    const to = mem.to ? parseDate(mem.to) : Infinity;
    if (from <= ms && to > ms) {
      if (from === ms) mem.to = date; // zero-length; will be pruned below
      else mem.to = date;
    }
  }
  p.memberships = p.memberships.filter((mem) => !(mem.from && mem.to && parseDate(mem.from) >= parseDate(mem.to)));
  // also drop future memberships of this country starting exactly now
  p.memberships = p.memberships.filter((mem) => !(mem.country === country && mem.from === date));
  if (factionId) p.memberships.push({ id: uid(), country, factionId, from: date, includeSubjects: true });
}

export function deleteElement(p: Project, sel: Selection) {
  switch (sel.type) {
    case "zone":
      p.zones = p.zones.filter((z) => z.id !== sel.id);
      break;
    case "line":
      p.lines = p.lines.filter((l) => l.id !== sel.id);
      break;
    case "label":
      p.labels = p.labels.filter((l) => l.id !== sel.id);
      break;
    case "marker":
      p.markers = p.markers.filter((m) => m.id !== sel.id);
      break;
    case "arrow":
      p.arrows = p.arrows.filter((a) => a.id !== sel.id);
      break;
    case "event":
      p.events = p.events.filter((e) => e.id !== sel.id);
      break;
    case "membership":
      p.memberships = p.memberships.filter((m) => m.id !== sel.id);
      break;
    case "faction":
      p.factions = p.factions.filter((f) => f.id !== sel.id);
      p.memberships = p.memberships.filter((m) => m.factionId !== sel.id);
      break;
  }
}

export function duplicateElement(p: Project, sel: Selection): Selection | null {
  const clone = <T extends { id: string; name?: string }>(arr: T[]): T | null => {
    const src = arr.find((x) => x.id === sel.id);
    if (!src) return null;
    const copy = structuredClone(src);
    copy.id = uid();
    if (copy.name) copy.name = `${copy.name} (copy)`;
    arr.push(copy);
    return copy;
  };
  let c: { id: string } | null = null;
  if (sel.type === "zone") c = clone(p.zones);
  else if (sel.type === "line") c = clone(p.lines);
  else if (sel.type === "label") c = clone(p.labels as (Label & { name?: string })[]);
  else if (sel.type === "marker") c = clone(p.markers);
  else if (sel.type === "arrow") c = clone(p.arrows);
  else if (sel.type === "event") c = clone(p.events as (TimelineEvent & { name?: string })[]);
  return c ? { type: sel.type, id: c.id } : null;
}

export function elementName(p: Project, sel: Selection | null): string {
  if (!sel) return "";
  switch (sel.type) {
    case "zone":
      return p.zones.find((z) => z.id === sel.id)?.name ?? "";
    case "line":
      return p.lines.find((z) => z.id === sel.id)?.name ?? "";
    case "label":
      return p.labels.find((z) => z.id === sel.id)?.text ?? "";
    case "marker":
      return p.markers.find((z) => z.id === sel.id)?.name ?? "";
    case "arrow":
      return p.arrows.find((z) => z.id === sel.id)?.name ?? "";
    case "event":
      return p.events.find((z) => z.id === sel.id)?.text ?? "";
    case "faction":
      return p.factions.find((z) => z.id === sel.id)?.name ?? "";
    default:
      return "";
  }
}
