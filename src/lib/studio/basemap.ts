import { feature, mesh, merge } from "topojson-client";
import type { Topology, GeometryCollection, GeometryObject, Polygon as TPolygon, MultiPolygon as TMultiPolygon } from "topojson-specification";

type PolyGeom = TPolygon | TMultiPolygon;
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { geoBounds, geoContains, geoCentroid, geoArea } from "d3-geo";
import type { LOD, BorderYear } from "./types";

export interface RegionProps {
  name: string;
  adm0?: string;
  iso2?: string;
  iso?: string;
  subject?: string;
}

export interface RegionFeature extends Feature<Geometry, RegionProps> {
  id: string;
  /** [[minLon,minLat],[maxLon,maxLat]] */
  gbox: [[number, number], [number, number]];
  centroid: [number, number];
  /** largest polygon (by spherical area) – used for cheap label placement */
  mainPoly: Polygon | null;
  mainCentroid: [number, number];
}

function largestPolygon(geom: Geometry): Polygon | null {
  if (geom.type === "Polygon") return geom;
  if (geom.type !== "MultiPolygon") return null;
  let best: Polygon | null = null;
  let bestA = -1;
  for (const coords of geom.coordinates) {
    const poly: Polygon = { type: "Polygon", coordinates: coords };
    const a = geoArea(poly);
    if (a > bestA) {
      bestA = a;
      best = poly;
    }
  }
  return best;
}

export interface RegionLayer {
  topology: Topology;
  objectName: string;
  features: RegionFeature[];
  byId: Map<string, RegionFeature>;
  geomById: Map<string, GeometryObject>;
  /** interior borders only */
  mesh: MultiLineString;
  meshBoxes: Float64Array;
}

export interface City {
  name: string;
  lon: number;
  lat: number;
  rank: number;
  cap: number; // 0 national capital, 1 regional capital, 2 other
  pop: number;
  adm0: string;
}

export interface SeaLabel {
  name: string;
  lon: number;
  lat: number;
  rank: number;
  cla: string;
  area: number;
}

export interface Basemap {
  lod: LOD;
  year: BorderYear;
  countries: RegionLayer;
  provinces: RegionLayer;
  provincesByCountry: Map<string, string[]>;
  provinceNameIndex: Map<string, string>;
  land: Feature<MultiPolygon> | null;
  rivers: Feature<MultiLineString> | null;
  lakes: Feature<MultiPolygon> | null;
  railroads: Feature<MultiLineString> | null;
  boxes: {
    land: Float64Array | null;
    rivers: Float64Array | null;
    lakes: Float64Array | null;
    railroads: Float64Array | null;
  };
  cities: City[];
  seas: SeaLabel[];
}

export type GeoBBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

/** Geographic bbox of every top-level part (polygon or line) of a Multi* geometry */
export function partBoxes(geom: MultiPolygon | MultiLineString | null): Float64Array | null {
  if (!geom) return null;
  const parts = geom.coordinates as unknown as number[][][] | number[][][][];
  const out = new Float64Array(parts.length * 4);
  parts.forEach((part, i) => {
    // polygons: use the outer ring; lines: the line itself
    const pts = (geom.type === "MultiPolygon" ? (part as number[][][])[0] : (part as number[][])) ?? [];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    out[i * 4] = x0;
    out[i * 4 + 1] = y0;
    out[i * 4 + 2] = x1;
    out[i * 4 + 3] = y1;
  });
  return out;
}

/** Return the subset of parts intersecting the bbox (or the geometry itself when no bbox). */
export function cullGeometry<G extends MultiPolygon | MultiLineString>(geom: G, boxes: Float64Array | null, bbox: GeoBBox | null): G {
  if (!bbox || !boxes) return geom;
  const [bx0, by0, bx1, by1] = bbox;
  const parts = geom.coordinates as unknown[];
  const keep: unknown[] = [];
  for (let i = 0; i < parts.length; i++) {
    const x0 = boxes[i * 4],
      y0 = boxes[i * 4 + 1],
      x1 = boxes[i * 4 + 2],
      y1 = boxes[i * 4 + 3];
    if (x1 < bx0 || x0 > bx1 || y1 < by0 || y0 > by1) continue;
    keep.push(parts[i]);
  }
  return { type: geom.type, coordinates: keep } as G;
}

const jsonCache = new Map<string, Promise<unknown>>();

function fetchJson<T>(url: string): Promise<T> {
  if (!jsonCache.has(url)) {
    jsonCache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
        return r.json();
      })
    );
  }
  return jsonCache.get(url) as Promise<T>;
}

