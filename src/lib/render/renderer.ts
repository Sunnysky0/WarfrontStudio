import { geoGraticule10, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import type { Arrow, LonLat, Membership, Project, Selection } from "../types";
import { cameraAt, formatNumber, shapeAt, valueAt, type CameraState } from "../interpolate";
import { dateAtTime, formatClock, formatDate, formatElapsed, isActive, parseDate, timeAtDate, DAY_MS } from "../time";
import { buildProjection, visibleBounds } from "../geo/projections";
import { bboxIntersects, type BoundedFeature, type CityPoint, type LoadedLayer } from "../geo/basemap";
import { ICONS } from "../assets";

export interface LayerData {
  land?: LoadedLayer;
  lakes?: LoadedLayer;
  rivers?: LoadedLayer;
  railroads?: LoadedLayer;
  provinces?: LoadedLayer;
  borders?: LoadedLayer;
  cities?: CityPoint[];
}

export interface EditorOverlay {
  selection?: Selection | null;
  hoverCountry?: string | null;
  draft?: LonLat[] | null;
  draftClosed?: boolean;
  showHandles?: boolean;
  hoverVertex?: number | null;
}

export interface RenderOptions {
  width: number;
  height: number;
  editor?: EditorOverlay;
  forExport?: boolean;
  /** Skip fine detail layers (provinces, railroads, rivers, city labels) while the camera is being dragged. */
  fast?: boolean;
}

export interface FrameInfo {
  dateMs: number;
  camera: CameraState;
  projection: GeoProjection;
}

export interface HitResult {
  type: "zone" | "line" | "label" | "marker" | "arrow";
  id: string;
  vertex?: number; // vertex index for zone/line, 0/1 for arrow endpoints
  segment?: number; // insertion index when clicking on an edge
}

const pathCtxOf = (p: Path2D) => ({
  beginPath() {},
  moveTo: (x: number, y: number) => p.moveTo(x, y),
  lineTo: (x: number, y: number) => p.lineTo(x, y),
  closePath: () => p.closePath(),
  arc: (x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean) => p.arc(x, y, r, a0, a1, ccw),
});

export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function factionForCountry(memberships: Membership[], props: Record<string, string | number | undefined>, ms: number): string | null {
  const name = String(props.NAME ?? "");
  const subj = String(props.SUBJECTO ?? "");
  let best: Membership | null = null;
  let bestScore = -Infinity;
  for (const m of memberships) {
    if (!isActive(m.from, m.to, ms)) continue;
    let score = -Infinity;
    if (m.country === name) score = 1e15;
    else if (m.includeSubjects && subj && m.country === subj) score = 0;
    if (score === -Infinity) continue;
    const from = m.from ? parseDate(m.from) : -8.64e15;
    score += from;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best?.factionId ?? null;
}

/** Planar signed area in lon/lat (negative = clockwise, which is what d3-geo expects for exterior rings). */
export function signedArea(pts: LonLat[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

function ringFeature(points: LonLat[], closed: boolean): Feature<Geometry> {
  if (closed) {
    // d3-geo uses spherical winding: a counter-clockwise ring would mean "the whole sphere except this area".
    const oriented = signedArea(points) > 0 ? [...points].reverse() : points;
    const ring = [...oriented, oriented[0]];
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } };
}

function fadeAlpha(project: Project, t: number, from?: string, to?: string, firstKf?: string, fade = 0.5): number {
  let a = 1;
  const f = from ?? firstKf;
  if (f) {
    const tf = timeAtDate(project, parseDate(f));
    a *= Math.max(0, Math.min(1, (t - tf) / fade + 1));
  }
  if (to) {
    const tt = timeAtDate(project, parseDate(to));
    a *= Math.max(0, Math.min(1, (tt - t) / fade + 1));
  }
  return a;
}

function arrowPoints(a: LonLat, b: LonLat, curve: number, proj: GeoProjection, progress: number): [number, number][] | null {
  const pa = proj(a);
  const pb = proj(b);
  if (!pa || !pb) return null;
  const mx = (pa[0] + pb[0]) / 2;
  const my = (pa[1] + pb[1]) / 2;
  const dx = pb[0] - pa[0];
  const dy = pb[1] - pa[1];
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * len * curve;
  const cy = my + (dx / len) * len * curve;
  const pts: [number, number][] = [];
  const n = 40;
  const upto = Math.max(1, Math.round(n * progress));
  for (let i = 0; i <= upto; i++) {
    const s = i / n;
    const x = (1 - s) * (1 - s) * pa[0] + 2 * (1 - s) * s * cx + s * s * pb[0];
    const y = (1 - s) * (1 - s) * pa[1] + 2 * (1 - s) * s * cy + s * s * pb[1];
    pts.push([x, y]);
  }
  return pts;
}

export class FrameRenderer {
  layers: LayerData = {};
  private under: HTMLCanvasElement | null = null;
  private over: HTMLCanvasElement | null = null;
  private landPath: Path2D | null = null;
  private cacheKey = "";
  private hatchPattern: CanvasPattern | null = null;
  private hatchKey = "";
  private dataVersion = 0;
  lastProjection: GeoProjection | null = null;
  lastFrame: FrameInfo | null = null;

  setLayers(layers: LayerData) {
    this.layers = layers;
    this.dataVersion++;
  }

  invalidate() {
    this.cacheKey = "";
  }

  private ensureCanvas(c: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
    if (!c) c = document.createElement("canvas");
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }

  private getHatch(ctx: CanvasRenderingContext2D, color: string, scale: number): CanvasPattern | null {
    const key = `${color}|${Math.round(scale * 10)}`;
    if (this.hatchPattern && this.hatchKey === key) return this.hatchPattern;
    const size = Math.max(4, Math.round(7 * scale));
    const pc = document.createElement("canvas");
    pc.width = size;
    pc.height = size;
    const pctx = pc.getContext("2d")!;
    pctx.strokeStyle = color;
    pctx.lineWidth = Math.max(1, scale * 0.9);
    pctx.beginPath();
    pctx.moveTo(-1, size + 1);
    pctx.lineTo(size + 1, -1);
    pctx.moveTo(-1, 1);
    pctx.lineTo(1, -1);
    pctx.moveTo(size - 1, size + 1);
    pctx.lineTo(size + 1, size - 1);
    pctx.stroke();
    this.hatchPattern = ctx.createPattern(pc, "repeat");
    this.hatchKey = key;
    return this.hatchPattern;
  }

  /** Compute faction assignment per border feature index. */
  assignments(project: Project, ms: number): (string | null)[] {
    const b = this.layers.borders;
    if (!b) return [];
    return b.features.map((f) => factionForCountry(project.memberships, f.props, ms));
  }

  render(ctx: CanvasRenderingContext2D, project: Project, t: number, opts: RenderOptions): FrameInfo {
    const { width: w, height: h } = opts;
    const s = h / 1080; // HUD scale
    const ms = dateAtTime(project, t);
    const camera = cameraAt(project.camera.keyframes, ms);
    const proj = buildProjection(project.map.projection, w, h, camera);
    this.lastProjection = proj;
    const vb = visibleBounds(proj, w, h);
    const visible = (f: BoundedFeature) => !vb || bboxIntersects(f.bbox, vb);
    const style = project.map.style;
    const layers = project.map.layers;
    const assignments = this.assignments(project, ms);
    const factionById = new Map(project.factions.map((f) => [f.id, f]));

    const key = JSON.stringify([
      w,
      h,
      project.map.projection,
      camera.center.map((v) => +v.toFixed(4)),
      +camera.zoom.toFixed(4),
      camera.roll,
      project.map.granularity,
      project.map.bordersYear,
      layers,
      style,
      assignments,
      this.dataVersion,
      project.factions.map((f) => f.id + f.color + (f.hatch ? 1 : 0)),
      !!opts.fast,
    ]);

    if (key !== this.cacheKey) {
      this.under = this.ensureCanvas(this.under, w, h);
      this.over = this.ensureCanvas(this.over, w, h);
      this.renderStatic(this.under.getContext("2d")!, this.over.getContext("2d")!, project, proj, w, h, s, visible, assignments, factionById, !!opts.fast);
      this.cacheKey = key;
    }

    // --- composite ---
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.under!, 0, 0);
    const path = geoPath(proj, ctx);

    // zones (occupations) – clipped to land
    ctx.save();
    if (this.landPath && layers.land) ctx.clip(this.landPath);
    for (const z of project.zones) {
      if (!z.keyframes.length) continue;
      const firstKf = [...z.keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date))[0].date;
      if (!isActive(z.from ?? firstKf, z.to, ms)) continue;
      const alpha = fadeAlpha(project, t, z.from, z.to, firstKf);
      if (alpha <= 0) continue;
      const pts = shapeAt(z.keyframes, ms, true);
      if (!pts || pts.length < 3) continue;
      const faction = factionById.get(z.factionId);
      const color = faction?.color ?? "#888888";
      ctx.globalAlpha = alpha * z.opacity;
      ctx.beginPath();
      path(ringFeature(pts, true));
      ctx.fillStyle = color;
      ctx.fill();
      if (faction?.hatch) {
        const pat = this.getHatch(ctx, withAlpha(shade(color, -0.45), 0.55), s);
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fill();
        }
      }
      if (z.outline) {
        ctx.lineWidth = z.outlineWidth * s;
        ctx.strokeStyle = z.outlineColor || shade(color, -0.35);
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.drawImage(this.over!, 0, 0);

    // front lines
    for (const l of project.lines) {
      if (!l.keyframes.length) continue;
      const firstKf = [...l.keyframes].sort((a, b) => parseDate(a.date) - parseDate(b.date))[0].date;
      if (!isActive(l.from ?? firstKf, l.to, ms)) continue;
      const alpha = fadeAlpha(project, t, l.from, l.to, firstKf);
      if (alpha <= 0) continue;
      const pts = shapeAt(l.keyframes, ms, false);
      if (!pts || pts.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      path(ringFeature(pts, false));
      if (l.glow) {
        ctx.strokeStyle = withAlpha(l.color, 0.35);
        ctx.lineWidth = l.width * s * 3;
        ctx.setLineDash([]);
        ctx.stroke();
      }
      ctx.setLineDash(l.dash.map((d) => d * s));
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width * s;
      ctx.stroke();
      ctx.restore();
    }

    // arrows
    for (const a of project.arrows) this.drawArrow(ctx, a, proj, ms, s);

    // markers
    for (const m of project.markers) {
      if (!isActive(m.from, m.to, ms)) continue;
      const alpha = fadeAlpha(project, t, m.from, m.to, undefined, 0.3);
      if (alpha <= 0) continue;
      const p = proj(m.position);
      if (!p) continue;
      const icon = ICONS[m.icon] ?? ICONS.battle;
      const size = m.size * s;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (m.animation === "pulse") {
        const phase = (t % 1.6) / 1.6;
        ctx.beginPath();
        ctx.arc(p[0], p[1], size * (0.6 + phase * 1.2), 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(m.color, (1 - phase) * 0.8);
        ctx.lineWidth = 3 * s;
        ctx.stroke();
      } else if (m.animation === "blink") {
        ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(t * 6));
      }
      ctx.translate(p[0], p[1]);
      ctx.scale(size / 24, size / 24);
      ctx.translate(-12, -12);
      const p2 = new Path2D(icon.d);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (icon.stroke) {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 5;
        ctx.stroke(p2);
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2.2;
        ctx.stroke(p2);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 3;
        ctx.stroke(p2);
        ctx.fillStyle = m.color;
        ctx.fill(p2);
      }
      ctx.restore();
      if (m.label) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const fs = 20 * s;
        ctx.font = `700 ${fs}px ${style.fontFamily}`;
        ctx.textBaseline = "middle";
        let x = p[0];
        let y = p[1];
        if (m.labelPosition === "below") {
          ctx.textAlign = "center";
          y += size * 0.75 + fs * 0.6;
        } else if (m.labelPosition === "above") {
          ctx.textAlign = "center";
          y -= size * 0.75 + fs * 0.6;
        } else {
          ctx.textAlign = "left";
          x += size * 0.75;
        }
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = fs * 0.2;
        ctx.strokeText(m.label, x, y);
        ctx.fillStyle = "#1f2937";
        ctx.fillText(m.label, x, y);
        ctx.restore();
      }
    }

    // labels
    for (const l of project.labels) {
      if (!isActive(l.from, l.to, ms)) continue;
      const alpha = fadeAlpha(project, t, l.from, l.to, undefined, 0.3);
      if (alpha <= 0) continue;
      const p = proj(l.position);
      if (!p) continue;
      let text = l.text;
      const v = valueAt(l.valueKeyframes, ms);
      if (v !== null) text = text.includes("{value}") ? text.replace("{value}", formatNumber(v, l.numberFormat)) : formatNumber(v, l.numberFormat);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p[0], p[1]);
      ctx.rotate((l.rotation * Math.PI) / 180);
      const fs = l.fontSize * s;
      ctx.font = `${l.bold ? 700 : 500} ${fs}px ${style.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      if (l.outline && l.outline !== "none") {
        ctx.strokeStyle = l.outline;
        ctx.lineWidth = fs * 0.16;
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = l.color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    if (opts.editor) this.drawEditor(ctx, project, proj, ms, s, opts.editor);
    this.drawHud(ctx, project, t, ms, w, h, s);
    ctx.restore();
    this.lastFrame = { dateMs: ms, camera, projection: proj };
    return this.lastFrame;
  }

  private drawArrow(ctx: CanvasRenderingContext2D, a: Arrow, proj: GeoProjection, ms: number, s: number) {
    const start = parseDate(a.start);
    const end = parseDate(a.end);
    if (!isFinite(start) || ms < start) return;
    let alpha = 1;
    if (a.holdUntil) {
      const hold = parseDate(a.holdUntil);
      if (ms > hold) alpha = Math.max(0, 1 - (ms - hold) / (14 * DAY_MS));
    }
    if (alpha <= 0) return;
    const progress = end > start ? Math.min(1, (ms - start) / (end - start)) : 1;
    const pts = arrowPoints(a.from, a.to, a.curve, proj, progress);
    if (!pts || pts.length < 2) return;
    const width = a.width * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    };
    const tip = pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const headLen = a.head ? width * 2.2 : 0;
    const headW = width * 1.6;
    const drawHead = () => {
      if (!a.head) return;
      ctx.beginPath();
      ctx.moveTo(tip[0] + Math.cos(ang) * headLen * 0.6, tip[1] + Math.sin(ang) * headLen * 0.6);
      ctx.lineTo(tip[0] - Math.cos(ang) * headLen * 0.4 + Math.cos(ang + Math.PI / 2) * headW, tip[1] - Math.sin(ang) * headLen * 0.4 + Math.sin(ang + Math.PI / 2) * headW);
      ctx.lineTo(tip[0] - Math.cos(ang) * headLen * 0.4 + Math.cos(ang - Math.PI / 2) * headW, tip[1] - Math.sin(ang) * headLen * 0.4 + Math.sin(ang - Math.PI / 2) * headW);
      ctx.closePath();
    };
    // outline pass
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = width + 4 * s;
    drawPath();
    ctx.stroke();
    if (a.head) {
      drawHead();
      ctx.lineWidth = 4 * s;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
    }
    // colour pass
    ctx.strokeStyle = a.color;
    ctx.lineWidth = width;
    if (a.dash) ctx.setLineDash([width * 1.6, width * 1.2]);
    drawPath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.head) {
      drawHead();
      ctx.fillStyle = a.color;
      ctx.fill();
    }
    ctx.restore();
  }

  private renderStatic(
    u: CanvasRenderingContext2D,
    o: CanvasRenderingContext2D,
    project: Project,
    proj: GeoProjection,
    w: number,
    h: number,
    s: number,
    visible: (f: BoundedFeature) => boolean,
    assignments: (string | null)[],
    factionById: Map<string, { color: string; hatch?: boolean }>,
    fast = false,
  ) {
    const style = project.map.style;
    const layers = { ...project.map.layers };
    if (fast) {
      layers.provinces = false;
      layers.railroads = false;
      layers.rivers = false;
      layers.cityLabels = false;
    }
    const L = this.layers;
    const upath = geoPath(proj, u);
    const opath = geoPath(proj, o);

    // ---- under: ocean, graticule, land, faction fills ----
    u.setTransform(1, 0, 0, 1, 0, 0);
    u.clearRect(0, 0, w, h);
    u.fillStyle = style.ocean;
    u.fillRect(0, 0, w, h);
    u.lineJoin = "round";
    u.lineCap = "round";

    if (layers.graticule) {
      u.beginPath();
      upath(geoGraticule10());
      u.strokeStyle = style.graticule;
      u.lineWidth = 0.8 * s;
      u.stroke();
    }

    this.landPath = null;
    if (L.land && layers.land) {
      const p2 = new Path2D();
      const pp = geoPath(proj, pathCtxOf(p2) as unknown as CanvasRenderingContext2D);
      for (const f of L.land.features) if (visible(f)) pp(f.feature);
      this.landPath = p2;
      u.fillStyle = style.land;
      u.fill(p2);
    }

    if (L.borders && layers.borders !== undefined) {
      u.save();
      if (this.landPath) u.clip(this.landPath);
      const groups = new Map<string, BoundedFeature[]>();
      L.borders.features.forEach((f, i) => {
        const fid = assignments[i];
        if (!fid || !visible(f)) return;
        const arr = groups.get(fid) ?? [];
        arr.push(f);
        groups.set(fid, arr);
      });
      for (const [fid, feats] of groups) {
        const faction = factionById.get(fid);
        if (!faction) continue;
        u.globalAlpha = style.factionOpacity;
        u.beginPath();
        for (const f of feats) upath(f.feature);
        u.fillStyle = faction.color;
        u.fill();
        u.strokeStyle = faction.color;
        u.lineWidth = 1.2 * s;
        u.stroke();
        if (faction.hatch) {
          const pat = this.getHatch(u, withAlpha(shade(faction.color, -0.45), 0.55), s);
          if (pat) {
            u.fillStyle = pat;
            u.fill();
          }
        }
      }
      u.globalAlpha = 1;
      u.restore();
    }

    // ---- over: lakes, rivers, provinces, railroads, borders, coastline, cities, hatch ----
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.lineJoin = "round";
    o.lineCap = "round";

    if (L.lakes && layers.lakes) {
      o.beginPath();
      for (const f of L.lakes.features) if (visible(f)) opath(f.feature);
      o.fillStyle = style.lake;
      o.fill();
      o.strokeStyle = style.coastline;
      o.lineWidth = 0.6 * s;
      o.stroke();
    }
    if (L.rivers && layers.rivers) {
      o.beginPath();
      for (const f of L.rivers.features) if (visible(f)) opath(f.feature);
      o.strokeStyle = style.river;
      o.lineWidth = style.riverWidth * s;
      o.stroke();
    }
    if (L.provinces && layers.provinces) {
      o.beginPath();
      for (const f of L.provinces.interior) if (visible(f)) opath(f.feature);
      o.strokeStyle = style.province;
      o.lineWidth = style.provinceWidth * s;
      o.stroke();
    }
    if (L.railroads && layers.railroads) {
      o.beginPath();
      for (const f of L.railroads.features) if (visible(f)) opath(f.feature);
      o.strokeStyle = style.railroad;
      o.lineWidth = style.railroadWidth * s;
      o.setLineDash([]);
      o.stroke();
    }
    if (L.borders && layers.borders) {
      o.beginPath();
      for (const f of L.borders.interior) if (visible(f)) opath(f.feature);
      o.strokeStyle = style.border;
      o.lineWidth = style.borderWidth * s;
      o.stroke();
    }
    if (L.land && layers.coastline) {
      o.beginPath();
      for (const f of L.land.outline) if (visible(f)) opath(f.feature);
      o.strokeStyle = style.coastline;
      o.lineWidth = style.coastlineWidth * s;
      o.stroke();
    }
    if (L.cities && layers.cities) {
      const gran = project.map.granularity;
      const maxRank = Math.min(style.cityMinRank, gran === "high" ? 10 : gran === "medium" ? 7 : 4);
      const placed: [number, number, number, number][] = [];
      const fs = 15 * s;
      o.font = `500 ${fs}px ${style.fontFamily}`;
      o.textBaseline = "middle";
      o.textAlign = "left";
      const vbx = visibleBounds(proj, w, h);
      const sorted = L.cities.filter((c) => c.r <= maxRank && (!vbx || (c.x >= vbx[0] && c.x <= vbx[2] && c.y >= vbx[1] && c.y <= vbx[3]))).sort((a, b) => a.r - b.r || b.p - a.p);
      for (const c of sorted) {
        const p = proj([c.x, c.y]);
        if (!p || p[0] < -20 || p[1] < -20 || p[0] > w + 20 || p[1] > h + 20) continue;
        const r = (c.c ? 3.6 : c.r <= 2 ? 3 : 2.2) * s;
        o.beginPath();
        o.arc(p[0], p[1], r, 0, Math.PI * 2);
        o.fillStyle = style.city;
        o.fill();
        o.strokeStyle = "rgba(255,255,255,0.9)";
        o.lineWidth = 1 * s;
        o.stroke();
        if (layers.cityLabels) {
          const tw = o.measureText(c.n).width;
          const box: [number, number, number, number] = [p[0] + r + 3 * s, p[1] - fs * 0.6, tw + 4 * s, fs * 1.2];
          if (placed.some((b) => b[0] < box[0] + box[2] && b[0] + b[2] > box[0] && b[1] < box[1] + box[3] && b[1] + b[3] > box[1])) continue;
          placed.push(box);
          o.lineJoin = "round";
          o.strokeStyle = "rgba(255,255,255,0.85)";
          o.lineWidth = fs * 0.22;
          o.strokeText(c.n, box[0], p[1]);
          o.fillStyle = style.cityLabel;
          o.fillText(c.n, box[0], p[1]);
        }
      }
    }
    if (layers.hatch && style.hatchOpacity > 0) {
      const pat = this.getHatch(o, withAlpha(style.hatchColor, style.hatchOpacity), s);
      if (pat) {
        o.fillStyle = pat;
        o.fillRect(0, 0, w, h);
      }
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, project: Project, t: number, ms: number, w: number, h: number, s: number) {
    const ov = project.overlays;
    const font = project.map.style.fontFamily;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const strokeFill = (text: string, x: number, y: number, fs: number, color: string) => {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = fs * 0.18;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    if (ov.date.show) {
      const fs = ov.date.fontSize * s;
      ctx.font = `700 ${fs}px ${font}`;
      ctx.textAlign = "left";
      strokeFill(formatDate(ms, ov.date.format), 24 * s, 18 * s, fs, ov.date.color);
      if (ov.clock.show) {
        const cfs = fs * 0.55;
        ctx.font = `600 ${cfs}px ${font}`;
        let txt = "";
        if (ov.clock.mode === "timeOfDay") txt = formatClock(ms);
        else if (ov.clock.mode === "elapsed") txt = formatElapsed(t);
        else txt = `Day ${Math.max(1, Math.floor((ms - parseDate(project.time.start)) / DAY_MS) + 1)}`;
        strokeFill(txt, 24 * s, 18 * s + fs * 1.2, cfs, ov.date.color);
      }
    }
    // legend
    if (ov.legend.show && project.factions.length) {
      const fs = 20 * s;
      ctx.font = `600 ${fs}px ${font}`;
      const rowH = fs * 1.5;
      const boxW = Math.max(...project.factions.map((f) => ctx.measureText(f.name).width)) + fs * 2.6;
      const boxH = project.factions.length * rowH + fs * 0.6;
      const x = w - boxW - 24 * s;
      const y = ov.legend.position === "top-right" ? 18 * s : h - boxH - 60 * s;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillRect(x, y, boxW, boxH);
      project.factions.forEach((f, i) => {
        const yy = y + fs * 0.3 + i * rowH;
        ctx.fillStyle = f.color;
        ctx.fillRect(x + fs * 0.6, yy + fs * 0.1, fs * 1.2, fs * 1.0);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + fs * 0.6, yy + fs * 0.1, fs * 1.2, fs * 1.0);
        ctx.fillStyle = "#1f2937";
        ctx.textAlign = "left";
        ctx.fillText(f.name, x + fs * 2.1, yy + fs * 0.1);
      });
    }
    // subtitle
    if (ov.subtitle.show) {
      const active = this.activeEvent(project, ms);
      if (active) {
        const alpha = Math.min(1, active.age / 0.25) * Math.min(1, active.remaining / 0.25 + 0.001);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        const isHead = active.ev.style === "headline";
        const fs = ov.subtitle.fontSize * s * (isHead ? 1.35 : 1);
        ctx.font = `700 ${fs}px ${font}`;
        const tw = ctx.measureText(active.ev.text).width;
        const center = ov.subtitle.position === "bottom-center" || isHead;
        const x = center ? (w - tw) / 2 : 24 * s;
        const y = h - fs * 1.35 - 20 * s;
        if (ov.subtitle.background) {
          ctx.fillStyle = "rgba(15,23,42,0.72)";
          ctx.fillRect(x - fs * 0.5, y - fs * 0.25, tw + fs, fs * 1.5);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.fillText(active.ev.text, x, y);
        } else {
          ctx.textAlign = "left";
          strokeFill(active.ev.text, x, y, fs, ov.subtitle.color);
        }
        ctx.globalAlpha = 1;
      }
    }
    // title card
    if (ov.title.show && ov.title.seconds > 0 && t < ov.title.seconds) {
      const fadeIn = Math.min(1, t / 0.6);
      const fadeOut = Math.min(1, (ov.title.seconds - t) / 0.8);
      const a = Math.max(0, Math.min(fadeIn, fadeOut));
      ctx.globalAlpha = a * 0.78;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fs = 84 * s;
      ctx.font = `800 ${fs}px ${font}`;
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(ov.title.text, w / 2, h / 2 - fs * 0.35);
      ctx.font = `500 ${fs * 0.4}px ${font}`;
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(ov.title.subtitle, w / 2, h / 2 + fs * 0.55);
      ctx.globalAlpha = 1;
    }
    if (ov.watermark) {
      const fs = 16 * s;
      ctx.font = `500 ${fs}px ${font}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      ctx.fillText(ov.watermark, w - 16 * s, h - 12 * s);
    }
    ctx.restore();
  }

  activeEvent(project: Project, ms: number): { ev: Project["events"][number]; age: number; remaining: number } | null {
    const evs = [...project.events].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    for (let i = evs.length - 1; i >= 0; i--) {
      const d = parseDate(evs[i].date);
      if (d <= ms) {
        const next = i + 1 < evs.length ? parseDate(evs[i + 1].date) : Infinity;
        const dur = (evs[i].durationDays ?? 45) * DAY_MS;
        const end = Math.min(next, d + dur);
        if (ms < end) {
          const tNow = timeAtDate(project, ms);
          return { ev: evs[i], age: tNow - timeAtDate(project, d), remaining: timeAtDate(project, Math.min(end, parseDate(project.time.end))) - tNow };
        }
        return null;
      }
    }
    return null;
  }

  private drawEditor(ctx: CanvasRenderingContext2D, project: Project, proj: GeoProjection, ms: number, s: number, ed: EditorOverlay) {
    const path = geoPath(proj, ctx);
    ctx.save();
    // hover country
    if (ed.hoverCountry && this.layers.borders) {
      ctx.beginPath();
      for (const f of this.layers.borders.features) if (String(f.props.NAME ?? "") === ed.hoverCountry) path(f.feature);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const handle = (x: number, y: number, r: number, fill: string, stroke = "#111827") => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    const sel = ed.selection;
    if (sel && (sel.type === "zone" || sel.type === "line")) {
      const el = sel.type === "zone" ? project.zones.find((z) => z.id === sel.id) : project.lines.find((l) => l.id === sel.id);
      if (el) {
        const closed = sel.type === "zone";
        const pts = shapeAt(el.keyframes, ms, closed);
        if (pts && pts.length) {
          const onKeyframe = el.keyframes.some((k) => parseDate(k.date) === ms);
          ctx.beginPath();
          path(ringFeature(pts, closed));
          ctx.strokeStyle = onKeyframe ? "#2563eb" : "#f59e0b";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          if (ed.showHandles !== false) {
            const projected = pts.map((p) => proj(p));
            // midpoints (insert handles)
            const segs = closed ? pts.length : pts.length - 1;
            for (let i = 0; i < segs; i++) {
              const a = projected[i];
              const b = projected[(i + 1) % pts.length];
              if (a && b) handle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3.5, "rgba(255,255,255,0.8)", "#6b7280");
            }
            projected.forEach((p, i) => {
              if (p) handle(p[0], p[1], ed.hoverVertex === i ? 8 : 6, ed.hoverVertex === i ? "#f59e0b" : onKeyframe ? "#ffffff" : "#fde68a");
            });
          }
        }
      }
    } else if (sel && sel.type === "marker") {
      const m = project.markers.find((x) => x.id === sel.id);
      const p = m && proj(m.position);
      if (m && p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], m.size * s * 0.8 + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (sel && sel.type === "label") {
      const l = project.labels.find((x) => x.id === sel.id);
      const p = l && proj(l.position);
      if (l && p) {
        handle(p[0], p[1], 7, "rgba(37,99,235,0.35)", "#2563eb");
      }
    } else if (sel && sel.type === "arrow") {
      const a = project.arrows.find((x) => x.id === sel.id);
      if (a) {
        const pts = arrowPoints(a.from, a.to, a.curve, proj, 1);
        if (pts) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const p of pts) ctx.lineTo(p[0], p[1]);
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          handle(pts[0][0], pts[0][1], 7, "#ffffff", "#2563eb");
          handle(pts[pts.length - 1][0], pts[pts.length - 1][1], 7, "#ffffff", "#dc2626");
        }
      }
    }
    // draft shape being drawn
    if (ed.draft && ed.draft.length) {
      const projected = ed.draft.map((p) => proj(p)).filter((p): p is [number, number] => !!p);
      ctx.beginPath();
      projected.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (ed.draftClosed && projected.length > 2) ctx.closePath();
      ctx.fillStyle = "rgba(37,99,235,0.15)";
      if (ed.draftClosed) ctx.fill();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.stroke();
      projected.forEach((p, i) => handle(p[0], p[1], i === 0 ? 7 : 5, i === 0 ? "#22c55e" : "#ffffff", "#2563eb"));
    }
    ctx.restore();
  }

  /** Hit test dynamic elements in screen space (uses last projection). */
  hitTest(project: Project, ms: number, x: number, y: number, s: number, preferSelected?: Selection | null): HitResult | null {
    const proj = this.lastProjection;
    if (!proj) return null;
    const tol = 9;
    // selected shape vertices first
    const testShape = (type: "zone" | "line", id: string, keyframes: { date: string; points: LonLat[] }[], closed: boolean): HitResult | null => {
      const pts = shapeAt(keyframes, ms, closed);
      if (!pts) return null;
      const pr = pts.map((p) => proj(p));
      for (let i = 0; i < pr.length; i++) {
        const p = pr[i];
        if (p && Math.hypot(p[0] - x, p[1] - y) <= tol) return { type, id, vertex: i };
      }
      const segs = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = pr[i];
        const b = pr[(i + 1) % pr.length];
        if (!a || !b) continue;
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        if (Math.hypot(mx - x, my - y) <= tol) return { type, id, segment: i + 1 };
      }
      return null;
    };
    if (preferSelected && (preferSelected.type === "zone" || preferSelected.type === "line")) {
      const el = preferSelected.type === "zone" ? project.zones.find((z) => z.id === preferSelected.id) : project.lines.find((l) => l.id === preferSelected.id);
      if (el) {
        const r = testShape(preferSelected.type, el.id, el.keyframes, preferSelected.type === "zone");
        if (r) return r;
      }
    }
    for (const m of project.markers) {
      if (!isActive(m.from, m.to, ms)) continue;
      const p = proj(m.position);
      if (p && Math.hypot(p[0] - x, p[1] - y) <= Math.max(tol, m.size * s * 0.6)) return { type: "marker", id: m.id };
    }
    for (const l of project.labels) {
      if (!isActive(l.from, l.to, ms)) continue;
      const p = proj(l.position);
      if (p && Math.hypot(p[0] - x, p[1] - y) <= Math.max(tol, l.fontSize * s * 0.6)) return { type: "label", id: l.id };
    }
    for (const a of project.arrows) {
      const pts = arrowPoints(a.from, a.to, a.curve, proj, 1);
      if (!pts) continue;
      if (Math.hypot(pts[0][0] - x, pts[0][1] - y) <= tol) return { type: "arrow", id: a.id, vertex: 0 };
      const tip = pts[pts.length - 1];
      if (Math.hypot(tip[0] - x, tip[1] - y) <= tol) return { type: "arrow", id: a.id, vertex: 1 };
      for (const p of pts) if (Math.hypot(p[0] - x, p[1] - y) <= Math.max(tol, a.width * s * 0.6)) return { type: "arrow", id: a.id };
    }
    for (const l of project.lines) {
      const pts = shapeAt(l.keyframes, ms, false);
      if (!pts) continue;
      const pr = pts.map((p) => proj(p));
      for (let i = 0; i < pr.length - 1; i++) {
        const a = pr[i];
        const b = pr[i + 1];
        if (a && b && distToSegment(x, y, a, b) <= Math.max(tol, l.width * s)) return { type: "line", id: l.id };
      }
    }
    for (const z of project.zones) {
      const pts = shapeAt(z.keyframes, ms, true);
      if (!pts || pts.length < 3) continue;
      const pr = pts.map((p) => proj(p)).filter((p): p is [number, number] => !!p);
      if (pointInPolygon(x, y, pr)) return { type: "zone", id: z.id };
    }
    return null;
  }

  countryAt(ctx: CanvasRenderingContext2D, x: number, y: number): BoundedFeature | null {
    const proj = this.lastProjection;
    const b = this.layers.borders;
    if (!proj || !b) return null;
    const ll = proj.invert?.([x, y]);
    for (const f of b.features) {
      if (ll && !bboxIntersects(f.bbox, [ll[0], ll[1], ll[0], ll[1]])) continue;
      const p2 = new Path2D();
      geoPath(proj, pathCtxOf(p2) as unknown as CanvasRenderingContext2D)(f.feature);
      if (ctx.isPointInPath(p2, x, y)) return f;
    }
    return null;
  }
}

function distToSegment(x: number, y: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

function pointInPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
