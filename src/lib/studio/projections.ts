import {
  geoMercator,
  geoEquirectangular,
  geoOrthographic,
  geoStereographic,
  geoConicConformal,
  geoAzimuthalEqualArea,
  geoNaturalEarth1,
  geoEqualEarth,
  type GeoProjection,
} from "d3-geo";
import { geoRobinson, geoWinkel3, geoMiller, geoMollweide, geoSatellite } from "d3-geo-projection";
import type { Camera, ProjectionId } from "./types";

export function createProjection(id: ProjectionId): GeoProjection {
  switch (id) {
    case "mercator":
      return geoMercator();
    case "equirectangular":
      return geoEquirectangular();
    case "robinson":
      return geoRobinson();
    case "naturalEarth":
      return geoNaturalEarth1();
    case "equalEarth":
      return geoEqualEarth();
    case "winkel3":
      return geoWinkel3();
    case "miller":
      return geoMiller();
    case "mollweide":
      return geoMollweide();
    case "orthographic":
      return geoOrthographic().clipAngle(90);
    case "satellite":
      return geoSatellite().distance(1.8).tilt(22).clipAngle(Math.acos(1 / 1.8) * (180 / Math.PI) - 1e-3);
    case "stereographic":
      return geoStereographic().clipAngle(120);
    case "conicConformal":
      return geoConicConformal().parallels([25, 50]);
    case "azimuthalEqualArea":
      return geoAzimuthalEqualArea().clipAngle(150);
    default:
      return geoMercator();
  }
}

export function isAzimuthal(id: ProjectionId): boolean {
  return id === "orthographic" || id === "satellite" || id === "stereographic" || id === "azimuthalEqualArea";
}

/**
 * Configure a projection for a camera & frame. `camera.scale` is normalized to a
 * 1920px wide frame so that projects can be exported at any resolution.
 */
export function applyCamera(
  proj: GeoProjection,
  id: ProjectionId,
  camera: Camera,
  width: number,
  height: number,
  precision = 0.5
): GeoProjection {
  const s = camera.scale * (width / 1920);
  proj.translate([width / 2, height / 2]).scale(s).precision(precision);
  if (isAzimuthal(id)) {
    proj.rotate([-camera.lon, -camera.lat, camera.roll ?? 0]).center([0, 0]);
  } else if (id === "conicConformal") {
    const lat = Math.max(-80, Math.min(80, camera.lat));
    (proj as GeoProjection & { parallels?: (p: [number, number]) => GeoProjection }).parallels?.([
      lat - 12,
      lat + 12,
    ]);
    proj.rotate([-camera.lon, 0, 0]).center([0, lat]);
  } else {
    // cylindrical / pseudocylindrical: rotate longitude, center latitude
    const lat = id === "mercator" ? Math.max(-84, Math.min(84, camera.lat)) : camera.lat;
    proj.rotate([-camera.lon, 0, 0]).center([0, lat]);
  }
  return proj;
}

/** Convert a zoom-like value to scale & back for UI sliders */
export function zoomToScale(z: number): number {
  return 150 * Math.pow(2, z);
}
export function scaleToZoom(s: number): number {
  return Math.log2(Math.max(1, s) / 150);
}
