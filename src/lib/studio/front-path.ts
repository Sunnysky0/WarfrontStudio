import type { FrontBezierNode, FrontBezierPath, LonLat } from "./types";

export type ScreenPoint = [number, number];

export interface FrontPathSample {
  screen: ScreenPoint;
  geo: LonLat;
}

export type ScreenToLonLat = (point: ScreenPoint) => LonLat | null;
export type LonLatToScreen = (point: LonLat) => ScreenPoint | null;

type Cubic = [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];

const GEO_TOLERANCE = 1e-5;
const MAX_FLATTEN_DEPTH = 12;
const MAX_FLATTEN_POINTS = 4096;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function add(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return [a[0] + b[0], a[1] + b[1]];
}

function sub(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return [a[0] - b[0], a[1] - b[1]];
}

function mul(a: ScreenPoint, k: number): ScreenPoint {
  return [a[0] * k, a[1] * k];
}

function dot(a: ScreenPoint, b: ScreenPoint): number {
  return a[0] * b[0] + a[1] * b[1];
}

function len(a: ScreenPoint): number {
  return Math.hypot(a[0], a[1]);
}

function normalize(a: ScreenPoint): ScreenPoint {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
}

function lerpPoint(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function lonDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return d;
}

function normalizeLon(lon: number): number {
  return ((lon + 540) % 360) - 180;
}

export function quantizeLonLat(point: LonLat): LonLat {
  return [Number(normalizeLon(point[0]).toFixed(6)), Number(clamp(point[1], -90, 90).toFixed(6))];
}

function vectorFrom(anchor: LonLat, handle: LonLat): LonLat {
  return [Number(lonDelta(anchor[0], handle[0]).toFixed(6)), Number((handle[1] - anchor[1]).toFixed(6))];
}

function cloneVector(v: LonLat | undefined): LonLat | undefined {
  return v ? [v[0], v[1]] : undefined;
}

export function cloneBezierPath(path: FrontBezierPath): FrontBezierPath {
  return {
    kind: "bezier",
    nodes: path.nodes.map((node) => ({
      anchor: [node.anchor[0], node.anchor[1]],
      in: cloneVector(node.in),
      out: cloneVector(node.out),
      linked: node.linked,
    })),
  };
}

export function reverseBezierPath(path: FrontBezierPath): FrontBezierPath {
  return {
    kind: "bezier",
    nodes: path.nodes
      .slice()
      .reverse()
      .map((node) => ({
        anchor: [node.anchor[0], node.anchor[1]],
        in: cloneVector(node.out),
        out: cloneVector(node.in),
        linked: node.linked,
      })),
  };
}

function bezierPoint(cubic: Cubic, t: number): ScreenPoint {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    cubic[0][0] * a + cubic[1][0] * b + cubic[2][0] * c + cubic[3][0] * d,
    cubic[0][1] * a + cubic[1][1] * b + cubic[2][1] * c + cubic[3][1] * d,
  ];
}

function bezierFirstDerivative(cubic: Cubic, t: number): ScreenPoint {
  const mt = 1 - t;
  return [
    3 * mt * mt * (cubic[1][0] - cubic[0][0]) + 6 * mt * t * (cubic[2][0] - cubic[1][0]) + 3 * t * t * (cubic[3][0] - cubic[2][0]),
    3 * mt * mt * (cubic[1][1] - cubic[0][1]) + 6 * mt * t * (cubic[2][1] - cubic[1][1]) + 3 * t * t * (cubic[3][1] - cubic[2][1]),
  ];
}

function bezierSecondDerivative(cubic: Cubic, t: number): ScreenPoint {
  return [
    6 * (1 - t) * (cubic[2][0] - 2 * cubic[1][0] + cubic[0][0]) + 6 * t * (cubic[3][0] - 2 * cubic[2][0] + cubic[1][0]),
    6 * (1 - t) * (cubic[2][1] - 2 * cubic[1][1] + cubic[0][1]) + 6 * t * (cubic[3][1] - 2 * cubic[2][1] + cubic[1][1]),
  ];
}

