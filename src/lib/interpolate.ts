import type { CameraKeyframe, Easing, LonLat, ShapeKeyframe, ValueKeyframe } from "./types";
import { parseDate } from "./time";

export function ease(kind: Easing | undefined, f: number): number {
  const x = Math.max(0, Math.min(1, f));
  switch (kind) {
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeIn":
      return x * x;
    case "step":
      return x >= 1 ? 1 : 0;
    default:
      return x;
  }
}

function polyLength(pts: LonLat[], closed: boolean): { cum: number[]; total: number } {
  const cum = [0];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  return { cum, total };
}

/** Resample a polyline/polygon to exactly n evenly spaced points (arc-length parametrised). */
export function resample(pts: LonLat[], n: number, closed: boolean): LonLat[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as LonLat);
  const { cum, total } = polyLength(pts, closed);
  if (total === 0) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as LonLat);
  const out: LonLat[] = [];
  const count = pts.length;
  const steps = closed ? n : n - 1;
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / steps) * total;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const a = pts[seg % count];
    const b = pts[(seg + 1) % count];
    const len = cum[seg + 1] - cum[seg];
    const f = len === 0 ? 0 : (target - cum[seg]) / len;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Rotate closed ring b so that its vertex order best matches ring a (minimises total distance). */
function alignRing(a: LonLat[], b: LonLat[]): LonLat[] {
  const n = a.length;
  let best = 0;
  let bestD = Infinity;
  for (let off = 0; off < n; off++) {
    let d = 0;
    for (let i = 0; i < n; i += 2) {
      const p = a[i];
      const q = b[(i + off) % n];
      d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d > bestD) break;
    }
    if (d < bestD) {
      bestD = d;
      best = off;
    }
  }
  // also test reversed orientation
  const rev = [...b].reverse();
  let bestRev = 0;
  let bestDRev = Infinity;
  for (let off = 0; off < n; off++) {
    let d = 0;
    for (let i = 0; i < n; i += 2) {
      const p = a[i];
      const q = rev[(i + off) % n];
      d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d > bestDRev) break;
    }
    if (d < bestDRev) {
      bestDRev = d;
      bestRev = off;
    }
  }
  const src = bestDRev < bestD ? rev : b;
  const off = bestDRev < bestD ? bestRev : best;
  return src.map((_, i) => src[(i + off) % n]);
}

export function lerpShape(a: LonLat[], b: LonLat[], f: number, closed: boolean): LonLat[] {
  // Identical vertex counts → exact vertex-to-vertex morph (duplicated keyframes edited by hand).
  if (a.length === b.length && a.length > 0) return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * f, p[1] + (b[i][1] - p[1]) * f]);
  const n = Math.max(a.length, b.length, closed ? 48 : 24);
  let ra = resample(a, n, closed);
  let rb = resample(b, n, closed);
  if (closed) rb = alignRing(ra, rb);
  else {
    // choose orientation of open line that minimises distance
    let d1 = 0;
    let d2 = 0;
    for (let i = 0; i < n; i++) {
      d1 += (ra[i][0] - rb[i][0]) ** 2 + (ra[i][1] - rb[i][1]) ** 2;
      const q = rb[n - 1 - i];
      d2 += (ra[i][0] - q[0]) ** 2 + (ra[i][1] - q[1]) ** 2;
    }
    if (d2 < d1) rb = [...rb].reverse();
  }
  ra = ra.map((p, i) => [p[0] + (rb[i][0] - p[0]) * f, p[1] + (rb[i][1] - p[1]) * f]);
  return ra;
}

/** Interpolated shape at a date. Returns exact keyframe points when on/outside keyframe range. */
export function shapeAt(keyframes: ShapeKeyframe[], ms: number, closed: boolean): LonLat[] | null {
  if (!keyframes.length) return null;
  const kfs = [...keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const first = parseDate(kfs[0].date);
  if (ms <= first || kfs.length === 1) return kfs[0].points;
  for (let i = 1; i < kfs.length; i++) {
    const d = parseDate(kfs[i].date);
    if (ms <= d) {
      const prev = kfs[i - 1];
      const pd = parseDate(prev.date);
      if (ms === d) return kfs[i].points;
      const f = d === pd ? 1 : (ms - pd) / (d - pd);
      return lerpShape(prev.points, kfs[i].points, ease(kfs[i].easing ?? "linear", f), closed);
    }
  }
  return kfs[kfs.length - 1].points;
}

export function valueAt(keyframes: ValueKeyframe[] | undefined, ms: number): number | null {
  if (!keyframes || !keyframes.length) return null;
  const kfs = [...keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  if (ms <= parseDate(kfs[0].date)) return kfs[0].value;
  for (let i = 1; i < kfs.length; i++) {
    const d = parseDate(kfs[i].date);
    if (ms <= d) {
      const pd = parseDate(kfs[i - 1].date);
      const f = d === pd ? 1 : (ms - pd) / (d - pd);
      return kfs[i - 1].value + (kfs[i].value - kfs[i - 1].value) * f;
    }
  }
  return kfs[kfs.length - 1].value;
}

export interface CameraState {
  center: LonLat;
  zoom: number;
  roll: number;
}

export function cameraAt(keyframes: CameraKeyframe[], ms: number): CameraState {
  if (!keyframes.length) return { center: [15, 50], zoom: 4, roll: 0 };
  const kfs = [...keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const toState = (k: CameraKeyframe): CameraState => ({ center: [k.center[0], k.center[1]], zoom: k.zoom, roll: k.roll ?? 0 });
  if (ms <= parseDate(kfs[0].date) || kfs.length === 1) return toState(kfs[0]);
  for (let i = 1; i < kfs.length; i++) {
    const d = parseDate(kfs[i].date);
    if (ms <= d) {
      const a = kfs[i - 1];
      const b = kfs[i];
      const pd = parseDate(a.date);
      const f = ease(b.easing ?? "easeInOut", d === pd ? 1 : (ms - pd) / (d - pd));
      return {
        center: [a.center[0] + (b.center[0] - a.center[0]) * f, a.center[1] + (b.center[1] - a.center[1]) * f],
        zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * f),
        roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * f,
      };
    }
  }
  return toState(kfs[kfs.length - 1]);
}

/** Index of the keyframe that is active (latest with date <= ms), or 0. */
export function activeKeyframeIndex<T extends { date: string }>(keyframes: T[], ms: number): number {
  let idx = 0;
  let best = -Infinity;
  keyframes.forEach((k, i) => {
    const d = parseDate(k.date);
    if (d <= ms && d > best) {
      best = d;
      idx = i;
    }
  });
  return idx;
}

export function formatNumber(v: number, fmt: string): string {
  const n = Math.round(v);
  if (fmt === "none") return String(n);
  if (fmt === "compact") {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, "") + "k";
    return String(n);
  }
  const sep = fmt === "dot" ? "." : fmt === "space" ? "\u2009" : ",";
  return String(Math.abs(n))
    .replace(/\B(?=(\d{3})+(?!\d))/g, sep)
    .replace(/^/, n < 0 ? "-" : "");
}
