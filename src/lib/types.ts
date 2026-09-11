export type LonLat = [number, number];
export type Granularity = "low" | "medium" | "high";
export type Easing = "linear" | "easeInOut" | "easeOut" | "easeIn" | "step";

export type ProjectionId =
  | "mercator"
  | "equirectangular"
  | "conicConformal"
  | "conicEqualArea"
  | "conicEquidistant"
  | "azimuthalEqualArea"
  | "azimuthalEquidistant"
  | "orthographic"
  | "stereographic"
  | "transverseMercator"
  | "equalEarth"
  | "naturalEarth1"
  | "robinson"
  | "winkel3"
  | "mollweide"
  | "miller"
  | "bonne"
  | "eckert4"
  | "hammer"
  | "vanDerGrinten";

export type BorderYear = "1900" | "1914" | "1920" | "1930" | "1935" | "1938" | "1939" | "1945" | "1960" | "1994" | "2010";

export interface VideoSettings {
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
}

export interface LayerToggles {
  land: boolean;
  coastline: boolean;
  borders: boolean;
  provinces: boolean;
  rivers: boolean;
  lakes: boolean;
  railroads: boolean;
  cities: boolean;
  cityLabels: boolean;
  graticule: boolean;
  hatch: boolean;
}

export interface MapStyle {
  ocean: string;
  land: string;
  coastline: string;
  coastlineWidth: number;
  border: string;
  borderWidth: number;
  province: string;
  provinceWidth: number;
  river: string;
  riverWidth: number;
  lake: string;
  railroad: string;
  railroadWidth: number;
  city: string;
  cityLabel: string;
  cityMinRank: number; // 0..10 (lower = only major cities)
  hatchColor: string;
  hatchOpacity: number;
  graticule: string;
  factionOpacity: number;
  fontFamily: string;
}

export interface MapSettings {
  projection: ProjectionId;
  granularity: Granularity;
  bordersYear: BorderYear;
  layers: LayerToggles;
  style: MapStyle;
}

export interface PacingPoint {
  t: number; // video seconds
  date: string; // ISO date
}

export interface TimeSettings {
  start: string;
  end: string;
  pacing: PacingPoint[];
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  hatch?: boolean;
}

export interface Membership {
  id: string;
  country: string; // matches NAME (or SUBJECTO when includeSubjects) in the borders layer
  factionId: string;
  from?: string;
  to?: string;
  includeSubjects: boolean;
}

export interface ShapeKeyframe {
  date: string;
  points: LonLat[];
  easing?: Easing;
}

export interface Zone {
  id: string;
  name: string;
  factionId: string;
  opacity: number;
  outline: boolean;
  outlineColor?: string;
  outlineWidth: number;
  from?: string;
  to?: string;
  keyframes: ShapeKeyframe[];
}

export interface FrontLine {
  id: string;
  name: string;
  color: string;
  width: number;
  dash: number[];
  glow: boolean;
  from?: string;
  to?: string;
  keyframes: ShapeKeyframe[];
}

export interface ValueKeyframe {
  date: string;
  value: number;
}

export type NumberFormat = "none" | "dot" | "comma" | "space" | "compact";

export interface Label {
  id: string;
  text: string;
  position: LonLat;
  rotation: number; // degrees
  fontSize: number; // px at 1080p
  color: string;
  outline: string;
  bold: boolean;
  from?: string;
  to?: string;
  valueKeyframes?: ValueKeyframe[];
  numberFormat: NumberFormat;
}

export type IconId =
  | "battle"
  | "explosion"
  | "infantry"
  | "cavalry"
  | "artillery"
  | "tank"
  | "navy"
  | "air"
  | "flag"
  | "star"
  | "skull"
  | "siege"
  | "surrender"
  | "crosshair"
  | "dot";

export interface Marker {
  id: string;
  name: string;
  icon: IconId;
  position: LonLat;
  size: number;
  color: string;
  from?: string;
  to?: string;
  animation: "none" | "pulse" | "blink";
  label?: string;
  labelPosition: "below" | "right" | "above";
}

export interface Arrow {
  id: string;
  name: string;
  from: LonLat;
  to: LonLat;
  curve: number; // -1..1 bulge
  color: string;
  width: number;
  start: string;
  end: string; // fully drawn at this date
  holdUntil?: string; // fades after this date
  head: boolean;
  dash: boolean;
}

export interface TimelineEvent {
  id: string;
  date: string;
  text: string;
  durationDays?: number;
  style: "subtitle" | "headline";
}

export interface CameraKeyframe {
  date: string;
  center: LonLat;
  zoom: number;
  roll?: number;
  easing: Easing;
}

export interface Overlays {
  date: { show: boolean; format: "D MMM YYYY" | "DD.MM.YYYY" | "MMMM D, YYYY" | "YYYY-MM-DD"; fontSize: number; color: string };
  clock: { show: boolean; mode: "timeOfDay" | "elapsed" | "dayCount" };
  subtitle: { show: boolean; fontSize: number; color: string; background: boolean; position: "bottom-left" | "bottom-center" };
  title: { show: boolean; text: string; subtitle: string; seconds: number };
  legend: { show: boolean; position: "top-right" | "bottom-right" };
  watermark: string;
}

export interface Project {
  version: 1;
  name: string;
  description: string;
  video: VideoSettings;
  map: MapSettings;
  time: TimeSettings;
  factions: Faction[];
  memberships: Membership[];
  zones: Zone[];
  lines: FrontLine[];
  labels: Label[];
  markers: Marker[];
  arrows: Arrow[];
  events: TimelineEvent[];
  camera: { keyframes: CameraKeyframe[] };
  overlays: Overlays;
}

export type ElementType = "zone" | "line" | "label" | "marker" | "arrow" | "event" | "camera" | "faction" | "membership";

export interface Selection {
  type: ElementType;
  id: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  isTemplate: boolean;
  templateKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetItem {
  id: string;
  key: string;
  category: "icon" | "palette" | "lineStyle" | "arrowStyle" | "shape";
  name: string;
  description: string;
  data: Record<string, unknown>;
  builtIn: boolean;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
