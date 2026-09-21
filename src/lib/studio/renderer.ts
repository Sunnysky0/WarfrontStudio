import { geoPath, geoGraticule10, geoDistance, type GeoProjection, type GeoPath, type GeoContext } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";
import type { Basemap } from "./basemap";
import { mergeRegions, resolveRegionKey, cullGeometry, type GeoBBox } from "./basemap";
import { createProjection, applyCamera, isAzimuthal, scaleToZoom } from "./projections";
import { resolveState, type ResolvedState, type ActiveTransfer, type ActiveFront, type NationState, mixColor, withAlpha, clamp, ease } from "./state";
import type { Camera, FrontBezierPath, MapTheme, ProjectDoc, InsetEvent } from "./types";
import { drawFlag, drawMarker, ringNoise, noise1 } from "./drawing";
import { capturedFillRing, distPointToSegment, polylineScreenBBox, projectVisibleSegments, type Pt } from "./frontline";
import { flattenBezierPath } from "./front-path";
import { getTheme } from "./themes";

type Ctx = CanvasRenderingContext2D;

export interface FrontEditOverlay {
  handles: [number, number][];
  line?: [number, number][];
  path?: FrontBezierPath;
  /** Canvas-space draft, used to display a freehand stroke without round-tripping projection. */
  screenLine?: [number, number][];
  closed?: boolean;
  selectedHandle?: number | null;
  selectedControl?: { index: number; side: "in" | "out" } | null;
  capturedSide?: [number, number] | null;
  draft?: boolean;
  /** Empty-map click sets captured-side instead of starting a new draft. */
  pickCaptured?: boolean;
}

export interface RenderOptions {
  cameraOverride?: Camera;
  selection?: Set<string>;
  hover?: string | null;
  showHud?: boolean;
  editorOverlay?: boolean;
  state?: ResolvedState;
  /** show a crosshair at a lon/lat (used while picking points) */
  crosshair?: [number, number] | null;
  frontEdit?: FrontEditOverlay | null;
}

interface Anchor {
  x: number;
  y: number;
  area: number;
  bw: number;
  bh: number;
}

interface NationFillCache {
  sig: string;
  cPath: Path2D | null;
  pPath: Path2D | null;
  anchor: Anchor | null;
}

interface TransferCache {
  sig: string;
  path: Path2D;
  pts: [number, number][];
  cx: number;
  cy: number;
  diag: number;
}

class Viewport {
  key = "";
  proj: GeoProjection | null = null;
  path: GeoPath | null = null;
  landPath: Path2D | null = null;
  graticulePath: Path2D | null = null;
  linesCanvas: HTMLCanvasElement | null = null;
  linesKey = "";
  nationFills = new Map<string, NationFillCache>();
  transfers = new Map<string, TransferCache>();
  regionPaths = new Map<string, Path2D>();
  frontRegionClips = new Map<string, Path2D>();
  countryAnchors: Map<string, Anchor | null> | null = null;
  bbox: GeoBBox | null = null;
  clipAngleRad = Math.PI;
  reset() {
    this.countryAnchors = null;
    this.landPath = null;
    this.graticulePath = null;
    this.linesCanvas = null;
    this.linesKey = "";
    this.nationFills.clear();
    this.transfers.clear();
    this.regionPaths.clear();
    this.frontRegionClips.clear();
  }
}

