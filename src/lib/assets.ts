import type { IconId } from "./types";

/** Icons are 24x24 viewBox path data. stroke=true icons are drawn as outlines. */
export const ICONS: Record<IconId, { name: string; d: string; stroke: boolean }> = {
  battle: {
    name: "Battle (starburst)",
    d: "M12 1l2.2 6.3 6.3-2.1-4.1 5.2 5.6 3.6-6.6.6 1.2 6.5-4.6-4.8-4.6 4.8 1.2-6.5-6.6-.6 5.6-3.6-4.1-5.2 6.3 2.1z",
    stroke: false,
  },
  explosion: {
    name: "Explosion",
    d: "M12 2l1.5 5 4.5-3-2 5 6 1-5 3 3 5-5-2-1 6-2-5.5-4 4 1-6-6 .5 5-3.5-3-4.5 5 1.5z",
    stroke: false,
  },
  infantry: { name: "Infantry (NATO)", d: "M3 6h18v12H3z M3 6l18 12 M21 6L3 18", stroke: true },
  cavalry: { name: "Cavalry (NATO)", d: "M3 6h18v12H3z M3 18L21 6", stroke: true },
  artillery: { name: "Artillery (NATO)", d: "M3 6h18v12H3z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0", stroke: true },
  tank: { name: "Armour (NATO)", d: "M3 6h18v12H3z M8 9h8a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6z", stroke: true },
  navy: { name: "Navy (anchor)", d: "M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 7v14 M5 13a7 7 0 0 0 14 0 M3 12l2 1-1 2 M21 12l-2 1 1 2", stroke: true },
  air: { name: "Air (plane)", d: "M12 2l2 7 8 4v2l-8-2v4l3 2v2l-5-1-5 1v-2l3-2v-4l-8 2v-2l8-4z", stroke: false },
  flag: { name: "Flag", d: "M5 22V3 M5 3h11l-2 4 2 4H5", stroke: true },
  star: { name: "Capital (star)", d: "M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.5 5.8 21l1.4-7L2 9.3l7-.8z", stroke: false },
  skull: { name: "Skull", d: "M12 2a8 8 0 0 0-8 8c0 3 2 5 3 6v3h10v-3c1-1 3-3 3-6a8 8 0 0 0-8-8z M9 11a1.5 1.5 0 1 0 0 .1 M15 11a1.5 1.5 0 1 0 0 .1 M10 19v3 M14 19v3", stroke: true },
  siege: { name: "Siege (castle)", d: "M3 21V9l3-2v3h3V7l3-2 3 2v3h3V7l3 2v12z M10 21v-5h4v5", stroke: true },
  surrender: { name: "Surrender (white flag)", d: "M6 22V2 M6 4c3-2 6 2 9 0s3 0 3 0v9c-3 2-6-2-9 0s-3 0-3 0", stroke: true },
  crosshair: { name: "Target", d: "M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 2v5 M12 17v5 M2 12h5 M17 12h5", stroke: true },
  dot: { name: "Dot", d: "M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0", stroke: false },
};

export interface PaletteAsset {
  factions: { name: string; color: string; hatch?: boolean }[];
  ocean: string;
  land: string;
  border: string;
  province: string;
  river: string;
  coastline: string;
}

export const PALETTES: { key: string; name: string; description: string; data: PaletteAsset }[] = [
  {
    key: "palette-wwi-classic",
    name: "WWI Classic (blue vs olive)",
    description: "Entente blue, Central Powers olive, parchment neutrals – the look from the reference video.",
    data: {
      factions: [
        { name: "Entente", color: "#4d76ad" },
        { name: "Central Powers", color: "#5e603f" },
        { name: "Neutral", color: "#e9e0c8" },
      ],
      ocean: "#c9d9e9",
      land: "#e9e0c8",
      border: "#e58f7a",
      province: "#ffffff",
      river: "#a8c4dc",
      coastline: "#8fa7bf",
    },
  },
  {
    key: "palette-wwii",
    name: "WWII (Allies / Axis / Comintern)",
    description: "Blue Allies, olive Axis, red Soviets.",
    data: {
      factions: [
        { name: "Allies", color: "#3f6fb0" },
        { name: "Axis", color: "#6b6b3d" },
        { name: "Soviet Union", color: "#b23a3a" },
        { name: "Neutral", color: "#e6dfc9" },
      ],
      ocean: "#c4d6e6",
      land: "#e6dfc9",
      border: "#d98a7a",
      province: "#ffffff",
      river: "#a2c0da",
      coastline: "#8aa3bb",
    },
  },
  {
    key: "palette-cold-war",
    name: "Cold War (NATO / Warsaw Pact)",
    description: "Deep blue vs crimson with warm neutrals.",
    data: {
      factions: [
        { name: "NATO", color: "#2f5aa8" },
        { name: "Warsaw Pact", color: "#b0392e" },
        { name: "Non-aligned", color: "#d8cdb3" },
      ],
      ocean: "#bccfe3",
      land: "#d8cdb3",
      border: "#8c7a63",
      province: "#ffffff",
      river: "#9dbbd6",
      coastline: "#7f98b2",
    },
  },
  {
    key: "palette-napoleonic",
    name: "Napoleonic (France / Coalition)",
    description: "Imperial blue against coalition red on aged paper.",
    data: {
      factions: [
        { name: "French Empire & allies", color: "#2d5fa8" },
        { name: "Coalition", color: "#b83232" },
        { name: "Neutral", color: "#efe6cf" },
      ],
      ocean: "#d5dfe3",
      land: "#efe6cf",
      border: "#a07f5f",
      province: "#ffffff",
      river: "#a9c2d3",
      coastline: "#7b8f9c",
    },
  },
  {
    key: "palette-night",
    name: "Night Ops (dark)",
    description: "Dark ocean with luminous faction colours.",
    data: {
      factions: [
        { name: "Blue force", color: "#3b82f6" },
        { name: "Red force", color: "#ef4444" },
        { name: "Neutral", color: "#3f3f46" },
      ],
      ocean: "#0b1220",
      land: "#3f3f46",
      border: "#f59e0b",
      province: "#71717a",
      river: "#1e3a5f",
      coastline: "#94a3b8",
    },
  },
  {
    key: "palette-paper",
    name: "Monochrome Paper",
    description: "Ink on parchment – great for documentaries.",
    data: {
      factions: [
        { name: "Side A", color: "#5b4636" },
        { name: "Side B", color: "#a67c52" },
        { name: "Neutral", color: "#f1e9d6" },
      ],
      ocean: "#e4dccb",
      land: "#f1e9d6",
      border: "#7a6652",
      province: "#c7b9a0",
      river: "#bfae94",
      coastline: "#6d5c4a",
    },
  },
];