function chordLengthParameterize(points: ScreenPoint[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(points[i], points[i - 1])));
  const total = u[u.length - 1];
  if (total < 1e-9) return u.map((_, i) => i / Math.max(1, u.length - 1));
  return u.map((v) => v / total);
}

function generateBezier(points: ScreenPoint[], first: number, last: number, u: number[], tan1: ScreenPoint, tan2: ScreenPoint): Cubic {
  const p0 = points[first];
  const p3 = points[last];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i <= last - first; i++) {
    const t = u[i];
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * t * mt * mt;
    const b2 = 3 * t * t * mt;
    const b3 = t * t * t;
    const a1 = mul(tan1, b1);
    const a2 = mul(tan2, b2);
    const tmp = sub(points[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
  const segLength = len(sub(p3, p0));
  const epsilon = 1e-6 * segLength;
  if (alpha1 < epsilon || alpha2 < epsilon) alpha1 = alpha2 = segLength / 3;
  return [p0, add(p0, mul(tan1, alpha1)), add(p3, mul(tan2, alpha2)), p3];
}

function computeMaxError(points: ScreenPoint[], first: number, last: number, cubic: Cubic, u: number[]): { error: number; split: number } {
  let split = Math.floor((first + last) / 2);
  let error = 0;
  for (let i = first + 1; i < last; i++) {
    const p = bezierPoint(cubic, u[i - first]);
    const d = sub(p, points[i]);
    const dist = dot(d, d);
    if (dist > error) {
      error = dist;
      split = i;
    }
  }
  return { error, split };
}

function newtonRaphsonRootFind(cubic: Cubic, point: ScreenPoint, u: number): number {
  const q = bezierPoint(cubic, u);
  const q1 = bezierFirstDerivative(cubic, u);
  const q2 = bezierSecondDerivative(cubic, u);
  const diff = sub(q, point);
  const numerator = dot(diff, q1);
  const denominator = dot(q1, q1) + dot(diff, q2);
  if (Math.abs(denominator) < 1e-12) return u;
  return clamp(u - numerator / denominator, 0, 1);
}

function reparameterize(points: ScreenPoint[], first: number, last: number, u: number[], cubic: Cubic): number[] {
  return u.map((value, i) => newtonRaphsonRootFind(cubic, points[first + i], value));
}

function fitCubic(
  points: ScreenPoint[],
  first: number,
  last: number,
  tan1: ScreenPoint,
  tan2: ScreenPoint,
  errorSq: number,
  output: Cubic[],
  maxSegments: number
) {
  if (output.length >= maxSegments) return;
  if (last - first === 1) {
    const distance = len(sub(points[last], points[first])) / 3;
    output.push([points[first], add(points[first], mul(tan1, distance)), add(points[last], mul(tan2, distance)), points[last]]);
    return;
  }
  let u = chordLengthParameterize(points, first, last);
  let cubic = generateBezier(points, first, last, u, tan1, tan2);
  let measured = computeMaxError(points, first, last, cubic, u);
  if (measured.error <= errorSq) {
    output.push(cubic);
    return;
  }
  if (measured.error <= errorSq * 16) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(points, first, last, u, cubic);
      cubic = generateBezier(points, first, last, u, tan1, tan2);
      measured = computeMaxError(points, first, last, cubic, u);
      if (measured.error <= errorSq) {
        output.push(cubic);
        return;
      }
    }
  }
  const split = clamp(measured.split, first + 1, last - 1);
  let centerTan = normalize(sub(points[split - 1], points[split + 1]));
  if (len(centerTan) < 1e-9) centerTan = normalize(sub(points[split], points[split - 1]));
  fitCubic(points, first, split, tan1, centerTan, errorSq, output, maxSegments);
  fitCubic(points, split, last, mul(centerTan, -1), tan2, errorSq, output, maxSegments);
}