async function optional<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

function buildRegionLayer(topology: Topology, objectName: string): RegionLayer {
  const obj = topology.objects[objectName] as GeometryCollection;
  const fc = feature(topology, obj) as FeatureCollection<Geometry, RegionProps>;
  const features: RegionFeature[] = [];
  const byId = new Map<string, RegionFeature>();
  const geomById = new Map<string, GeometryObject>();
  obj.geometries.forEach((g, i) => {
    const f = fc.features[i];
    const id = String(g.id ?? f.id ?? `${objectName}:${i}`);
    if (!f.geometry) return;
    const gb = geoBounds(f);
    const mainPoly = largestPolygon(f.geometry);
    const rf: RegionFeature = Object.assign(f, {
      id,
      gbox: gb,
      centroid: geoCentroid(f),
      mainPoly,
      mainCentroid: mainPoly ? geoCentroid(mainPoly) : geoCentroid(f),
    });
    features.push(rf);
    byId.set(id, rf);
    geomById.set(id, g);
  });
  const m = mesh(topology, obj, (a, b) => a !== b);
  return { topology, objectName, features, byId, geomById, mesh: m, meshBoxes: partBoxes(m)! };
}

function singleFeature<G extends Geometry>(topo: Topology | null, objectName: string): Feature<G> | null {
  if (!topo) return null;
  const obj = topo.objects[objectName];
  if (!obj) return null;
  if (obj.type === "GeometryCollection") {
    const gc = obj as GeometryCollection;
    const polys = gc.geometries.filter((g): g is PolyGeom => g.type === "Polygon" || g.type === "MultiPolygon");
    if (polys.length === gc.geometries.length && polys.length > 0) {
      return { type: "Feature", properties: {}, geometry: merge(topo, polys) as unknown as G };
    }
    // line collections -> mesh of everything
    return { type: "Feature", properties: {}, geometry: mesh(topo, gc) as unknown as G };
  }
  return feature(topo, obj) as unknown as Feature<G>;
}

const basemapCache = new Map<string, Promise<Basemap>>();

