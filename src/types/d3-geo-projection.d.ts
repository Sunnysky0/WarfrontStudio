declare module "d3-geo-projection" {
  import type { GeoProjection } from "d3-geo";

  export interface GeoSatelliteProjection extends GeoProjection {
    distance(): number;
    distance(d: number): this;
    tilt(): number;
    tilt(t: number): this;
  }

  export function geoRobinson(): GeoProjection;
  export function geoWinkel3(): GeoProjection;
  export function geoMiller(): GeoProjection;
  export function geoMollweide(): GeoProjection;
  export function geoPatterson(): GeoProjection;
  export function geoTimes(): GeoProjection;
  export function geoSatellite(): GeoSatelliteProjection;
}