function dedupeSamples(samples: FrontPathSample[], minDistance: number): FrontPathSample[] {
  if (samples.length < 2) return samples.slice();
  const out = [samples[0]];
  for (let i = 1; i < samples.length - 1; i++) {
    const fromLast = sub(samples[i].screen, out[out.length - 1].screen);
    const toNext = sub(samples[i + 1].screen, samples[i].screen);
    const distance = len(fromLast);
    const turn = Math.acos(clamp(dot(normalize(fromLast), normalize(toNext)), -1, 1));
    if (distance >= minDistance || (distance > 1e-6 && len(toNext) > 1e-6 && turn > Math.PI / 6)) out.push(samples[i]);
  }
  const last = samples[samples.length - 1];
  if (last !== out[out.length - 1]) out.push(last);
  return out;
}

export function stabilizeSamples(samples: FrontPathSample[], amount: number): FrontPathSample[] {
  const strength = clamp(amount / 100, 0, 1);
  if (strength <= 0 || samples.length < 3) return samples.slice();
  const alpha = 1 - strength * 0.82;
  const out: FrontPathSample[] = [{ screen: [...samples[0].screen], geo: [...samples[0].geo] } as FrontPathSample];
  for (let i = 1; i < samples.length; i++) {
    const prev = out[i - 1];
    const cur = samples[i];
    out.push({
      screen: [prev.screen[0] + (cur.screen[0] - prev.screen[0]) * alpha, prev.screen[1] + (cur.screen[1] - prev.screen[1]) * alpha],
      geo: [prev.geo[0] + lonDelta(prev.geo[0], cur.geo[0]) * alpha, prev.geo[1] + (cur.geo[1] - prev.geo[1]) * alpha],
    });
  }
  out[out.length - 1] = samples[samples.length - 1];
  return out;
}