export function loadBasemap(lod: LOD, year: BorderYear): Promise<Basemap> {
  const key = `${lod}|${year}`;
  if (!basemapCache.has(key)) {
    basemapCache.set(
      key,
      (async () => {
        const base = "/basemap";
        const [countriesTopo, provincesTopo, landTopo, riversTopo, lakesTopo, railTopo, citiesRaw, seasRaw] =
          await Promise.all([
            fetchJson<Topology>(`${base}/countries-${year}-${lod}.json`),
            fetchJson<Topology>(`${base}/provinces-${lod}.json`),
            optional<Topology>(`${base}/land-${lod}.json`),
            optional<Topology>(`${base}/rivers-${lod}.json`),
            optional<Topology>(`${base}/lakes-${lod}.json`),
            optional<Topology>(`${base}/railroads-${lod}.json`),
            optional<(string | number)[][]>(`${base}/cities.json`),
            optional<(string | number)[][]>(`${base}/seas.json`),
          ]);
        const countries = buildRegionLayer(countriesTopo, "countries");
        const provinces = buildRegionLayer(provincesTopo, "provinces");
        const provincesByCountry = new Map<string, string[]>();
        const provinceNameIndex = new Map<string, string>();
        for (const p of provinces.features) {
          const adm0 = p.properties.adm0 ?? "";
          const list = provincesByCountry.get(`c:${adm0}`) ?? [];
          list.push(p.id);
          provincesByCountry.set(`c:${adm0}`, list);
          provinceNameIndex.set(normalizeName(`${adm0}:${p.properties.name}`), p.id);
        }
        const cities: City[] = (citiesRaw ?? []).map((c) => ({
          name: String(c[0]),
          lon: Number(c[1]),
          lat: Number(c[2]),
          rank: Number(c[3]),
          cap: Number(c[4]),
          pop: Number(c[5]),
          adm0: String(c[6] ?? ""),
        }));
        const seas: SeaLabel[] = (seasRaw ?? []).map((s) => ({
          name: String(s[0]),
          lon: Number(s[1]),
          lat: Number(s[2]),
          rank: Number(s[3]),
          cla: String(s[4]),
          area: Number(s[5]),
        }));
        const land = singleFeature<MultiPolygon>(landTopo, "land");
        const rivers = singleFeature<MultiLineString>(riversTopo, "rivers");
        const lakes = singleFeature<MultiPolygon>(lakesTopo, "lakes");
        const railroads = singleFeature<MultiLineString>(railTopo, "railroads");
        return {
          lod,
          year,
          countries,
          provinces,
          provincesByCountry,
          provinceNameIndex,
          land,
          rivers,
          lakes,
          railroads,
          boxes: {
            land: partBoxes(land?.geometry ?? null),
            rivers: partBoxes(rivers?.geometry ?? null),
            lakes: partBoxes(lakes?.geometry ?? null),
            railroads: partBoxes(railroads?.geometry ?? null),
          },
          cities,
          seas,
        };
      })()
    );
  }
  return basemapCache.get(key)!;
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+prefecture$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a user-facing region key (`pn:JPN:Tokyo`) into a canonical key. */
export function resolveRegionKey(bm: Basemap | null, key: string): string {
  if (!bm) return key;
  if (key.startsWith("pn:")) {
    const rest = key.slice(3);
    const hit = bm.provinceNameIndex.get(normalizeName(rest));
    if (hit) return hit;
    // try without the country prefix (name only)
    const name = rest.includes(":") ? rest.slice(rest.indexOf(":") + 1) : rest;
    for (const p of bm.provinces.features) {
      if (normalizeName(p.properties.name) === normalizeName(name)) return p.id;
    }
    return key;
  }
  if (key.startsWith("cn:")) {
    const name = normalizeName(key.slice(3));
    for (const c of bm.countries.features) {
      if (normalizeName(c.properties.name) === name) return c.id;
    }
    return key;
  }
  return key;
}

export function regionName(bm: Basemap | null, key: string): string {
  if (!bm) return key;
  const k = resolveRegionKey(bm, key);
  const f = bm.countries.byId.get(k) ?? bm.provinces.byId.get(k);
  if (!f) return key;
  if (k.startsWith("p:")) {
    const c = bm.countries.byId.get(`c:${f.properties.adm0}`);
    return `${f.properties.name}${c ? ` (${c.properties.name})` : ""}`;
  }
  return f.properties.name;
}

function inBox(f: RegionFeature, lon: number, lat: number): boolean {
  const [[x0, y0], [x1, y1]] = f.gbox;
  if (lat < y0 || lat > y1) return false;
  if (x0 <= x1) return lon >= x0 && lon <= x1;
  return lon >= x0 || lon <= x1; // antimeridian crossing
}

/** Find the region under a geographic point. */
export function hitTest(bm: Basemap, lon: number, lat: number, kind: "country" | "province"): RegionFeature | null {
  const layer = kind === "country" ? bm.countries : bm.provinces;
  let best: RegionFeature | null = null;
  let bestArea = Infinity;
  for (const f of layer.features) {
    if (!inBox(f, lon, lat)) continue;
    if (geoContains(f, [lon, lat])) {
      const [[x0, y0], [x1, y1]] = f.gbox;
      const a = Math.abs(x1 - x0) * Math.abs(y1 - y0);
      if (a < bestArea) {
        best = f;
        bestArea = a;
      }
    }
  }
  return best;
}

/** Merge a set of region keys (already canonical) into GeoJSON geometry per layer */
export function mergeRegions(bm: Basemap, keys: Iterable<string>): { countries: MultiPolygon | null; provinces: MultiPolygon | null } {
  const c: PolyGeom[] = [];
  const p: PolyGeom[] = [];
  const isPoly = (g: GeometryObject | undefined): g is PolyGeom =>
    !!g && (g.type === "Polygon" || g.type === "MultiPolygon");
  for (const k of keys) {
    const gc = bm.countries.geomById.get(k);
    if (isPoly(gc)) {
      c.push(gc);
      continue;
    }
    const gp = bm.provinces.geomById.get(k);
    if (isPoly(gp)) p.push(gp);
  }
  return {
    countries: c.length ? (merge(bm.countries.topology, c) as MultiPolygon) : null,
    provinces: p.length ? (merge(bm.provinces.topology, p) as MultiPolygon) : null,
  };
}

export function searchRegions(bm: Basemap, query: string, limit = 30): RegionFeature[] {
  const q = normalizeName(query);
  if (!q) return [];
  const out: RegionFeature[] = [];
  for (const f of bm.countries.features) {
    if (normalizeName(f.properties.name).includes(q)) out.push(f);
    if (out.length >= limit) return out;
  }
  for (const f of bm.provinces.features) {
    if (normalizeName(f.properties.name).includes(q)) out.push(f);
    if (out.length >= limit) return out;
  }
  return out;
}
