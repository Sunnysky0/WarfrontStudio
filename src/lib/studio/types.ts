// ---------------------------------------------------------------------------
// Warfront Animation Studio – document model
// ---------------------------------------------------------------------------

export type LOD = "low" | "medium" | "high";

export type BorderYear =
  | "present"
  | "2010"
  | "1994"
  | "1960"
  | "1945"
  | "1939"
  | "1935"
  | "1920"
  | "1914"
  | "1900";

export type ProjectionId =
  | "mercator"
  | "equirectangular"
  | "robinson"
  | "naturalEarth"
  | "equalEarth"
  | "winkel3"
  | "miller"
  | "mollweide"
  | "orthographic"
  | "stereographic"
  | "conicConformal"
  | "azimuthalEqualArea"
  | "satellite";

export type LayerId =
  | "graticule"
  | "land"
  | "coastlines"
  | "lakes"
  | "rivers"
  | "railroads"
  | "provinces"
  | "countries"
  | "nationOutlines"
  | "cities"
  | "cityLabels"
  | "seaLabels"
  | "nationLabels"
  | "countryLabels"
  | "vignette";

export type LayerVisibility = Record<LayerId, boolean>;

export interface Camera {
  lon: number;
  lat: number;
  /** d3 projection scale normalized to a 1920px wide frame */
  scale: number;
  /** roll rotation (degrees) – mostly for globe views */
  roll?: number;
}

export type FlagSpec =
  | { kind: "iso"; code: string }
  | { kind: "image"; url: string }
  | {
      kind: "custom";
      /** stripe orientation */
      layout: "horizontal" | "vertical" | "solid";
      colors: string[];
      emblem?: {
        shape: "star" | "circle" | "sun" | "crescent" | "cross" | "diamond" | "octastar" | "hammer" | "trident" | "none";
        color: string;
        size?: number; // relative to flag height (0-1)
        x?: number; // 0-1
        y?: number; // 0-1
      };
      border?: string;
    };

export interface Nation {
  id: string;
  name: string;
  color: string;
  flag?: FlagSpec;
  /** region keys owned at t=0 – `c:XXX` country, `p:CODE` province, `pn:ADM0:Name` province by name */
  regions: string[];
  labelPos?: [number, number];
  labelScale?: number;
  labelHidden?: boolean;
  labelColor?: string;
  /** optional short description shown in inspector */
  note?: string;
}

export type Easing = "linear" | "easeInOut" | "easeOut" | "easeIn";

export type FrontMode = "auto" | "radial" | "linear" | "fade" | "instant" | "sweep-from-attacker";

export type LonLat = [number, number];

export interface FrontBezierNode {
  anchor: LonLat;
  /** Handle vectors relative to anchor, in longitude/latitude degrees. */
  in?: LonLat;
  out?: LonLat;
  /** Linked handles stay collinear while either side is dragged. */
  linked?: boolean;
}

export interface FrontBezierPath {
  kind: "bezier";
  nodes: FrontBezierNode[];
}

interface BaseEvent {
  id: string;
  start: number;
  end: number;
  label?: string;
  track?: string;
}

export interface CameraEvent extends BaseEvent {
  type: "camera";
  camera: Camera;
  easing: Easing;
}

export interface TerritoryEvent extends BaseEvent {
  type: "territory";
  regions: string[];
  toNation: string;
  /** used for frontline direction when mode = auto/sweep-from-attacker */
  fromNation?: string;
  mode: FrontMode;
  origin?: [number, number];
  /** degrees, direction of advance for linear mode (0 = east, 90 = north) */
  direction?: number;
  roughness?: number; // 0-1
  easing?: Easing;
  showFrontline?: boolean;
  clearProvinces?: boolean;
}

export interface FrontKeyframe {
  /** Seconds from event.start. First keyframe should be 0. */
  offset: number;
  /** Legacy control polyline. Its existing Catmull-Rom playback is preserved. */
  points?: LonLat[];
  /** Editable vector path. When present this takes precedence over `points`. */
  path?: FrontBezierPath;
}

export type FrontTheater = "land" | "sides" | "regions";

