import type { Easing, FrontEvent, FrontKeyframe, FrontTheater } from "./types";

export type Pt = [number, number];
export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * t;
}
function ease(kind: Easing | undefined, x: number): number {
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

const CLOSED_EPS = 0.04;

export function cloneKeyframes(kfs: FrontKeyframe[]): FrontKeyframe[] {
  return kfs.map((k) => ({ offset: k.offset, points: k.points.map((p) => [p[0], p[1]] as Pt) }));
}

export function isClosedPolyline(pts: Pt[], closedFlag?: boolean): boolean {
  if (closedFlag) return true;
  if (pts.length < 3) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return Math.hypot(lonDelta(a[0], b[0]), a[1] - b[1]) < CLOSED_EPS;
}

export function lonDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

export function unwrapLons(pts: Pt[]): Pt[] {
  if (!pts.length) return [];
  const out: Pt[] = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[i - 1][0];
    let lon = pts[i][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, pts[i][1]]);
  }
  return out;
}

function dropClosingDup(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.hypot(lonDelta(a[0], b[0]), a[1] - b[1]) < CLOSED_EPS) return pts.slice(0, -1);
  return pts.slice();
}

function crPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (k: 0 | 1) =>
    0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  return [axis(0), axis(1)];
}

/** Catmull-Rom through control points. Lon is unwrapped first so segments don't jump. */
export function catmullRom(pts: Pt[], closed: boolean, perSeg = 8): Pt[] {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]] as Pt);
  if (pts.length === 2) return unwrapLons(pts);
  const src = unwrapLons(closed ? dropClosingDup(pts) : pts);
  const n = src.length;
  const at = (i: number): Pt => {
    if (closed) return src[((i % n) + n) % n];
    return src[Math.max(0, Math.min(n - 1, i))];
  };
  const segs = closed ? n : n - 1;
  const out: Pt[] = [];
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < perSeg; s++) out.push(crPoint(p0, p1, p2, p3, s / perSeg));
  }
  if (closed) out.push([out[0][0], out[0][1]]);
  else out.push([src[n - 1][0], src[n - 1][1]]);
  return out;
}

export function resamplePolyline(pts: Pt[], n: number, closed: boolean): Pt[] {
  const src = unwrapLons(closed ? dropClosingDup(pts) : pts);
  if (n < 2) return src.slice(0, 1);
  if (!src.length) return [];
  if (src.length === 1) return Array.from({ length: n }, () => [src[0][0], src[0][1]] as Pt);
  const segs = closed ? src.length : src.length - 1;
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const a = src[i];
    const b = src[(i + 1) % src.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(d);
    total += d;
  }
  if (total < 1e-9) return Array.from({ length: n }, () => [src[0][0], src[0][1]] as Pt);
  const out: Pt[] = [];
  const samples = closed ? n : n;
  for (let i = 0; i < samples; i++) {
    const target = closed ? (i / samples) * total : (i / (samples - 1)) * total;
    let acc = 0;
    let seg = 0;
    while (seg < segs - 1 && acc + lens[seg] < target) {
      acc += lens[seg];
      seg++;
    }
    const a = src[seg];
    const b = src[(seg + 1) % src.length];
    const u = lens[seg] < 1e-9 ? 0 : (target - acc) / lens[seg];
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  return out;
}

export function densify(pts: Pt[], closed: boolean, n = 96): Pt[] {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]] as Pt);
  const smooth = pts.length >= 3 ? catmullRom(pts, closed) : unwrapLons(pts);
  return resamplePolyline(smooth, n, closed);
}

export function interpolatePolylines(a: Pt[], b: Pt[], t: number, closed: boolean): Pt[] {
  const n = clamp(Math.max(a.length, b.length, 8) * 2, 32, 128);
  const sa = densify(a, closed, n);
  const sb = densify(b, closed, n);
  const count = Math.min(sa.length, sb.length);
  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    out.push([lerpAngle(sa[i][0], sb[i][0], t), lerp(sa[i][1], sb[i][1], t)]);
  }
  return out;
}