export const LINE_STYLES: { key: string; name: string; description: string; data: { color: string; width: number; dash: number[]; glow: boolean } }[] = [
  { key: "line-trench", name: "Trench front", description: "Thick red front with glow.", data: { color: "#d62828", width: 4, dash: [], glow: true } },
  { key: "line-armistice", name: "Armistice line", description: "White dashed ceasefire line.", data: { color: "#ffffff", width: 3, dash: [10, 6], glow: false } },
  { key: "line-blockade", name: "Naval blockade", description: "Blue dotted maritime line.", data: { color: "#1d4ed8", width: 3, dash: [2, 6], glow: false } },
  { key: "line-planned", name: "Planned advance", description: "Thin yellow dashed line.", data: { color: "#facc15", width: 2, dash: [6, 4], glow: false } },
];

export const ARROW_STYLES: { key: string; name: string; description: string; data: { color: string; width: number; head: boolean; dash: boolean; curve: number } }[] = [
  { key: "arrow-offensive", name: "Major offensive", description: "Thick curved arrow with head.", data: { color: "#d62828", width: 14, head: true, dash: false, curve: 0.25 } },
  { key: "arrow-raid", name: "Raid / probe", description: "Thin dashed arrow.", data: { color: "#f59e0b", width: 5, head: true, dash: true, curve: 0.1 } },
  { key: "arrow-naval", name: "Naval movement", description: "Blue sweeping arrow.", data: { color: "#1d4ed8", width: 8, head: true, dash: false, curve: -0.35 } },
  { key: "arrow-retreat", name: "Retreat", description: "Grey dashed withdrawal arrow.", data: { color: "#6b7280", width: 6, head: true, dash: true, curve: 0 } },
];

/** Prebuilt shape presets (lon/lat rings) users can drop on the map. */
export const SHAPE_PRESETS: { key: string; name: string; description: string; data: { closed: boolean; points: [number, number][] } }[] = [
  {
    key: "shape-western-front-1915",
    name: "Western Front 1915 (line)",
    description: "Stabilised trench line Nieuwpoort → Swiss border.",
    data: {
      closed: false,
      points: [
        [2.73, 51.13], [2.9, 50.85], [3.0, 50.65], [2.75, 50.45], [2.85, 50.25], [2.75, 49.95], [3.0, 49.6], [3.4, 49.4], [3.9, 49.35],
        [4.5, 49.25], [5.0, 49.35], [5.35, 49.25], [5.6, 48.95], [5.9, 48.9], [6.35, 48.85], [6.75, 48.65], [7.0, 48.3], [7.15, 47.9], [7.4, 47.6],
      ],
    },
  },
  {
    key: "shape-eastern-front-1916",
    name: "Eastern Front 1916 (line)",
    description: "Riga → Dvinsk → Pinsk → Tarnopol → Czernowitz.",
    data: {
      closed: false,
      points: [
        [24.1, 57.0], [24.9, 56.4], [26.5, 55.9], [27.0, 55.4], [26.6, 54.7], [26.1, 53.9], [26.0, 53.2], [26.2, 52.4], [25.8, 51.8], [25.2, 51.1], [25.6, 50.5],
        [25.4, 49.9], [25.6, 49.4], [25.9, 48.7], [26.0, 48.1],
      ],
    },
  },
  {
    key: "shape-bridgehead",
    name: "Bridgehead blob (zone)",
    description: "Small rounded occupation zone – drag vertices to fit.",
    data: {
      closed: true,
      points: [
        [0, 0.6], [0.5, 0.45], [0.8, 0.1], [0.7, -0.35], [0.3, -0.6], [-0.3, -0.6], [-0.7, -0.35], [-0.8, 0.1], [-0.5, 0.45],
      ],
    },
  },
];

export const BUILTIN_ASSETS = [
  ...Object.entries(ICONS).map(([id, icon]) => ({
    key: `icon-${id}`,
    category: "icon" as const,
    name: icon.name,
    description: icon.stroke ? "Outline icon" : "Solid icon",
    data: { icon: id, d: icon.d, stroke: icon.stroke },
  })),
  ...PALETTES.map((p) => ({ key: p.key, category: "palette" as const, name: p.name, description: p.description, data: p.data as unknown as Record<string, unknown> })),
  ...LINE_STYLES.map((p) => ({ key: p.key, category: "lineStyle" as const, name: p.name, description: p.description, data: p.data as unknown as Record<string, unknown> })),
  ...ARROW_STYLES.map((p) => ({ key: p.key, category: "arrowStyle" as const, name: p.name, description: p.description, data: p.data as unknown as Record<string, unknown> })),
  ...SHAPE_PRESETS.map((p) => ({ key: p.key, category: "shape" as const, name: p.name, description: p.description, data: p.data as unknown as Record<string, unknown> })),
];