export interface FrontEvent extends BaseEvent {
  type: "front";
  /** Occupying / advancing nation (fill colour). */
  nation: string;
  /** Defender; default theater is occupier ∪ defender land. */
  against?: string;
  keyframes: FrontKeyframe[];
  /**
   * A point on the captured side of the line, used to pick which
   * half-plane to fill. Ignored when `closed` is true.
   */
  capturedSide: [number, number];
  /** If true (or first≈last), fill the ring interior — pockets / landings. */
  closed?: boolean;
  /**
   * Extra clip besides land.
   * - land: all land on the captured side (escape hatch; pad the line or it floods a continent)
   * - sides: occupier ∪ defender current fills (default when `against` is set)
   * - regions: frozen region-key list (`clipRegions`)
   */
  theater?: FrontTheater;
  clipRegions?: string[];
  fillOccupation?: boolean;
  showFrontline?: boolean;
  /** Keep the last keyframe painted after `end`. Default true. */
  holdAfterEnd?: boolean;
  roughness?: number;
  easing?: Easing;
}

export interface NationChangeEvent extends BaseEvent {
  type: "nationChange";
  nation: string;
  name?: string;
  color?: string;
  flag?: FlagSpec;
  labelPos?: [number, number];
  labelScale?: number;
}

export interface DisintegrateEvent extends BaseEvent {
  type: "disintegrate";
  from: string;
  parts: { nation: string; regions: string[] }[];
  mode: "fade" | "instant" | "shatter";
  /** if true, the `from` nation loses everything not listed in parts (becomes empty) */
  dissolveRemainder?: boolean;
  remainderNation?: string;
}

export interface SubtitleEvent extends BaseEvent {
  type: "subtitle";
  text: string;
  style?: "plain" | "box";
  position?: "bottom" | "top" | "center";
}

export interface TextEvent extends BaseEvent {
  type: "text";
  text: string;
  pos: [number, number]; // lon/lat anchor
  size?: number;
  color?: string;
  screenPos?: [number, number]; // 0-1 fractions; when set, overrides pos
}

export type MarkerKind =
  | "nuke"
  | "explosion"
  | "fire"
  | "battle"
  | "skull"
  | "star"
  | "ship"
  | "plane"
  | "tank"
  | "flag"
  | "gas"
  | "missile"
  | "siege"
  | "revolt";

export interface MarkerEvent extends BaseEvent {
  type: "marker";
  kind: MarkerKind;
  pos: [number, number];
  size?: number;
  color?: string;
  pulse?: boolean;
  /** additional positions for a cluster (e.g. nuclear barrage) */
  extra?: [number, number][];
}

export interface FlagsEvent extends BaseEvent {
  type: "flags";
  left: string[]; // nation ids
  right: string[];
  leftLabel?: string;
  rightLabel?: string;
  leftFaction?: FlagSpec;
  rightFaction?: FlagSpec;
}

export interface InsetEvent extends BaseEvent {
  type: "inset";
  camera: Camera;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  width: number; // fraction of frame width
  height: number; // fraction of frame height
  title?: string;
}

export interface YearEvent extends BaseEvent {
  type: "year";
  text: string;
}

export type StudioEvent =
  | CameraEvent
  | TerritoryEvent
  | FrontEvent
  | NationChangeEvent
  | DisintegrateEvent
  | SubtitleEvent
  | TextEvent
  | MarkerEvent
  | FlagsEvent
  | InsetEvent
  | YearEvent;

export type EventType = StudioEvent["type"];

export interface MapSettings {
  projection: ProjectionId;
  lod: LOD;
  borderYear: BorderYear;
  theme: string;
  layers: LayerVisibility;
  width: number;
  height: number;
  defaultCamera: Camera;
  /** projection precision (adaptive resampling); 0 disables */
  precision?: number;
  labelScale?: number;
  cityDensity?: number; // 0-2
  seaLabelDensity?: number;
  showGlow?: boolean;
}

