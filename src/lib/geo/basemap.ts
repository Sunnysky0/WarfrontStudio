import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Polygon, MultiPolygon } from "geojson";
import type { BorderYear, Granularity } from "../types";

export type BBox = [number, number, number, number];

export interface BoundedFeature {
  feature: Feature<Geometry>;
  bbox: BBox;
  props: Record<string, string | number | undefined>;
}

export interface LoadedLayer {
  name: string;
  features: BoundedFeature[]; // polygons or lines with bbox
  interior: BoundedFeature[]; // interior mesh (shared boundaries), split into lines with bbox
  outline: BoundedFeature[]; // all boundaries (coastline for land)
}

export interface CityPoint {
  n: string;
  x: number;
  y: number;
  r: number; // scalerank 0..10
  p: number; // population
  c: number; // capital flag
  a?: string; // country
}

export const BORDER_YEARS: { id: BorderYear; label: string; file: string; note?: string }[] = [
  { id: "1900", label: "1900", file: "borders_1900" },
  { id: "1914", label: "1914", file: "borders_1914" },
  { id: "1920", label: "1920", file: "borders_1920" },
  { id: "1930", label: "1930", file: "borders_1930" },
  { id: "1935", label: "1935", file: "borders_1930", note: "uses the 1930 snapshot" },
  { id: "1938", label: "1938", file: "borders_1938" },
  { id: "1939", label: "1939", file: "borders_1938", note: "uses the 1938 snapshot" },
  { id: "1945", label: "1945", file: "borders_1945" },
  { id: "1960", label: "1960", file: "borders_1960" },
  { id: "1994", label: "1994", file: "borders_1994" },
  { id: "2010", label: "2010", file: "borders_2010" },
];

export function borderFile(year: BorderYear): string {
  return BORDER_YEARS.find((y) => y.id === year)?.file ?? "borders_1914";
}

function bboxOfCoords(coords: unknown, box: BBox) {
  if (typeof (coords as number[])[0] === "number") {
    const c = coords as number[];
    if (c[0] < box[0]) box[0] = c[0];
    if (c[1] < box[1]) box[1] = c[1];
    if (c[0] > box[2]) box[2] = c[0];
    if (c[1] > box[3]) box[3] = c[1];
    return;
  }
  for (const c of coords as unknown[]) bboxOfCoords(c, box);
}

export function geometryBBox(g: Geometry): BBox {
  const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  if (g.type === "GeometryCollection") g.geometries.forEach((gg) => bboxOfCoords((gg as Polygon).coordinates, box));
  else bboxOfCoords((g as Polygon).coordinates, box);
  return box;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function splitMesh(m: MultiLineString): BoundedFeature[] {
  return m.coordinates.map((line) => {
    const f: Feature<LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } };
    return { feature: f, bbox: geometryBBox(f.geometry), props: {} };
  });
}

const cache = new Map<string, Promise<LoadedLayer>>();
let citiesPromise: Promise<CityPoint[]> | null = null;

export function layerKey(file: string, gran: Granularity) {
  return `${file}_${gran}`;
}

export function loadLayer(file: string, gran: Granularity): Promise<LoadedLayer> {
  const key = layerKey(file, gran);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/data/${key}.json`);
      if (!res.ok) throw new Error(`Failed to load layer ${key}`);
      const topo = (await res.json()) as Topology;
      const objName = Object.keys(topo.objects)[0];
      const obj = topo.objects[objName] as GeometryCollection;
      const fc = feature(topo, obj) as FeatureCollection<Geometry>;
      const features: BoundedFeature[] = fc.features
        .filter((f) => f.geometry)
        .map((f) => ({ feature: f, bbox: geometryBBox(f.geometry), props: (f.properties ?? {}) as Record<string, string | number | undefined> }));
      const isPolygon = fc.features.some((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"));
      let interior: BoundedFeature[] = [];
      let outline: BoundedFeature[] = [];
      if (isPolygon) {
        interior = splitMesh(mesh(topo, obj, (a, b) => a !== b));
        outline = splitMesh(mesh(topo, obj));
      }
      return { name: key, features, interior, outline };
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function loadCities(): Promise<CityPoint[]> {
  if (!citiesPromise) {
    citiesPromise = fetch("/data/cities.json").then((r) => r.json() as Promise<CityPoint[]>);
    citiesPromise.catch(() => (citiesPromise = null));
  }
  return citiesPromise;
}

export function peekLayer(file: string, gran: Granularity): LoadedLayer | null {
  const p = cache.get(layerKey(file, gran));
  if (!p) return null;
  return resolved.get(layerKey(file, gran)) ?? null;
}

const resolved = new Map<string, LoadedLayer>();
export async function ensureLayer(file: string, gran: Granularity): Promise<LoadedLayer> {
  const l = await loadLayer(file, gran);
  resolved.set(layerKey(file, gran), l);
  return l;
}

export type PolygonFeature = Feature<Polygon | MultiPolygon>;
