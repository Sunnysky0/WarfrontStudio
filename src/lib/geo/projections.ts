import {
  geoAzimuthalEqualArea,
  geoAzimuthalEquidistant,
  geoConicConformal,
  geoConicEqualArea,
  geoConicEquidistant,
  geoEqualEarth,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoStereographic,
  geoTransverseMercator,
  type GeoProjection,
} from "d3-geo";
import { geoBonne, geoEckert4, geoHammer, geoMiller, geoMollweide, geoRobinson, geoVanDerGrinten, geoWinkel3 } from "d3-geo-projection";
import type { ProjectionId } from "../types";
import type { CameraState } from "../interpolate";

type Family = "cylindrical" | "conic" | "azimuthal" | "pseudo";

export interface ProjectionDef {
  id: ProjectionId;
  name: string;
  family: Family;
  create: () => GeoProjection;
  hint: string;
}

export const PROJECTIONS: ProjectionDef[] = [
  { id: "mercator", name: "Mercator", family: "cylindrical", create: () => geoMercator(), hint: "Classic web-map look, conformal" },
  { id: "conicConformal", name: "Lambert Conic Conformal", family: "conic", create: () => geoConicConformal(), hint: "Best for continental theatres (Europe)" },
  { id: "conicEqualArea", name: "Albers Conic Equal-Area", family: "conic", create: () => geoConicEqualArea(), hint: "Equal-area regional map" },
  { id: "conicEquidistant", name: "Conic Equidistant", family: "conic", create: () => geoConicEquidistant(), hint: "Balanced regional map" },
  { id: "azimuthalEqualArea", name: "Lambert Azimuthal Equal-Area", family: "azimuthal", create: () => geoAzimuthalEqualArea(), hint: "Polar / hemispheric views" },
  { id: "azimuthalEquidistant", name: "Azimuthal Equidistant", family: "azimuthal", create: () => geoAzimuthalEquidistant(), hint: "True distances from centre" },
  { id: "orthographic", name: "Orthographic (Globe)", family: "azimuthal", create: () => geoOrthographic(), hint: "Globe seen from space" },
  { id: "stereographic", name: "Stereographic", family: "azimuthal", create: () => geoStereographic().clipAngle(120), hint: "Conformal hemispheric" },
  { id: "transverseMercator", name: "Transverse Mercator", family: "cylindrical", create: () => geoTransverseMercator(), hint: "North–south elongated theatres" },
  { id: "equirectangular", name: "Equirectangular", family: "cylindrical", create: () => geoEquirectangular(), hint: "Plate carrée" },
  { id: "miller", name: "Miller Cylindrical", family: "cylindrical", create: () => geoMiller(), hint: "Compromise cylindrical" },
  { id: "equalEarth", name: "Equal Earth", family: "pseudo", create: () => geoEqualEarth(), hint: "Modern equal-area world map" },
  { id: "naturalEarth1", name: "Natural Earth", family: "pseudo", create: () => geoNaturalEarth1(), hint: "Pleasant world map" },
  { id: "robinson", name: "Robinson", family: "pseudo", create: () => geoRobinson(), hint: "Classic atlas world map" },
  { id: "winkel3", name: "Winkel Tripel", family: "pseudo", create: () => geoWinkel3(), hint: "National Geographic style" },
  { id: "mollweide", name: "Mollweide", family: "pseudo", create: () => geoMollweide(), hint: "Elliptical equal-area" },
  { id: "hammer", name: "Hammer", family: "pseudo", create: () => geoHammer(), hint: "Elliptical equal-area" },
  { id: "eckert4", name: "Eckert IV", family: "pseudo", create: () => geoEckert4(), hint: "Equal-area with flat poles" },
  { id: "vanDerGrinten", name: "Van der Grinten", family: "pseudo", create: () => geoVanDerGrinten(), hint: "Circular world map" },
  { id: "bonne", name: "Bonne", family: "pseudo", create: () => geoBonne(), hint: "Heart-shaped historical look" },
];

export function projectionDef(id: ProjectionId): ProjectionDef {
  return PROJECTIONS.find((p) => p.id === id) ?? PROJECTIONS[0];
}

/** Build a projection for a viewport from a camera state. zoom = 1 roughly fits the world width. */
export function buildProjection(id: ProjectionId, width: number, height: number, camera: CameraState): GeoProjection {
  const def = projectionDef(id);
  const proj = def.create();
  const baseScale = proj.scale() * (width / 960);
  const [lon, lat] = camera.center;
  const roll = camera.roll || 0;
  const clampedLat = Math.max(-85, Math.min(85, lat));
  proj.translate([width / 2, height / 2]);
  proj.precision(0.3);
  switch (def.family) {
    case "azimuthal":
      proj.rotate([-lon, -lat, roll]).center([0, 0]);
      break;
    case "conic": {
      const lo = Math.max(-80, Math.min(80, clampedLat - 12));
      const hi = Math.max(-80, Math.min(80, clampedLat + 12));
      (proj as GeoProjection & { parallels(p: [number, number]): GeoProjection }).parallels([lo, hi]);
      proj.rotate([-lon, 0, roll]).center([0, clampedLat]);
      break;
    }
    case "cylindrical":
    case "pseudo":
    default:
      // d3's transverseMercator already swaps rotate/center internally, so all cylindricals share one setup
      proj.rotate([-lon, 0, roll]).center([0, clampedLat]);
      break;
  }
  proj.scale(baseScale * Math.max(0.05, camera.zoom));
  proj.clipExtent([
    [-2, -2],
    [width + 2, height + 2],
  ]);
  return proj;
}

/** Approximate visible lon/lat bounds for culling; null when the view is not fully invertible (globe edges etc). */
export function visibleBounds(proj: GeoProjection, width: number, height: number): [number, number, number, number] | null {
  if (!proj.invert) return null;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const nx = 6;
  const ny = 6;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const p = proj.invert([(i / nx) * width, (j / ny) * height]);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
      const back = proj(p);
      if (!back || Math.hypot(back[0] - (i / nx) * width, back[1] - (j / ny) * height) > 2) return null;
      minLon = Math.min(minLon, p[0]);
      maxLon = Math.max(maxLon, p[0]);
      minLat = Math.min(minLat, p[1]);
      maxLat = Math.max(maxLat, p[1]);
    }
  }
  if (maxLon - minLon > 300) return null;
  const padX = (maxLon - minLon) * 0.1 + 0.5;
  const padY = (maxLat - minLat) * 0.1 + 0.5;
  return [minLon - padX, minLat - padY, maxLon + padX, maxLat + padY];
}