function toPath2D(path: GeoPath, geom: Parameters<GeoPath>[0]): Path2D {
  const p = new Path2D();
  path.context(p as unknown as GeoContext)(geom);
  path.context(null);
  return p;
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class MapRenderer {
  basemap: Basemap | null = null;
  project: ProjectDoc;
  theme: MapTheme;
  private main = new Viewport();
  private inset = new Viewport();
  private scanlinePattern: CanvasPattern | null = null;
  onNeedsRedraw: (() => void) | null = null;

  constructor(project: ProjectDoc) {
    this.project = project;
    this.theme = getTheme(project.map.theme);
  }

  setProject(p: ProjectDoc) {
    this.project = p;
    this.theme = getTheme(p.map.theme);
  }

  setBasemap(bm: Basemap | null) {
    this.basemap = bm;
    this.main.reset();
    this.main.key = "";
    this.inset.reset();
    this.inset.key = "";
  }

  setOnNeedsRedraw(callback: (() => void) | null) {
    this.onNeedsRedraw = callback;
  }

  resolveKey = (k: string): string => resolveRegionKey(this.basemap, k);
  provincesOf = (k: string): string[] | undefined => this.basemap?.provincesByCountry.get(k);

  getState(t: number): ResolvedState {
    return resolveState(this.project, t, this.resolveKey, this.provincesOf);
  }

  /** Projection currently used by the main viewport (after a render) */
  get projection(): GeoProjection | null {
    return this.main.proj;
  }

  screenToLonLat(x: number, y: number): [number, number] | null {
    const proj = this.main.proj;
    if (!proj || !proj.invert) return null;
    const ll = proj.invert([x, y]);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null;
    const back = proj(ll);
    if (!back || Math.hypot(back[0] - x, back[1] - y) > 2) return null;
    return [((ll[0] + 540) % 360) - 180, ll[1]];
  }

  // ------------------------------------------------------------------ main entry
  render(ctx: Ctx, W: number, H: number, t: number, opts: RenderOptions = {}) {
    const state = opts.state ?? this.getState(t);
    const camera = opts.cameraOverride ?? state.camera;
    this.renderScene(ctx, this.main, W, H, camera, state, opts, false);
    if (opts.showHud !== false) {
      for (const inset of state.insets) this.renderInset(ctx, W, H, inset, state, opts);
      this.renderHud(ctx, W, H, state);
    }
    if (this.project.map.layers.vignette) this.renderVignette(ctx, W, H);
  }

  // ------------------------------------------------------------------ viewport setup
  private setupViewport(vp: Viewport, W: number, H: number, camera: Camera) {
    const m = this.project.map;
    const bm = this.basemap;
    const precision = m.precision ?? 0.7;
    const key = [
      m.projection,
      camera.lon.toFixed(4),
      camera.lat.toFixed(4),
      camera.scale.toFixed(3),
      (camera.roll ?? 0).toFixed(2),
      W,
      H,
      precision,
      bm ? `${bm.lod}|${bm.year}` : "none",
    ].join("|");
    if (vp.key !== key) {
      vp.key = key;
      vp.proj = applyCamera(createProjection(m.projection), m.projection, camera, W, H, precision);
      vp.path = geoPath(vp.proj);
      const ca = isAzimuthal(m.projection) ? vp.proj.clipAngle() : null;
      vp.clipAngleRad = ca ? (ca * Math.PI) / 180 : Math.PI;
      vp.reset();
      vp.bbox = this.computeVisibleBBox(vp.proj, W, H);
    }
  }

  /** Geographic window covering the frame (null = cannot cull, render everything). */
  private computeVisibleBBox(proj: GeoProjection, W: number, H: number): GeoBBox | null {
    if (!proj.invert || isAzimuthal(this.project.map.projection)) return null;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    let valid = 0;
    const cols = 8,
      rows = 6;
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const ll = proj.invert([(i / cols) * W, (j / rows) * H]);
        if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue;
        const back = proj(ll);
        if (!back || Math.hypot(back[0] - (i / cols) * W, back[1] - (j / rows) * H) > 1) continue;
        valid++;
        if (ll[0] < x0) x0 = ll[0];
        if (ll[0] > x1) x1 = ll[0];
        if (ll[1] < y0) y0 = ll[1];
        if (ll[1] > y1) y1 = ll[1];
      }
    }
    if (valid < (cols + 1) * (rows + 1)) return null; // frame extends beyond the projected world
    if (x1 - x0 > 300) return null; // straddles the antimeridian / whole world
    const mx = (x1 - x0) * 0.08 + 0.5;
    const my = (y1 - y0) * 0.08 + 0.5;
    return [x0 - mx, y0 - my, x1 + mx, y1 + my];
  }

  private visible(vp: Viewport, camera: Camera, lon: number, lat: number): boolean {
    if (vp.clipAngleRad >= Math.PI) return true;
    return geoDistance([lon, lat], [camera.lon, camera.lat]) < vp.clipAngleRad - 0.01;
  }

  private toScreen(vp: Viewport, camera: Camera, lon: number, lat: number, W: number, H: number, margin = 0): [number, number] | null {
    if (!vp.proj || !this.visible(vp, camera, lon, lat)) return null;
    const p = vp.proj([lon, lat]);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    if (p[0] < -margin || p[1] < -margin || p[0] > W + margin || p[1] > H + margin) return null;
    return [p[0], p[1]];
  }

  // ------------------------------------------------------------------ scene
  private renderScene(ctx: Ctx, vp: Viewport, W: number, H: number, camera: Camera, state: ResolvedState, opts: RenderOptions, isInset: boolean) {
    const th = this.theme;
    const m = this.project.map;
    const layers = m.layers;
    const bm = this.basemap;
    this.setupViewport(vp, W, H, camera);
    const path = vp.path!;
    const k = W / 1920;

    // background
    if (th.bgGradient) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, th.bgGradient[0]);
      g.addColorStop(1, th.bgGradient[1]);
      ctx.fillStyle = g;
    } else ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    // globe disc for azimuthal projections
    if (isAzimuthal(m.projection) && vp.proj) {
      const sphere = toPath2D(path, { type: "Sphere" });
      ctx.fillStyle = th.bg;
      ctx.fill(sphere);
      ctx.strokeStyle = th.coast;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = th.coastGlow ?? th.coast;
      ctx.shadowBlur = 24 * k;
      ctx.stroke(sphere);
      ctx.shadowBlur = 0;
    }

    if (layers.graticule) {
      if (!vp.graticulePath) vp.graticulePath = toPath2D(path, geoGraticule10());
      ctx.strokeStyle = th.graticule;
      ctx.lineWidth = 0.6;
      ctx.stroke(vp.graticulePath);
    }

    if (!bm) {
      ctx.fillStyle = th.label;
      ctx.font = `600 ${20 * k}px ${th.hudFont}`;
      ctx.textAlign = "center";
      ctx.fillText("Loading basemap…", W / 2, H / 2);
      return;
    }

    // land
    if (layers.land && bm.land) {
      if (!vp.landPath) vp.landPath = toPath2D(path, cullGeometry(bm.land.geometry, bm.boxes.land, vp.bbox));
      ctx.fillStyle = th.land;
      ctx.fill(vp.landPath);
    }

    // nation fills
    const fills = this.computeNationFills(vp, state);
    const desat = th.fillDesaturate ?? 0;
    const colorOf = (ns: NationState | undefined) => (ns ? (desat > 0 ? mixColor(ns.color, th.land, desat) : ns.color) : th.land);
    for (const [nid, f] of fills) {
      if (!f.cPath) continue;
      ctx.fillStyle = colorOf(state.nations.get(nid));
      ctx.fill(f.cPath);
    }
    for (const [nid, f] of fills) {
      if (!f.pPath) continue;
      ctx.fillStyle = colorOf(state.nations.get(nid));
      ctx.fill(f.pPath);
    }

    // active transfers (frontlines)
    for (const tr of state.transfers) this.renderTransfer(ctx, vp, W, H, camera, state, tr, fills, k);

    // drawn occupation fills (after transfers so a drawn front wins where they overlap)
    for (const fr of state.fronts) this.renderFront(ctx, vp, W, H, camera, state, fr, fills, k, "fill");

    // cached line layers
    this.renderLines(ctx, vp, W, H, k);

    // nation outlines
    if (layers.nationOutlines) {
      ctx.strokeStyle = th.nationOutline;
      ctx.lineWidth = th.nationOutlineWidth * Math.max(0.8, k);
      ctx.lineJoin = "round";
      for (const f of fills.values()) {
        if (f.cPath) ctx.stroke(f.cPath);
        if (f.pPath) ctx.stroke(f.pPath);
      }
    }

    for (const fr of state.fronts) this.renderFront(ctx, vp, W, H, camera, state, fr, fills, k, "stroke");

    // editor overlays (selection / hover)
    if (opts.editorOverlay && !isInset) this.renderSelection(ctx, vp, opts);

    // labels & points
    const placed: Rect[] = [];
    if (layers.nationLabels) this.renderNationLabels(ctx, vp, W, H, camera, state, fills, k, placed);
    if (layers.countryLabels && !isInset) this.renderCountryLabels(ctx, vp, W, H, camera, state, k, placed);
    if (layers.cities || layers.cityLabels) this.renderCities(ctx, vp, W, H, camera, k, placed, isInset);
    if (layers.seaLabels) this.renderSeaLabels(ctx, vp, W, H, camera, k, placed);

    // markers & texts
    for (const mk of state.markers) {
      const e = mk.event;
      const positions: [number, number][] = [e.pos, ...(e.extra ?? [])];
      const appear = ease("easeOut", Math.min(1, mk.age / 0.35));
      positions.forEach((pos, i) => {
        const p = this.toScreen(vp, camera, pos[0], pos[1], W, H, 50);
        if (!p) return;
        const sz = (e.size ?? 14) * k * appear;
        drawMarker(ctx, e.kind, p[0], p[1], sz, e.color ?? "#ff2d55", mk.age + i * 0.37, e.pulse !== false);
      });
    }
    for (const te of state.texts) {
      let p: [number, number] | null = null;
      if (te.screenPos) p = [te.screenPos[0] * W, te.screenPos[1] * H];
      else p = this.toScreen(vp, camera, te.pos[0], te.pos[1], W, H, 200);
      if (!p) continue;
      const size = (te.size ?? 20) * k;
      this.setLetterSpacing(ctx, size * 0.18);
      ctx.font = `600 ${size}px ${th.labelFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = te.color ?? th.label;
      ctx.shadowColor = th.labelShadow;
      ctx.shadowBlur = size * 0.4;
      const lines = te.text.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln.toUpperCase(), p![0], p![1] + (i - (lines.length - 1) / 2) * size * 1.2));
      ctx.shadowBlur = 0;
      this.setLetterSpacing(ctx, 0);
    }

    if (opts.crosshair && !isInset) {
      const p = this.toScreen(vp, camera, opts.crosshair[0], opts.crosshair[1], W, H, 50);
      if (p) {
        ctx.strokeStyle = th.hudAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
        ctx.moveTo(p[0] - 16, p[1]);
        ctx.lineTo(p[0] + 16, p[1]);
        ctx.moveTo(p[0], p[1] - 16);
        ctx.lineTo(p[0], p[1] + 16);
        ctx.stroke();
      }
    }

    if (opts.editorOverlay && !isInset && opts.frontEdit) this.renderFrontEdit(ctx, vp, camera, W, H, k, opts.frontEdit);
  }

  private setLetterSpacing(ctx: Ctx, px: number) {
    (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${px.toFixed(2)}px`;
  }

  // ------------------------------------------------------------------ fills
  private computeNationFills(vp: Viewport, state: ResolvedState): Map<string, NationFillCache> {
    const bm = this.basemap!;
    const byNation = new Map<string, string[]>();
    for (const [region, nid] of state.ownership) {
      const list = byNation.get(nid) ?? [];
      list.push(region);
      byNation.set(nid, list);
    }
    const out = new Map<string, NationFillCache>();
    for (const [nid, regions] of byNation) {
      regions.sort();
      const sig = regions.join(",");
      let c = vp.nationFills.get(nid);
      if (!c || c.sig !== sig) {
        const merged = mergeRegions(bm, regions);
        const path = vp.path!;
        c = {
          sig,
          cPath: merged.countries ? toPath2D(path, merged.countries) : null,
          pPath: merged.provinces ? toPath2D(path, merged.provinces) : null,
          anchor: this.computeAnchor(path, merged.countries, merged.provinces),
        };
        vp.nationFills.set(nid, c);
      }
      out.set(nid, c);
    }
    // drop caches for nations that no longer own territory
    for (const nid of Array.from(vp.nationFills.keys())) if (!byNation.has(nid)) vp.nationFills.delete(nid);
    return out;
  }

  private computeAnchor(path: GeoPath, ...geoms: (MultiPolygon | null)[]): Anchor | null {
    let best: Anchor | null = null;
    for (const g of geoms) {
      if (!g) continue;
      for (const poly of g.coordinates) {
        const pg: Polygon = { type: "Polygon", coordinates: poly };
        const area = Math.abs(path.area(pg));
        if (!(area > 0)) continue;
        if (!best || area > best.area) {
          const c = path.centroid(pg);
          const b = path.bounds(pg);
          if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
          best = { x: c[0], y: c[1], area, bw: b[1][0] - b[0][0], bh: b[1][1] - b[0][1] };
        }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ frontline transfers
  private getTransferCache(vp: Viewport, camera: Camera, tr: ActiveTransfer): TransferCache | null {
    const bm = this.basemap!;
    const sig = tr.regions.join(",");
    let c = vp.transfers.get(tr.id);
    if (c && c.sig === sig) return c;
    const merged = mergeRegions(bm, tr.regions);
    if (!merged.countries && !merged.provinces) return null;
    const path = vp.path!;
    const p = new Path2D();
    path.context(p as unknown as GeoContext);
    if (merged.countries) path(merged.countries);
    if (merged.provinces) path(merged.provinces);
    path.context(null);
    // sample boundary points in screen space
    const coords: number[][] = [];
    for (const g of [merged.countries, merged.provinces]) {
      if (!g) continue;
      for (const poly of g.coordinates) for (const ring of poly) for (const pt of ring) coords.push(pt);
    }
    const stride = Math.max(1, Math.ceil(coords.length / 1800));
    const pts: [number, number][] = [];
    for (let i = 0; i < coords.length; i += stride) {
      const [lon, lat] = coords[i];
      if (!this.visible(vp, camera, lon, lat)) continue;
      const s = vp.proj!([lon, lat]);
      if (s && Number.isFinite(s[0]) && Number.isFinite(s[1])) pts.push([s[0], s[1]]);
    }
    let cx = 0;
    let cy = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of pts) {
      cx += x;
      cy += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (pts.length) {
      cx /= pts.length;
      cy /= pts.length;
    }
    c = { sig, path: p, pts, cx, cy, diag: pts.length ? Math.hypot(maxX - minX, maxY - minY) : 0 };
    vp.transfers.set(tr.id, c);
    return c;
  }

  private renderTransfer(
    ctx: Ctx,
    vp: Viewport,
    W: number,
    H: number,
    camera: Camera,
    state: ResolvedState,
    tr: ActiveTransfer,
    fills: Map<string, NationFillCache>,
    k: number
  ) {
    const th = this.theme;
    const cache = this.getTransferCache(vp, camera, tr);
    if (!cache) return;
    const ns = state.nations.get(tr.toNation);
    const color = ns ? (th.fillDesaturate ? mixColor(ns.color, th.land, th.fillDesaturate) : ns.color) : th.land;
    const p = clamp(tr.progress, 0, 1);
    let mode = tr.mode;
    if (mode === "auto" || mode === "sweep-from-attacker") mode = cache.diag < 26 * k || cache.pts.length < 6 ? "fade" : "radial";
    if (mode === "instant") mode = "fade";

    ctx.save();
    ctx.clip(cache.path);
    if (mode === "fade") {
      ctx.globalAlpha = p;
      ctx.fillStyle = color;
      ctx.fill(cache.path);
      ctx.restore();
      return;
    }

    // attacker anchor -> origin
    const attackerId = tr.fromNation && fills.has(tr.fromNation) ? tr.fromNation : tr.toNation;
    const attacker = fills.get(attackerId)?.anchor ?? null;
    let ox = cache.cx - cache.diag;
    let oy = cache.cy;
    if (tr.origin) {
      const s = vp.proj!(tr.origin);
      if (s) [ox, oy] = s;
    } else if (attacker) {
      // nearest boundary point of the region to the attacker's heartland
      let best = Infinity;
      for (const [x, y] of cache.pts) {
        const d = (x - attacker.x) ** 2 + (y - attacker.y) ** 2;
        if (d < best) {
          best = d;
          ox = x;
          oy = y;
        }
      }
    }

    const rough = tr.roughness;
    const reveal = new Path2D();
    if (mode === "radial") {
      let rmax = 0;
      for (const [x, y] of cache.pts) rmax = Math.max(rmax, Math.hypot(x - ox, y - oy));
      rmax = rmax * 1.06 + 4;
      const R = p * rmax;
      const N = 180;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const n = ringNoise(a, 3, tr.seed, p * 0.35);
        const r = Math.max(0, R * (1 + rough * 0.22 * n) + rough * 6 * k * n);
        const x = ox + Math.cos(a) * r;
        const y = oy + Math.sin(a) * r;
        if (i === 0) reveal.moveTo(x, y);
        else reveal.lineTo(x, y);
      }
      reveal.closePath();
    } else {
      // linear sweep
      let dir = tr.direction;
      if (dir === undefined) {
        const ax = attacker ? attacker.x : ox;
        const ay = attacker ? attacker.y : oy;
        dir = (Math.atan2(-(cache.cy - ay), cache.cx - ax) * 180) / Math.PI;
      }
      const rad = (dir * Math.PI) / 180;
      const d: [number, number] = [Math.cos(rad), -Math.sin(rad)];
      const perp: [number, number] = [-d[1], d[0]];
      let smin = Infinity,
        smax = -Infinity,
        qmin = Infinity,
        qmax = -Infinity;
      for (const [x, y] of cache.pts) {
        const s = x * d[0] + y * d[1];
        const q = x * perp[0] + y * perp[1];
        if (s < smin) smin = s;
        if (s > smax) smax = s;
        if (q < qmin) qmin = q;
        if (q > qmax) qmax = q;
      }
      const L = smax - smin;
      const s = smin - 6 + p * (L + 12);
      const ext = (qmax - qmin) * 0.25 + 20;
      const N = 140;
      const back = s - L * 3 - 2000;
      const pt = (ss: number, qq: number): [number, number] => [d[0] * ss + perp[0] * qq, d[1] * ss + perp[1] * qq];
      for (let i = 0; i <= N; i++) {
        const q = qmin - ext + ((qmax - qmin + 2 * ext) * i) / N;
        const off = rough * L * 0.09 * noise1(i * 0.22 + tr.seed * 10, tr.seed) + rough * 5 * k * noise1(i * 0.9, tr.seed + 1);
        const [x, y] = pt(s + off, q);
        if (i === 0) reveal.moveTo(x, y);
        else reveal.lineTo(x, y);
      }
      const [bx1, by1] = pt(back, qmax + ext);
      const [bx0, by0] = pt(back, qmin - ext);
      reveal.lineTo(bx1, by1);
      reveal.lineTo(bx0, by0);
      reveal.closePath();
    }

    ctx.fillStyle = color;
    ctx.fill(reveal);
    if (tr.showFrontline && p > 0.01 && p < 0.995) {
      ctx.lineWidth = 2.4 * k;
      ctx.strokeStyle = th.frontline;
      ctx.shadowColor = th.frontlineGlow ?? th.frontline;
      ctx.shadowBlur = 14 * k;
      ctx.stroke(reveal);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    void W;
    void H;
  }

  // ------------------------------------------------------------------ drawn fronts
  private projectFront(vp: Viewport, camera: Camera, pts: [number, number][], closed: boolean, W: number, H: number) {
    if (!vp.proj) return { segments: [] as Pt[][], allVisible: false };
    const maxJump = Math.max(W, H) * 0.75;
    return projectVisibleSegments(
      pts,
      ([lon, lat]) => {
        if (!this.visible(vp, camera, lon, lat)) return null;
        const point = vp.proj?.([lon, lat]);
        return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [point[0], point[1]] : null;
      },
      closed,
      maxJump
    );
  }

  private mainFrontSegment(segments: Pt[][], captured: Pt | null): Pt[] {
    const usable = segments.filter((segment) => segment.length >= 2);
    if (!usable.length) return [];
    if (!captured) {
      return usable.reduce((best, segment) => (segment.length > best.length ? segment : best), usable[0]);
    }
    let best = usable[0];
    let bestDistance = Infinity;
    for (const segment of usable) {
      let distance = Infinity;
      for (let i = 1; i < segment.length; i++) distance = Math.min(distance, distPointToSegment(captured, segment[i - 1], segment[i]).dist);
      if (distance < bestDistance) {
        best = segment;
        bestDistance = distance;
      }
    }
    return best;
  }

  private roughenLine(pts: Pt[], roughness: number, seed: number, k: number, closed: boolean): Pt[] {
    if (roughness <= 0 || pts.length < 3) return pts;
    return pts.map((p, i) => {
      const prev = pts[closed ? (i - 1 + pts.length) % pts.length : Math.max(0, i - 1)];
      const next = pts[closed ? (i + 1) % pts.length : Math.min(pts.length - 1, i + 1)];
      const tx = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const len = Math.hypot(tx, ty) || 1;
      const n = noise1(i * 0.22 + seed * 10, seed);
      const amp = roughness * (7 * k + 0.035 * len);
      return [p[0] + (-ty / len) * amp * n, p[1] + (tx / len) * amp * n] as Pt;
    });
  }

  private frontTheaterPath(vp: Viewport, fr: ActiveFront, fills: Map<string, NationFillCache>): Path2D | null {
    if (fr.theater === "regions" && fr.clipRegions?.length) {
      const bm = this.basemap;
      if (!bm) return null;
      const sig = fr.clipRegions.join(",");
      let p = vp.frontRegionClips.get(sig);
      if (!p) {
        const merged = mergeRegions(bm, fr.clipRegions);
        p = new Path2D();
        const path = vp.path!;
        path.context(p as unknown as GeoContext);
        if (merged.countries) path(merged.countries);
        if (merged.provinces) path(merged.provinces);
        path.context(null);
        vp.frontRegionClips.set(sig, p);
      }
      return p;
    }
    if (fr.theater === "sides") {
      const p = new Path2D();
      let any = false;
      for (const id of [fr.nation, fr.against]) {
        if (!id) continue;
        const f = fills.get(id);
        if (!f) continue;
        if (f.cPath) {
          p.addPath(f.cPath);
          any = true;
        }
        if (f.pPath) {
          p.addPath(f.pPath);
          any = true;
        }
      }
      return any ? p : null;
    }
    return null;
  }

  private renderFront(
    ctx: Ctx,
    vp: Viewport,
    W: number,
    H: number,
    camera: Camera,
    state: ResolvedState,
    fr: ActiveFront,
    fills: Map<string, NationFillCache>,
    k: number,
    phase: "fill" | "stroke"
  ) {
    const th = this.theme;
    const projected = this.projectFront(vp, camera, fr.points, fr.closed, W, H);
    const segments = projected.segments
      .filter((segment) => segment.length >= 2)
      .map((segment, index) => this.roughenLine(segment, fr.roughness, fr.seed + index * 997, k, fr.closed && projected.allVisible));
    if (!segments.length) return;
    const allPoints = segments.flat();
    const theater = this.frontTheaterPath(vp, fr, fills);
    const ns = state.nations.get(fr.nation);
    const color = ns ? (th.fillDesaturate ? mixColor(ns.color, th.land, th.fillDesaturate) : ns.color) : th.land;

    ctx.save();
    if (vp.landPath) ctx.clip(vp.landPath);
    if (theater) ctx.clip(theater);
    else if (fr.theater === "land") {
      const pad = Math.max(120 * k, 0.12 * Math.min(W, H));
      const bb = polylineScreenBBox(allPoints, pad);
      if (bb) {
        const box = new Path2D();
        box.rect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0);
        ctx.clip(box);
      }
    }

    if (phase === "fill" && fr.fillOccupation) {
      const cap = vp.proj && this.visible(vp, camera, fr.capturedSide[0], fr.capturedSide[1]) ? vp.proj(fr.capturedSide) : null;
      const captured: Pt | null = cap && Number.isFinite(cap[0]) && Number.isFinite(cap[1]) ? [cap[0], cap[1]] : null;
      const line = this.mainFrontSegment(segments, captured);
      if (line.length < 2) {
        ctx.restore();
        return;
      }
      const fillPoint = captured ?? line[Math.floor(line.length / 2)];
      const pad = Math.max(W, H);
      const ring = capturedFillRing(line, fillPoint, { x0: -pad, y0: -pad, x1: W + pad, y1: H + pad }, fr.closed && projected.allVisible);
      if (ring && ring.length >= 3) {
        const path = new Path2D();
        path.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
        path.closePath();
        ctx.fillStyle = color;
        ctx.fill(path, "evenodd");
      }
    }

    if (phase === "stroke" && fr.showFrontline) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 2.4 * k;
      ctx.strokeStyle = th.frontline;
      ctx.shadowColor = th.frontlineGlow ?? th.frontline;
      ctx.shadowBlur = 14 * k;
      ctx.beginPath();
      for (const line of segments) {
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
        if (fr.closed && projected.allVisible) ctx.closePath();
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  private renderFrontEdit(ctx: Ctx, vp: Viewport, camera: Camera, W: number, H: number, k: number, edit: FrontEditOverlay) {
    const th = this.theme;
    const geoLine = edit.path?.nodes.length ? flattenBezierPath(edit.path, !!edit.closed) : edit.line?.length ? edit.line : edit.handles;
    const projected = edit.screenLine?.length
      ? { segments: [edit.screenLine], allVisible: true }
      : this.projectFront(vp, camera, geoLine, !!edit.closed, W, H);
    ctx.save();
    if (projected.segments.some((line) => line.length >= 2)) {
      ctx.strokeStyle = edit.draft ? th.hudAccent : "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6 * k;
      ctx.setLineDash(edit.draft ? [6 * k, 4 * k] : []);
      ctx.beginPath();
      for (const line of projected.segments) {
        if (line.length < 2) continue;
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
        if (edit.closed && projected.allVisible) ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const r = Math.max(4, 5.5 * k);
    const nodes = edit.path?.nodes;
    if (nodes && edit.selectedHandle != null) {
      const node = nodes[edit.selectedHandle];
      if (node) {
        const anchor = this.toScreen(vp, camera, node.anchor[0], node.anchor[1], W, H, 40);
        for (const side of ["in", "out"] as const) {
          const vector = node[side];
          if (!vector || !anchor) continue;
          const hp = this.toScreen(vp, camera, node.anchor[0] + vector[0], node.anchor[1] + vector[1], W, H, 40);
          if (!hp) continue;
          ctx.strokeStyle = th.hudAccent;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(anchor[0], anchor[1]);
          ctx.lineTo(hp[0], hp[1]);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(hp[0], hp[1], Math.max(3, 4 * k), 0, Math.PI * 2);
          const selected = edit.selectedControl?.index === edit.selectedHandle && edit.selectedControl.side === side;
          ctx.fillStyle = selected ? th.hudAccent : "#141814";
          ctx.fill();
          ctx.strokeStyle = selected ? "#fff" : th.hudAccent;
          ctx.stroke();
        }
      }
    }
    const anchors = nodes?.map((node) => node.anchor) ?? edit.handles;
    anchors.forEach((h, i) => {
      const p = this.toScreen(vp, camera, h[0], h[1], W, H, 40);
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = i === edit.selectedHandle ? th.hudAccent : "#141814";
      ctx.fill();
      ctx.strokeStyle = i === edit.selectedHandle ? "#fff" : th.hudAccent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    if (edit.capturedSide && !edit.closed) {
      const p = this.toScreen(vp, camera, edit.capturedSide[0], edit.capturedSide[1], W, H, 40);
      if (p) {
        ctx.strokeStyle = th.hudAccent;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(p[0] - 7, p[1]);
        ctx.lineTo(p[0] + 7, p[1]);
        ctx.moveTo(p[0], p[1] - 7);
        ctx.lineTo(p[0], p[1] + 7);
        ctx.stroke();
      }
    }
    ctx.restore();
    void H;
  }

  // ------------------------------------------------------------------ line layers (cached offscreen)
  private renderLines(ctx: Ctx, vp: Viewport, W: number, H: number, k: number) {
    const th = this.theme;
    const bm = this.basemap!;
    const layers = this.project.map.layers;
    const key = `${vp.key}|${th.id}|${+layers.lakes}${+layers.rivers}${+layers.railroads}${+layers.provinces}${+layers.countries}${+layers.coastlines}`;
    if (!vp.linesCanvas || vp.linesKey !== key) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      const path = vp.path!;
      g.lineJoin = "round";
      g.lineCap = "round";
      if (layers.lakes && bm.lakes) {
        const p = toPath2D(path, cullGeometry(bm.lakes.geometry, bm.boxes.lakes, vp.bbox));
        g.fillStyle = th.lake;
        g.fill(p);
        if (th.lakeStroke) {
          g.strokeStyle = th.lakeStroke;
          g.lineWidth = 0.7 * k;
          g.stroke(p);
        }
      }
      if (layers.rivers && bm.rivers) {
        g.strokeStyle = th.river;
        g.lineWidth = 0.8 * k;
        g.stroke(toPath2D(path, cullGeometry(bm.rivers.geometry, bm.boxes.rivers, vp.bbox)));
      }
      if (layers.railroads && bm.railroads) {
        g.strokeStyle = th.rail;
        g.lineWidth = 0.7 * k;
        g.setLineDash((th.railDash ?? [2, 3]).map((d) => d * k));
        g.stroke(toPath2D(path, cullGeometry(bm.railroads.geometry, bm.boxes.railroads, vp.bbox)));
        g.setLineDash([]);
      }
      if (layers.provinces) {
        g.strokeStyle = th.province;
        g.lineWidth = th.provinceWidth * k;
        g.stroke(toPath2D(path, cullGeometry(bm.provinces.mesh, bm.provinces.meshBoxes, vp.bbox)));
      }
      if (layers.countries) {
        g.strokeStyle = th.border;
        g.lineWidth = th.borderWidth * k;
        if (th.borderDash) g.setLineDash(th.borderDash.map((d) => d * k));
        g.stroke(toPath2D(path, cullGeometry(bm.countries.mesh, bm.countries.meshBoxes, vp.bbox)));
        g.setLineDash([]);
      }
      if (layers.coastlines && bm.land) {
        if (!vp.landPath) vp.landPath = toPath2D(path, cullGeometry(bm.land.geometry, bm.boxes.land, vp.bbox));
        g.strokeStyle = th.coast;
        g.lineWidth = th.coastWidth * k;
        if (th.coastGlow && this.project.map.showGlow !== false) {
          g.shadowColor = th.coastGlow;
          g.shadowBlur = 7 * k;
        }
        g.stroke(vp.landPath);
        g.shadowBlur = 0;
      }
      vp.linesCanvas = c;
      vp.linesKey = key;
    }
    ctx.drawImage(vp.linesCanvas, 0, 0);
  }

  // ------------------------------------------------------------------ selection overlay
  getRegionPath(rawKey: string): Path2D | null {
    const vp = this.main;
    const bm = this.basemap;
    if (!bm || !vp.path) return null;
    const key = this.resolveKey(rawKey);
    let p = vp.regionPaths.get(key);
    if (!p) {
      const f = bm.countries.byId.get(key) ?? bm.provinces.byId.get(key);
      if (!f) return null;
      p = toPath2D(vp.path, f);
      vp.regionPaths.set(key, p);
    }
    return p;
  }

  private renderSelection(ctx: Ctx, vp: Viewport, opts: RenderOptions) {
    const th = this.theme;
    if (opts.selection && opts.selection.size) {
      ctx.save();
      ctx.lineJoin = "round";
      for (const key of opts.selection) {
        const p = this.getRegionPath(key);
        if (!p) continue;
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fill(p);
        ctx.strokeStyle = th.hudAccent;
        ctx.lineWidth = 1.6;
        ctx.stroke(p);
      }
      ctx.restore();
    }
    if (opts.hover) {
      const p = this.getRegionPath(opts.hover);
      if (p) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fill(p);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.stroke(p);
        ctx.restore();
      }
    }
    void vp;
  }

  // ------------------------------------------------------------------ labels
  private renderNationLabels(
    ctx: Ctx,
    vp: Viewport,
    W: number,
    H: number,
    camera: Camera,
    state: ResolvedState,
    fills: Map<string, NationFillCache>,
    k: number,
    placed: Rect[]
  ) {
    const th = this.theme;
    const globalScale = this.project.map.labelScale ?? 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const entries = Array.from(fills.entries()).sort((a, b) => (b[1].anchor?.area ?? 0) - (a[1].anchor?.area ?? 0));
    for (const [nid, f] of entries) {
      const ns = state.nations.get(nid);
      if (!ns || ns.labelHidden || !f.anchor) continue;
      let x = f.anchor.x;
      let y = f.anchor.y;
      if (ns.labelPos) {
        const p = this.toScreen(vp, camera, ns.labelPos[0], ns.labelPos[1], W, H, 100);
        if (!p) continue;
        [x, y] = p;
      }
      if (x < -50 || y < -50 || x > W + 50 || y > H + 50) continue;
      let size = clamp(Math.sqrt(f.anchor.area) * 0.075, 7 * k, 66 * k) * (ns.labelScale ?? 1) * globalScale;
      if (size < 6.5 * k) continue;
      const draw = (name: string, alpha: number) => {
        ctx.font = `600 ${size}px ${th.labelFont}`;
        this.setLetterSpacing(ctx, size * 0.2);
        const maxWidth = Math.max(f.anchor!.bw * 0.95, size * 9);
        let lines = wrapText(ctx, name.toUpperCase(), maxWidth);
        if (lines.length > 3) {
          size *= 0.8;
          ctx.font = `600 ${size}px ${th.labelFont}`;
          this.setLetterSpacing(ctx, size * 0.2);
          lines = wrapText(ctx, name.toUpperCase(), maxWidth * 1.2);
        }
        const lh = size * 1.18;
        const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const rect: Rect = { x: x - width / 2, y: y - (lines.length * lh) / 2, w: width, h: lines.length * lh };
        placed.push(rect);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ns.labelColor ?? th.label;
        ctx.shadowColor = th.labelShadow;
        ctx.shadowBlur = size * 0.45;
        lines.forEach((ln, i) => ctx.fillText(ln, x, y + (i - (lines.length - 1) / 2) * lh));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      };
      if (ns.prevName && ns.nameMix !== undefined) {
        draw(ns.prevName, 1 - ns.nameMix);
        draw(ns.name, ns.nameMix);
      } else draw(ns.name, 1);
    }
    this.setLetterSpacing(ctx, 0);
  }

  private renderCountryLabels(ctx: Ctx, vp: Viewport, W: number, H: number, camera: Camera, state: ResolvedState, k: number, placed: Rect[]) {
    const th = this.theme;
    const bm = this.basemap!;
    const path = vp.path!;
    if (!vp.countryAnchors) vp.countryAnchors = new Map();
    const ls = this.project.map.labelScale ?? 1;
    const bbox = vp.bbox;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of bm.countries.features) {
      if (state.ownership.has(f.id)) continue;
      if (bbox) {
        const [[x0, y0], [x1, y1]] = f.gbox;
        if (x0 <= x1 && (x1 < bbox[0] || x0 > bbox[2] || y1 < bbox[1] || y0 > bbox[3])) continue;
      }
      const provs = bm.provincesByCountry.get(f.id);
      if (provs && provs.some((p) => state.ownership.has(p))) continue;
      let a = vp.countryAnchors.get(f.id);
      if (a === undefined) {
        a = null;
        if (f.mainPoly) {
          const c = this.toScreen(vp, camera, f.mainCentroid[0], f.mainCentroid[1], W, H, 200);
          if (c) {
            const b = path.bounds(f.mainPoly);
            const area = Math.abs(path.area(f.mainPoly));
            if (Number.isFinite(b[0][0]) && area > 0) a = { x: c[0], y: c[1], area, bw: b[1][0] - b[0][0], bh: b[1][1] - b[0][1] };
          }
        }
        vp.countryAnchors.set(f.id, a);
      }
      if (!a || a.x < 0 || a.y < 0 || a.x > W || a.y > H) continue;
      const size = clamp(Math.sqrt(a.area) * 0.05, 0, 20 * k) * ls;
      if (size < 7 * k) continue;
      ctx.font = `500 ${size}px ${th.labelFont}`;
      this.setLetterSpacing(ctx, size * 0.22);
      const lines = wrapText(ctx, f.properties.name.toUpperCase(), Math.max(a.bw * 0.9, size * 8));
      const lh = size * 1.15;
      const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const rect: Rect = { x: a.x - width / 2, y: a.y - (lines.length * lh) / 2, w: width, h: lines.length * lh };
      if (placed.some((r) => overlaps(r, rect))) continue;
      placed.push(rect);
      ctx.fillStyle = withAlpha(th.label.startsWith("#") ? th.label : "#ffffff", 0.78);
      ctx.shadowColor = th.labelShadow;
      ctx.shadowBlur = size * 0.4;
      lines.forEach((ln, i) => ctx.fillText(ln, a!.x, a!.y + (i - (lines.length - 1) / 2) * lh));
      ctx.shadowBlur = 0;
    }
    this.setLetterSpacing(ctx, 0);
  }

  private renderCities(ctx: Ctx, vp: Viewport, W: number, H: number, camera: Camera, k: number, placed: Rect[], isInset: boolean) {
    const th = this.theme;
    const bm = this.basemap!;
    const layers = this.project.map.layers;
    const z = scaleToZoom(camera.scale);
    const density = this.project.map.cityDensity ?? 1;
    const maxRank = z * 1.7 - 1 + density * 2;
    const labelSize = 10 * k * (this.project.map.labelScale ?? 1);
    ctx.font = `600 ${labelSize}px ${th.hudFont}`;
    this.setLetterSpacing(ctx, labelSize * 0.16);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let count = 0;
    const cities = bm.cities;
    for (let i = 0; i < cities.length && count < 500; i++) {
      const c = cities[i];
      const show = c.rank <= maxRank || (c.cap === 0 && z >= 0.6 && c.rank <= 5);
      if (!show) continue;
      const p = this.toScreen(vp, camera, c.lon, c.lat, W, H, 10);
      if (!p) continue;
      count++;
      const [x, y] = p;
      if (layers.cities) {
        const r = (c.cap === 0 ? 3.2 : 2.3) * k;
        if (th.cityGlow) {
          ctx.fillStyle = withAlpha(th.cityGlow, 0.35);
          ctx.beginPath();
          ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = th.cityGlow;
          ctx.lineWidth = 1 * k;
          ctx.beginPath();
          ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = th.city;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (layers.cityLabels && !isInset) {
        const text = c.name.toUpperCase();
        const w = ctx.measureText(text).width;
        const rect: Rect = { x: x + 7 * k, y: y - labelSize * 0.7, w, h: labelSize * 1.4 };
        if (placed.some((r) => overlaps(r, rect))) continue;
        placed.push(rect);
        ctx.fillStyle = th.cityLabel;
        ctx.shadowColor = th.labelShadow;
        ctx.shadowBlur = 4 * k;
        ctx.fillText(text, x + 7 * k, y);
        ctx.shadowBlur = 0;
      }
    }
    this.setLetterSpacing(ctx, 0);
  }

  private renderSeaLabels(ctx: Ctx, vp: Viewport, W: number, H: number, camera: Camera, k: number, placed: Rect[]) {
    const th = this.theme;
    const bm = this.basemap!;
    const z = scaleToZoom(camera.scale);
    const density = this.project.map.seaLabelDensity ?? 1;
    const ls = this.project.map.labelScale ?? 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of bm.seas) {
      let minZ: number;
      let size: number;
      if (s.cla === "ocean") {
        minZ = -2;
        size = 26;
      } else if (s.cla === "sea") {
        minZ = 0.2;
        size = 15;
      } else if (s.cla === "gulf" || s.cla === "bay") {
        minZ = 1.6;
        size = 12;
      } else {
        minZ = 2.6;
        size = 10.5;
      }
      if (s.area > 0.02 && s.cla !== "ocean") minZ -= 0.6;
      if (z < minZ - (density - 1) * 1.5) continue;
      const p = this.toScreen(vp, camera, s.lon, s.lat, W, H, 0);
      if (!p) continue;
      const fs = size * k * ls * (s.cla === "ocean" ? 1 : clamp(0.85 + z * 0.06, 0.85, 1.4));
      ctx.font = `600 ${fs}px ${th.labelFont}`;
      this.setLetterSpacing(ctx, fs * 0.38);
      const lines = wrapText(ctx, s.name.toUpperCase(), fs * 9);
      const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const rect: Rect = { x: p[0] - width / 2, y: p[1] - (lines.length * fs * 1.2) / 2, w: width, h: lines.length * fs * 1.2 };
      if (placed.some((r) => overlaps(r, rect))) continue;
      placed.push(rect);
      ctx.fillStyle = th.seaLabel;
      ctx.shadowColor = th.seaLabelGlow ?? "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 8 * k;
      lines.forEach((ln, i) => ctx.fillText(ln, p[0], p[1] + (i - (lines.length - 1) / 2) * fs * 1.2));
      ctx.shadowBlur = 0;
    }
    this.setLetterSpacing(ctx, 0);
  }

  // ------------------------------------------------------------------ HUD
  private renderHud(ctx: Ctx, W: number, H: number, state: ResolvedState) {
    const th = this.theme;
    const k = W / 1920;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    // year
    if (state.year) {
      ctx.font = `800 ${58 * k}px ${th.hudFont}`;
      ctx.textAlign = "left";
      this.setLetterSpacing(ctx, 1 * k);
      ctx.shadowColor = th.hudAccent;
      ctx.shadowBlur = 22 * k;
      ctx.fillStyle = th.hudText;
      ctx.fillText(state.year, 24 * k, 62 * k);
      ctx.shadowBlur = 0;
      this.setLetterSpacing(ctx, 0);
    }
    // flags
    if (state.flags) {
      const y0 = 82 * k;
      let x = 22 * k;
      const drawSide = (ids: string[], faction: typeof state.flags.leftFaction, label?: string) => {
        const startX = x;
        if (faction) {
          drawFlag(ctx, faction, x, y0, 64 * k, 64 * k, "#333");
          x += 72 * k;
        }
        const [first, ...rest] = ids;
        if (first) {
          const ns = state.nations.get(first);
          drawFlag(ctx, ns?.flag, x, y0, 118 * k, 79 * k, ns?.color ?? "#444");
          x += 124 * k;
        }
        rest.forEach((id, i) => {
          const ns = state.nations.get(id);
          const col = Math.floor(i / 3);
          const row = i % 3;
          drawFlag(ctx, ns?.flag, x + col * 42 * k, y0 + row * 27 * k, 38 * k, 25 * k, ns?.color ?? "#444");
        });
        x += Math.ceil(rest.length / 3) * 42 * k;
        if (label) {
          ctx.font = `700 ${13 * k}px ${th.hudFont}`;
          ctx.fillStyle = th.hudText;
          ctx.textAlign = "left";
          this.setLetterSpacing(ctx, 1.5 * k);
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4 * k;
          ctx.fillText(label.toUpperCase(), startX, y0 + 100 * k);
          ctx.shadowBlur = 0;
          this.setLetterSpacing(ctx, 0);
        }
      };
      drawSide(state.flags.left, state.flags.leftFaction, state.flags.leftLabel);
      if (state.flags.right.length || state.flags.rightFaction) {
        x += 30 * k;
        // "vs" divider
        ctx.strokeStyle = withAlpha(th.hudAccent, 0.7);
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.moveTo(x - 15 * k, y0 + 6 * k);
        ctx.lineTo(x - 15 * k, y0 + 74 * k);
        ctx.stroke();
        drawSide(state.flags.right, state.flags.rightFaction, state.flags.rightLabel);
      }
    }
    // subtitles
    const bottom = state.subtitles.filter((s) => (s.position ?? "bottom") === "bottom");
    const top = state.subtitles.filter((s) => s.position === "top");
    const center = state.subtitles.filter((s) => s.position === "center");
    const fs = 34 * k;
    ctx.font = `700 ${fs}px ${th.hudFont}`;
    const drawSub = (text: string, x: number, y: number, align: CanvasTextAlign, boxed: boolean) => {
      ctx.textAlign = align;
      const w = ctx.measureText(text).width;
      if (boxed || th.subtitleBg) {
        ctx.fillStyle = th.subtitleBg ?? "rgba(0,0,0,0.55)";
        const bx = align === "left" ? x - 12 * k : align === "center" ? x - w / 2 - 12 * k : x - w - 12 * k;
        ctx.fillRect(bx, y - fs * 0.95, w + 24 * k, fs * 1.3);
      }
      ctx.fillStyle = th.hudText;
      ctx.shadowColor = th.hudAccent;
      ctx.shadowBlur = 16 * k;
      ctx.fillText(text, x, y);
      ctx.shadowBlur = 0;
    };
    bottom.forEach((s, i) => drawSub(s.text, 26 * k, H - 30 * k - i * fs * 1.4, "left", s.style === "box"));
    top.forEach((s, i) => drawSub(s.text, W / 2, 70 * k + i * fs * 1.4, "center", s.style === "box"));
    center.forEach((s, i) => drawSub(s.text, W / 2, H / 2 + i * fs * 1.4, "center", s.style === "box"));
    ctx.restore();
  }

  private renderInset(ctx: Ctx, W: number, H: number, inset: InsetEvent, state: ResolvedState, opts: RenderOptions) {
    const th = this.theme;
    const k = W / 1920;
    const w = Math.round(inset.width * W);
    const h = Math.round(inset.height * H);
    const pad = 24 * k;
    const x = inset.corner.endsWith("right") ? W - w - pad : pad;
    const y = inset.corner.startsWith("bottom") ? H - h - pad : pad + 60 * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    this.renderScene(ctx, this.inset, w, h, inset.camera, state, { ...opts, editorOverlay: false, crosshair: null }, true);
    ctx.restore();
    ctx.strokeStyle = th.hudAccent;
    ctx.lineWidth = 2 * k;
    ctx.shadowColor = th.hudAccent;
    ctx.shadowBlur = 10 * k;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
    if (inset.title) {
      ctx.font = `700 ${14 * k}px ${th.hudFont}`;
      ctx.fillStyle = th.hudText;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      this.setLetterSpacing(ctx, 2 * k);
      ctx.fillText(inset.title.toUpperCase(), x + 10 * k, y - 8 * k);
      this.setLetterSpacing(ctx, 0);
    }
  }

  private renderVignette(ctx: Ctx, W: number, H: number) {
    const th = this.theme;
    if (th.vignette) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.8);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, th.vignette);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (th.scanlines) {
      if (!this.scanlinePattern) {
        const c = document.createElement("canvas");
        c.width = 4;
        c.height = 4;
        const g = c.getContext("2d")!;
        g.fillStyle = "rgba(0,0,0,0.13)";
        g.fillRect(0, 0, 4, 1);
        this.scanlinePattern = ctx.createPattern(c, "repeat");
      }
      if (this.scanlinePattern) {
        ctx.fillStyle = this.scanlinePattern;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }
}
