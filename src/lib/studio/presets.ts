import type { FlagSpec, LayerVisibility, MapSettings, ProjectDoc } from "./types";

export const NATION_COLOR_PRESETS: { name: string; color: string }[] = [
  { name: "PRC Maroon", color: "#4a0d1e" },
  { name: "ROC Navy", color: "#1c2c6e" },
  { name: "PDTO Blue", color: "#22397f" },
  { name: "Heavenly Ochre", color: "#6b5313" },
  { name: "Client Green", color: "#1e5a2e" },
  { name: "Purification Black", color: "#07050a" },
  { name: "PLA Rust", color: "#7a2a12" },
  { name: "Warlord Brown", color: "#6e4a2a" },
  { name: "Soviet Red", color: "#b3202a" },
  { name: "Imperial Gold", color: "#b8860b" },
  { name: "Entente Blue", color: "#2f5fa8" },
  { name: "Central Powers Grey", color: "#4b5563" },
  { name: "Habsburg Yellow", color: "#c9a227" },
  { name: "Ottoman Crimson", color: "#8b1a1a" },
  { name: "Republican Teal", color: "#1d7a74" },
  { name: "Reich Charcoal", color: "#2b2b2b" },
  { name: "Allied Olive", color: "#556b2f" },
  { name: "Axis Steel", color: "#3d4a5c" },
  { name: "Rebel Orange", color: "#c65a11" },
  { name: "Neutral Slate", color: "#334155" },
];

export const FLAG_PRESETS: { name: string; spec: FlagSpec; group: string }[] = [
  // ISO flags
  ...[
    ["China", "CN"],
    ["Taiwan", "TW"],
    ["Japan", "JP"],
    ["South Korea", "KR"],
    ["North Korea", "KP"],
    ["India", "IN"],
    ["Pakistan", "PK"],
    ["Mongolia", "MN"],
    ["Australia", "AU"],
    ["New Zealand", "NZ"],
    ["Vietnam", "VN"],
    ["Thailand", "TH"],
    ["Cambodia", "KH"],
    ["Laos", "LA"],
    ["Myanmar", "MM"],
    ["Malaysia", "MY"],
    ["Singapore", "SG"],
    ["Indonesia", "ID"],
    ["Philippines", "PH"],
    ["Brunei", "BN"],
    ["Timor-Leste", "TL"],
    ["Papua New Guinea", "PG"],
    ["Nepal", "NP"],
    ["Bhutan", "BT"],
    ["Bangladesh", "BD"],
    ["Sri Lanka", "LK"],
    ["Afghanistan", "AF"],
    ["Iran", "IR"],
    ["Kazakhstan", "KZ"],
    ["Russia", "RU"],
    ["United States", "US"],
    ["United Kingdom", "GB"],
    ["France", "FR"],
    ["Germany", "DE"],
    ["Italy", "IT"],
    ["Spain", "ES"],
    ["Poland", "PL"],
    ["Ukraine", "UA"],
    ["Turkey", "TR"],
    ["Egypt", "EG"],
    ["Brazil", "BR"],
    ["Canada", "CA"],
    ["Mexico", "MX"],
    ["South Africa", "ZA"],
    ["Nigeria", "NG"],
    ["Saudi Arabia", "SA"],
    ["Israel", "IL"],
    ["Greece", "GR"],
    ["Sweden", "SE"],
    ["Finland", "FI"],
  ].map(([name, code]) => ({ name, group: "Countries", spec: { kind: "iso", code } as FlagSpec })),
  // historical / fictional
  {
    name: "Russian Empire",
    group: "Historical",
    spec: { kind: "custom", layout: "horizontal", colors: ["#ffffff", "#0039a6", "#d52b1e"], emblem: { shape: "diamond", color: "#f2c230", size: 0.22, x: 0.2, y: 0.5 } },
  },
  {
    name: "RSFSR / Soviet",
    group: "Historical",
    spec: { kind: "custom", layout: "solid", colors: ["#cc0000"], emblem: { shape: "hammer", color: "#ffd700", size: 0.26, x: 0.25, y: 0.35 } },
  },
  {
    name: "Austria-Hungary",
    group: "Historical",
    spec: { kind: "custom", layout: "horizontal", colors: ["#000000", "#ffd700"], emblem: { shape: "cross", color: "#ffffff", size: 0.18, x: 0.5, y: 0.5 } },
  },
  {
    name: "German Empire",
    group: "Historical",
    spec: { kind: "custom", layout: "horizontal", colors: ["#000000", "#ffffff", "#dd0000"] },
  },
  {
    name: "Ottoman Empire",
    group: "Historical",
    spec: { kind: "custom", layout: "solid", colors: ["#c8102e"], emblem: { shape: "crescent", color: "#ffffff", size: 0.3, x: 0.42, y: 0.5 } },
  },
  {
    name: "Qing Dynasty",
    group: "Historical",
    spec: { kind: "custom", layout: "solid", colors: ["#f2c230"], emblem: { shape: "sun", color: "#c8102e", size: 0.22, x: 0.62, y: 0.4 } },
  },
  {
    name: "Empire of Japan",
    group: "Historical",
    spec: { kind: "custom", layout: "solid", colors: ["#ffffff"], emblem: { shape: "sun", color: "#bc002d", size: 0.3, x: 0.5, y: 0.5 } },
  },
  {
    name: "Ukrainian People's Republic",
    group: "Historical",
    spec: { kind: "custom", layout: "horizontal", colors: ["#0057b7", "#ffd700"], emblem: { shape: "trident", color: "#ffffff", size: 0.22 } },
  },
  {
    name: "People's Heavenly Republic",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "solid", colors: ["#0a0a0a"], border: "#c8102e", emblem: { shape: "octastar", color: "#e01e2b", size: 0.3 } },
  },
  {
    name: "Purification Zone",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "solid", colors: ["#000000"], emblem: { shape: "octastar", color: "#c8102e", size: 0.28 } },
  },
  {
    name: "PLA Administration",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "horizontal", colors: ["#de2910", "#de2910", "#de2910", "#2e7d32"], emblem: { shape: "star", color: "#ffde00", size: 0.22, x: 0.22, y: 0.36 } },
  },
  {
    name: "EADI (East Asian Defense Initiative)",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "solid", colors: ["#7a0c0c"], emblem: { shape: "star", color: "#ffb000", size: 0.36 } },
  },
  {
    name: "PDTO (Pacific Defense Treaty Org.)",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "solid", colors: ["#0b3d91"], emblem: { shape: "sun", color: "#8fc1ff", size: 0.26 } },
  },
  {
    name: "Indian Warlord Junta",
    group: "Great Asian War",
    spec: { kind: "custom", layout: "vertical", colors: ["#ff9933", "#ffffff", "#138808"], emblem: { shape: "star", color: "#000080", size: 0.2 } },
  },
];