export function sortedKeyframes(kfs: FrontKeyframe[]): FrontKeyframe[] {
  return kfs.filter((k) => k.points.length >= 1).slice().sort((a, b) => a.offset - b.offset);
}

/** Interpolate a front event at local time `u` (seconds from start). */
export function interpolateFront(ev: FrontEvent, u: number): Pt[] | null {
  const closed = isClosedPolyline(ev.keyframes[0]?.points ?? [], ev.closed);
  const kfs = sortedKeyframes(ev.keyframes);
  if (!kfs.length) return null;
  const duration = Math.max(0, ev.end - ev.start);
  const lastOff = Math.max(duration, kfs[kfs.length - 1].offset);
  const t = clamp(u, 0, lastOff);
  if (t <= kfs[0].offset) return densify(kfs[0].points, closed);
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t <= b.offset || i === kfs.length - 2) {
      if (t >= b.offset && i === kfs.length - 2) return densify(kfs[kfs.length - 1].points, closed);
      const span = Math.max(1e-6, b.offset - a.offset);
      const p = ease(ev.easing, clamp((t - a.offset) / span, 0, 1));
      return interpolatePolylines(a.points, b.points, p, closed);
    }
  }
  return densify(kfs[kfs.length - 1].points, closed);
}

export function nearestKeyframeIndex(kfs: FrontKeyframe[], offset: number): number {
  const sorted = sortedKeyframes(kfs);
  if (!sorted.length) return -1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const d = Math.abs(sorted[i].offset - offset);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // map back to original array index
  const target = sorted[best];
  return kfs.findIndex((k) => k === target || (k.offset === target.offset && k.points === target.points));
}