export interface ProjectDoc {
  version: 1;
  name: string;
  description: string;
  duration: number; // seconds
  map: MapSettings;
  nations: Nation[];
  events: StudioEvent[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  updatedAt: string;
  createdAt: string;
  thumbnail?: string | null;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
export interface MapTheme {
  id: string;
  name: string;
  bg: string;
  bgGradient?: [string, string];
  land: string;
  coast: string;
  coastGlow?: string;
  coastWidth: number;
  border: string;
  borderWidth: number;
  borderDash?: number[];
  province: string;
  provinceWidth: number;
  river: string;
  lake: string;
  lakeStroke?: string;
  rail: string;
  railDash?: number[];
  graticule: string;
  label: string;
  labelShadow: string;
  labelFont: string;
  seaLabel: string;
  seaLabelGlow?: string;
  city: string;
  cityGlow?: string;
  cityLabel: string;
  frontline: string;
  frontlineGlow?: string;
  nationOutline: string;
  nationOutlineWidth: number;
  hudText: string;
  hudAccent: string;
  hudFont: string;
  subtitleBg?: string;
  vignette?: string;
  scanlines?: boolean;
  /** how strongly nation colors are blended toward theme (0-1) */
  fillDesaturate?: number;
}

export const ALL_LAYERS: LayerId[] = [
  "graticule",
  "land",
  "coastlines",
  "lakes",
  "rivers",
  "railroads",
  "provinces",
  "countries",
  "nationOutlines",
  "cities",
  "cityLabels",
  "seaLabels",
  "nationLabels",
  "countryLabels",
  "vignette",
];

export const LAYER_LABELS: Record<LayerId, string> = {
  graticule: "Graticule",
  land: "Land fill",
  coastlines: "Coastlines",
  lakes: "Lakes",
  rivers: "Rivers",
  railroads: "Railroads",
  provinces: "Provinces (admin-1)",
  countries: "Country borders",
  nationOutlines: "Nation outlines",
  cities: "Cities",
  cityLabels: "City labels",
  seaLabels: "Sea / ocean labels",
  nationLabels: "Nation labels",
  countryLabels: "Neutral country labels",
  vignette: "Vignette / atmosphere",
};

export const BORDER_YEARS: { id: BorderYear; label: string }[] = [
  { id: "present", label: "Present day (Natural Earth)" },
  { id: "2010", label: "2010" },
  { id: "1994", label: "1994" },
  { id: "1960", label: "1960" },
  { id: "1945", label: "1945" },
  { id: "1939", label: "1939" },
  { id: "1935", label: "1935" },
  { id: "1920", label: "1920" },
  { id: "1914", label: "1914" },
  { id: "1900", label: "1900" },
];

export const PROJECTIONS: { id: ProjectionId; label: string }[] = [
  { id: "mercator", label: "Mercator" },
  { id: "equirectangular", label: "Equirectangular (Plate Carrée)" },
  { id: "robinson", label: "Robinson" },
  { id: "naturalEarth", label: "Natural Earth" },
  { id: "equalEarth", label: "Equal Earth" },
  { id: "winkel3", label: "Winkel Tripel" },
  { id: "miller", label: "Miller Cylindrical" },
  { id: "mollweide", label: "Mollweide" },
  { id: "orthographic", label: "Orthographic (Globe)" },
  { id: "satellite", label: "Satellite (Tilted Globe)" },
  { id: "stereographic", label: "Stereographic" },
  { id: "conicConformal", label: "Lambert Conic Conformal" },
  { id: "azimuthalEqualArea", label: "Azimuthal Equal Area" },
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  camera: "Camera",
  territory: "Territory",
  front: "Drawn frontline",
  nationChange: "Nation transition",
  disintegrate: "Disintegration",
  subtitle: "Subtitle",
  text: "Map text",
  marker: "Marker",
  flags: "Belligerent flags",
  inset: "Inset map",
  year: "Year counter",
};

export const TRACK_ORDER: EventType[] = [
  "year",
  "camera",
  "territory",
  "front",
  "disintegrate",
  "nationChange",
  "marker",
  "text",
  "subtitle",
  "flags",
  "inset",
];

export function uid(prefix = "e"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}