export function findFlagPreset(name: string): FlagSpec {
  return FLAG_PRESETS.find((f) => f.name === name)!.spec;
}

export function defaultLayers(): LayerVisibility {
  return {
    graticule: false,
    land: true,
    coastlines: true,
    lakes: true,
    rivers: true,
    railroads: true,
    provinces: true,
    countries: true,
    nationOutlines: true,
    cities: true,
    cityLabels: true,
    seaLabels: true,
    nationLabels: true,
    countryLabels: true,
    vignette: true,
  };
}

export function defaultMapSettings(): MapSettings {
  return {
    projection: "mercator",
    lod: "medium",
    borderYear: "present",
    theme: "neon-noir",
    layers: defaultLayers(),
    width: 1920,
    height: 1080,
    defaultCamera: { lon: 20, lat: 30, scale: 300 },
    precision: 0.7,
    labelScale: 1,
    cityDensity: 1,
    seaLabelDensity: 1,
    showGlow: true,
  };
}

export function emptyProject(name = "Untitled warfront"): ProjectDoc {
  return {
    version: 1,
    name,
    description: "",
    duration: 60,
    map: defaultMapSettings(),
    nations: [],
    events: [{ id: "year_0", type: "year", start: 0, end: 1, text: "1914" }],
  };
}

export const RESOLUTION_PRESETS = [
  { label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { label: "720p (1280×720)", width: 1280, height: 720 },
  { label: "1440p (2560×1440)", width: 2560, height: 1440 },
  { label: "4K (3840×2160)", width: 3840, height: 2160 },
  { label: "Square (1080×1080)", width: 1080, height: 1080 },
  { label: "Vertical (1080×1920)", width: 1080, height: 1920 },
];