function rdpIndices(samples: FrontPathSample[], tolerance: number): number[] {
  const keep = new Set<number>([0, samples.length - 1]);
  const stack: [number, number][] = [[0, samples.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = samples[first].screen;
    const b = samples[last].screen;
    const delta = sub(b, a);
    const l2 = dot(delta, delta);
    let best = tolerance;
    let split = -1;
    for (let i = first + 1; i < last; i++) {
      const point = samples[i].screen;
      const t = l2 < 1e-12 ? 0 : clamp(dot(sub(point, a), delta) / l2, 0, 1);
      const distance = len(sub(point, [a[0] + delta[0] * t, a[1] + delta[1] * t]));
      if (distance > best) {
        best = distance;
        split = i;
      }
    }
    if (split >= 0) {
      keep.add(split);
      stack.push([first, split], [split, last]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function cappedSampleIndices(samples: FrontPathSample[], maxNodes: number): number[] {
  if (samples.length <= maxNodes) return samples.map((_, index) => index);
  let low = 0;
  let high = 0;
  for (const sample of samples) high = Math.max(high, len(sub(sample.screen, samples[0].screen)));
  let best = [0, samples.length - 1];
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const indices = rdpIndices(samples, mid);
    if (indices.length > maxNodes) low = mid;
    else {
      best = indices;
      high = mid;
    }
  }
  return best;
}

function linearPathFromSamples(samples: FrontPathSample[], maxNodes: number, invert?: ScreenToLonLat): FrontBezierPath {
  const selected = cappedSampleIndices(samples, Math.max(2, maxNodes)).map((index) => samples[index]);
  return {
    kind: "bezier",
    nodes: selected.map((sample) => ({ anchor: quantizeLonLat(invert?.(sample.screen) ?? sample.geo), linked: false })),
  };
}

function buildFittedPath(cleaned: FrontPathSample[], tolerancePx: number, invert: ScreenToLonLat, maxNodes: number): FrontBezierPath {
  const points = cleaned.map((sample) => sample.screen);
  const cubics: Cubic[] = [];
  const tan1 = normalize(sub(points[1], points[0]));
  const tan2 = normalize(sub(points[points.length - 2], points[points.length - 1]));
  fitCubic(points, 0, points.length - 1, tan1, tan2, tolerancePx * tolerancePx, cubics, Math.max(1, maxNodes - 1));
  const final = cubics[cubics.length - 1]?.[3];
  if (!cubics.length || !final || len(sub(final, points[points.length - 1])) > 1e-5) return linearPathFromSamples(cleaned, maxNodes, invert);

  const toGeo = (screen: ScreenPoint, fallback: LonLat): LonLat => quantizeLonLat(invert(screen) ?? fallback);
  const nodes: FrontBezierNode[] = [];
  cubics.forEach((cubic, index) => {
    const startFallback = cleaned[index === 0 ? 0 : Math.min(cleaned.length - 1, index)].geo;
    const endFallback = cleaned[Math.min(cleaned.length - 1, index + 1)].geo;
    const a = index === 0 ? toGeo(cubic[0], startFallback) : nodes[nodes.length - 1].anchor;
    const c1 = toGeo(cubic[1], a);
    const end = toGeo(cubic[3], endFallback);
    const c2 = toGeo(cubic[2], end);
    if (index === 0) nodes.push({ anchor: a, out: vectorFrom(a, c1), linked: true });
    else nodes[nodes.length - 1].out = vectorFrom(nodes[nodes.length - 1].anchor, c1);
    nodes.push({ anchor: end, in: vectorFrom(end, c2), linked: true });
  });
  return { kind: "bezier", nodes };
}

function distanceToScreenPolyline(point: ScreenPoint, line: ScreenPoint[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = sub(b, a);
    const l2 = dot(d, d);
    const t = l2 < 1e-12 ? 0 : clamp(dot(sub(point, a), d) / l2, 0, 1);
    best = Math.min(best, len(sub(point, [a[0] + d[0] * t, a[1] + d[1] * t])));
  }
  return best;
}

export function maxReprojectionError(samples: FrontPathSample[], path: FrontBezierPath, project: LonLatToScreen): number {
  const projected = flattenBezierPath(path, false, 1e-6)
    .map(project)
    .filter((point): point is ScreenPoint => point != null && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (projected.length < 2) return Infinity;
  let error = 0;
  for (const sample of samples) error = Math.max(error, distanceToScreenPolyline(sample.screen, projected));
  return error;
}

export function fitBezierPath(
  samples: FrontPathSample[],
  tolerancePx: number,
  invert: ScreenToLonLat,
  maxNodes = 2048,
  project?: LonLatToScreen
): FrontBezierPath | null {
  const cleaned = dedupeSamples(samples, 0.25);
  if (cleaned.length < 2) return null;
  let fitted = buildFittedPath(cleaned, tolerancePx, invert, maxNodes);
  if (!project) return fitted;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (maxReprojectionError(cleaned, fitted, project) <= tolerancePx + 1e-6) return fitted;
    fitted = buildFittedPath(cleaned, tolerancePx / Math.pow(2, attempt + 1), invert, maxNodes);
    if (fitted.nodes.length >= maxNodes) break;
  }
  if (cleaned.length <= maxNodes) return linearPathFromSamples(cleaned, maxNodes, invert);
  return fitted;
}

function controlPoint(node: FrontBezierNode, handle: "in" | "out", anchorLon: number): LonLat {
  const vector = node[handle] ?? [0, 0];
  let lon = node.anchor[0];
  while (lon - anchorLon > 180) lon -= 360;
  while (lon - anchorLon < -180) lon += 360;
  return [lon + vector[0], node.anchor[1] + vector[1]];
}

function geographicCubic(a: FrontBezierNode, b: FrontBezierNode): [LonLat, LonLat, LonLat, LonLat] {
  let bx = a.anchor[0] + lonDelta(a.anchor[0], b.anchor[0]);
  const p0: LonLat = [a.anchor[0], a.anchor[1]];
  const p1 = controlPoint(a, "out", p0[0]);
  const p3: LonLat = [bx, b.anchor[1]];
  let bAnchorLon = b.anchor[0];
  while (bAnchorLon - bx > 180) bAnchorLon -= 360;
  while (bAnchorLon - bx < -180) bAnchorLon += 360;
  bx = bAnchorLon;
  const incoming = b.in ?? [0, 0];
  const p2: LonLat = [bx + incoming[0], b.anchor[1] + incoming[1]];
  return [p0, p1, p2, p3];
}

function cubicFlatness(cubic: [LonLat, LonLat, LonLat, LonLat]): number {
  const [p0, p1, p2, p3] = cubic;
  const dx = p3[0] - p0[0];
  const dy = p3[1] - p0[1];
  const l = Math.hypot(dx, dy);
  if (l < 1e-12) return Math.max(len(sub(p1, p0)), len(sub(p2, p0)));
  const d1 = Math.abs(dy * p1[0] - dx * p1[1] + p3[0] * p0[1] - p3[1] * p0[0]) / l;
  const d2 = Math.abs(dy * p2[0] - dx * p2[1] + p3[0] * p0[1] - p3[1] * p0[0]) / l;
  return Math.max(d1, d2);
}

function splitCubic(cubic: [LonLat, LonLat, LonLat, LonLat], t = 0.5): [[LonLat, LonLat, LonLat, LonLat], [LonLat, LonLat, LonLat, LonLat]] {
  const [p0, p1, p2, p3] = cubic;
  const q0 = lerpPoint(p0, p1, t);
  const q1 = lerpPoint(p1, p2, t);
  const q2 = lerpPoint(p2, p3, t);
  const r0 = lerpPoint(q0, q1, t);
  const r1 = lerpPoint(q1, q2, t);
  const s = lerpPoint(r0, r1, t);
  return [[p0, q0, r0, s], [s, r1, q2, p3]];
}

function flattenCubic(cubic: [LonLat, LonLat, LonLat, LonLat], out: LonLat[], depth: number, tolerance: number, maxPoints: number) {
  if (out.length >= maxPoints) return;
  if (depth >= MAX_FLATTEN_DEPTH || cubicFlatness(cubic) <= tolerance) {
    out.push([normalizeLon(cubic[3][0]), cubic[3][1]]);
    return;
  }
  const [left, right] = splitCubic(cubic);
  flattenCubic(left, out, depth + 1, tolerance, maxPoints);
  flattenCubic(right, out, depth + 1, tolerance, maxPoints);
}

const flattenCache = new WeakMap<FrontBezierPath, Map<string, LonLat[]>>();

export function flattenBezierPath(
  path: FrontBezierPath,
  closed: boolean,
  tolerance = GEO_TOLERANCE,
  maxPoints = MAX_FLATTEN_POINTS
): LonLat[] {
  const key = `${+closed}:${tolerance}:${maxPoints}`;
  const cached = flattenCache.get(path)?.get(key);
  if (cached) return cached.map((p) => [p[0], p[1]] as LonLat);
  if (path.nodes.length < 2) return path.nodes.map((node) => [node.anchor[0], node.anchor[1]]);
  const out: LonLat[] = [[path.nodes[0].anchor[0], path.nodes[0].anchor[1]]];
  const segments = closed ? path.nodes.length : path.nodes.length - 1;
  for (let i = 0; i < segments && out.length < maxPoints; i++) {
    const cubic = geographicCubic(path.nodes[i], path.nodes[(i + 1) % path.nodes.length]);
    flattenCubic(cubic, out, 0, tolerance, maxPoints);
  }
  if (closed && out.length > 1) out.pop();
  let cache = flattenCache.get(path);
  if (!cache) {
    cache = new Map();
    flattenCache.set(path, cache);
  }
  cache.set(key, out);
  return out.map((p) => [p[0], p[1]] as LonLat);
}

export function polylineToBezierPath(points: LonLat[], closed: boolean): FrontBezierPath {
  const src = points.slice();
  if (closed && src.length > 2 && Math.hypot(lonDelta(src[0][0], src[src.length - 1][0]), src[0][1] - src[src.length - 1][1]) < 1e-7) src.pop();
  if (src.length < 2) return { kind: "bezier", nodes: src.map((anchor) => ({ anchor: quantizeLonLat(anchor) })) };
  const nodes = src.map((anchor, i): FrontBezierNode => {
    const prev = src[closed ? (i - 1 + src.length) % src.length : Math.max(0, i - 1)];
    const next = src[closed ? (i + 1) % src.length : Math.min(src.length - 1, i + 1)];
    const tangent: LonLat = [lonDelta(prev[0], next[0]) / 6, (next[1] - prev[1]) / 6];
    return {
      anchor: quantizeLonLat(anchor),
      in: i === 0 && !closed ? undefined : [-tangent[0], -tangent[1]],
      out: i === src.length - 1 && !closed ? undefined : tangent,
      linked: true,
    };
  });
  return { kind: "bezier", nodes };
}

/** Preserve an already-compiled polyline exactly; each cubic segment remains collinear. */
export function polylineToLinearBezierPath(points: LonLat[], closed: boolean): FrontBezierPath {
  const src = points.slice();
  if (closed && src.length > 2 && Math.hypot(lonDelta(src[0][0], src[src.length - 1][0]), src[0][1] - src[src.length - 1][1]) < 1e-7) src.pop();
  return {
    kind: "bezier",
    nodes: src.map((anchor) => ({ anchor: quantizeLonLat(anchor), linked: false })),
  };
}

export function splitBezierPathSegment(path: FrontBezierPath, segmentIndex: number, t: number, closed: boolean): { path: FrontBezierPath; index: number } {
  const next = cloneBezierPath(path);
  const n = next.nodes.length;
  if (n < 2) return { path: next, index: -1 };
  const aIndex = clamp(segmentIndex, 0, closed ? n - 1 : n - 2);
  const bIndex = (aIndex + 1) % n;
  const a = next.nodes[aIndex];
  const b = next.nodes[bIndex];
  const cubic = geographicCubic(a, b);
  const [left, right] = splitCubic(cubic, clamp(t, 0.001, 0.999));
  a.out = vectorFrom(a.anchor, quantizeLonLat(left[1]));
  b.in = vectorFrom(b.anchor, quantizeLonLat(right[2]));
  const anchor = quantizeLonLat(left[3]);
  const inserted: FrontBezierNode = {
    anchor,
    in: vectorFrom(anchor, quantizeLonLat(left[2])),
    out: vectorFrom(anchor, quantizeLonLat(right[1])),
    linked: true,
  };
  const index = bIndex === 0 ? next.nodes.length : bIndex;
  next.nodes.splice(index, 0, inserted);
  return { path: next, index };
}

function orientLinkedHandle(vector: LonLat, length: number): LonLat {
  const l = Math.hypot(vector[0], vector[1]);
  return l > 1e-12 ? [(-vector[0] / l) * length, (-vector[1] / l) * length] : [0, 0];
}

export function setBezierHandle(path: FrontBezierPath, index: number, side: "in" | "out", vector: LonLat, breakLink: boolean): FrontBezierPath {
  const next = cloneBezierPath(path);
  const node = next.nodes[index];
  if (!node) return next;
  node[side] = [vector[0], vector[1]];
  if (breakLink) node.linked = false;
  const opposite = side === "in" ? "out" : "in";
  if (node.linked && !breakLink) {
    const currentLength = node[opposite] ? Math.hypot(node[opposite]![0], node[opposite]![1]) : Math.hypot(vector[0], vector[1]);
    node[opposite] = orientLinkedHandle(vector, currentLength);
  }
  return next;
}

export function pathHasSelfIntersection(points: LonLat[], closed: boolean): boolean {
  const segs = closed ? points.length : points.length - 1;
  const orient = (a: LonLat, b: LonLat, c: LonLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < segs; j++) {
      if (Math.abs(i - j) <= 1 || (closed && i === 0 && j === segs - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
    }
  }
  return false;
}