export function keyframeAt(kfs: FrontKeyframe[], offset: number, eps = 0.08): number {
  let best = -1;
  let bestD = eps;
  for (let i = 0; i < kfs.length; i++) {
    const d = Math.abs(kfs[i].offset - offset);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function inferCapturedSide(points: Pt[]): Pt {
  if (!points.length) return [0, 0];
  if (points.length === 1) return [points[0][0], points[0][1] + 0.4];
  const src = unwrapLons(dropClosingDup(points));
  const i = Math.floor(src.length / 2);
  const a = src[Math.max(0, i - 1)];
  const b = src[Math.min(src.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const mid = src[i];
  return [mid[0] - (dy / len) * 0.45, mid[1] + (dx / len) * 0.45];
}

export function defaultTheater(against?: string): FrontTheater {
  return against ? "sides" : "land";
}

export function pointInRing(pt: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) * 0.5;
}

function projectToBoundary(p: Pt, r: ScreenRect): Pt {
  const inside = p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;
  if (inside) {
    const ds = [p[0] - r.x0, r.x1 - p[0], p[1] - r.y0, r.y1 - p[1]];
    const m = Math.min(...ds);
    if (m === ds[0]) return [r.x0, p[1]];
    if (m === ds[1]) return [r.x1, p[1]];
    if (m === ds[2]) return [p[0], r.y0];
    return [p[0], r.y1];
  }
  return [Math.max(r.x0, Math.min(r.x1, p[0])), Math.max(r.y0, Math.min(r.y1, p[1]))];
}

function rayExit(origin: Pt, dir: Pt, r: ScreenRect): Pt {
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const inside = origin[0] >= r.x0 && origin[0] <= r.x1 && origin[1] >= r.y0 && origin[1] <= r.y1;
  if (!inside) return projectToBoundary(origin, r);
  let t = Infinity;
  const eps = 1e-9;
  if (dx > eps) t = Math.min(t, (r.x1 - origin[0]) / dx);
  else if (dx < -eps) t = Math.min(t, (r.x0 - origin[0]) / dx);
  if (dy > eps) t = Math.min(t, (r.y1 - origin[1]) / dy);
  else if (dy < -eps) t = Math.min(t, (r.y0 - origin[1]) / dy);
  if (!Number.isFinite(t) || t < 0) return projectToBoundary(origin, r);
  return [origin[0] + dx * t, origin[1] + dy * t];
}

/** Parameter 0–4 walking the rect CW: top, right, bottom, left. */
function boundaryParam(p: Pt, r: ScreenRect): number {
  const w = Math.max(1e-6, r.x1 - r.x0);
  const h = Math.max(1e-6, r.y1 - r.y0);
  const eps = 1.5;
  const onTop = Math.abs(p[1] - r.y0) <= eps;
  const onBottom = Math.abs(p[1] - r.y1) <= eps;
  const onLeft = Math.abs(p[0] - r.x0) <= eps;
  const onRight = Math.abs(p[0] - r.x1) <= eps;
  if (onTop && !onRight) return clamp((p[0] - r.x0) / w, 0, 1);
  if (onRight && !onBottom) return 1 + clamp((p[1] - r.y0) / h, 0, 1);
  if (onBottom && !onLeft) return 2 + clamp((r.x1 - p[0]) / w, 0, 1);
  if (onLeft) return 3 + clamp((r.y1 - p[1]) / h, 0, 1);
  return clamp((p[0] - r.x0) / w, 0, 1);
}

function walkCorners(from: number, to: number, r: ScreenRect, reverse: boolean): Pt[] {
  // integer k → corner at the end of edge k-1: TR, BR, BL, TL
  const corner = (k: number): Pt => {
    const i = ((k % 4) + 4) % 4;
    if (i === 1) return [r.x1, r.y0];
    if (i === 2) return [r.x1, r.y1];
    if (i === 3) return [r.x0, r.y1];
    return [r.x0, r.y0];
  };
  const out: Pt[] = [];
  if (!reverse) {
    const end = to >= from ? to : to + 4;
    for (let k = Math.floor(from) + 1; k < end - 1e-9; k++) out.push(corner(k));
  } else {
    const end = to <= from ? to : to - 4;
    for (let k = Math.ceil(from) - 1; k > end + 1e-9; k--) out.push(corner(k));
  }
  return out;
}

/**
 * Close an open screen-space polyline against an inflated viewport rect and
 * pick the half that contains `captured`. Closed polylines return the ring.
 */
export function capturedFillRing(polyline: Pt[], captured: Pt, bounds: ScreenRect, closed: boolean): Pt[] | null {
  if (polyline.length < 2) return null;
  if (closed || isClosedPolyline(polyline, false)) {
    const ring = polyline.map((p) => [p[0], p[1]] as Pt);
    if (Math.hypot(ring[0][0] - ring[ring.length - 1][0], ring[0][1] - ring[ring.length - 1][1]) > 0.5) {
      ring.push([ring[0][0], ring[0][1]]);
    }
    return ring;
  }
  const n = polyline.length;
  const d0: Pt = [polyline[0][0] - polyline[1][0], polyline[0][1] - polyline[1][1]];
  const d1: Pt = [polyline[n - 1][0] - polyline[n - 2][0], polyline[n - 1][1] - polyline[n - 2][1]];
  const startExit = rayExit(polyline[0], d0, bounds);
  const endExit = rayExit(polyline[n - 1], d1, bounds);
  const a = boundaryParam(endExit, bounds);
  const b = boundaryParam(startExit, bounds);
  const cw = walkCorners(a, b, bounds, false);
  const ccw = walkCorners(a, b, bounds, true);
  const candA: Pt[] = [...polyline, endExit, ...cw, startExit];
  const candB: Pt[] = [...polyline, endExit, ...ccw, startExit];
  const inA = pointInRing(captured, candA);
  const inB = pointInRing(captured, candB);
  if (inA && !inB) return candA;
  if (inB && !inA) return candB;
  return ringArea(candA) >= ringArea(candB) ? candA : candB;
}

export function distPointToSegment(p: Pt, a: Pt, b: Pt): { dist: number; t: number; closest: Pt } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1);
  const closest: Pt = [a[0] + dx * t, a[1] + dy * t];
  return { dist: Math.hypot(p[0] - closest[0], p[1] - closest[1]), t, closest };
}

export function polylineScreenBBox(pts: Pt[], pad: number): ScreenRect | null {
  if (!pts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
