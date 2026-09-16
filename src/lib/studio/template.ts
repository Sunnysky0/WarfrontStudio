import type { Camera, FlagSpec, FrontTheater, Nation, ProjectDoc, StudioEvent, MarkerKind, FrontMode } from "./types";
import { defaultMapSettings, findFlagPreset } from "./presets";

const iso = (code: string): FlagSpec => ({ kind: "iso", code });

const PDTO_BLUE = "#22397f";
const OCHRE = "#6b5313";
const ALLY_OCHRE = "#7a5c1c";
const BLACK = "#07050a";
const RUST = "#7a2a12";
const MAROON = "#4a0d1e";

const ASIA: Camera = { lon: 98, lat: 21, scale: 1000 };
const TAIWAN: Camera = { lon: 121.4, lat: 23.6, scale: 5200 };

function nation(id: string, name: string, color: string, flag: FlagSpec | undefined, regions: string[] = [], extra: Partial<Nation> = {}): Nation {
  return { id, name, color, flag, regions, ...extra };
}

let counter = 0;
const nid = (p: string) => `${p}_${(++counter).toString(36)}`;

function year(start: number, text: string): StudioEvent {
  return { id: nid("year"), type: "year", start, end: start + 1, text };
}
function cam(start: number, end: number, camera: Camera, label?: string): StudioEvent {
  return { id: nid("cam"), type: "camera", start, end, camera, easing: "easeInOut", label };
}
function sub(start: number, end: number, text: string): StudioEvent {
  return { id: nid("sub"), type: "subtitle", start, end, text };
}
function terr(
  start: number,
  end: number,
  regions: string[],
  toNation: string,
  o: { mode?: FrontMode; from?: string; origin?: [number, number]; direction?: number; roughness?: number; label?: string } = {}
): StudioEvent {
  return {
    id: nid("terr"),
    type: "territory",
    start,
    end,
    regions,
    toNation,
    fromNation: o.from,
    mode: o.mode ?? "auto",
    origin: o.origin,
    direction: o.direction,
    roughness: o.roughness ?? 0.6,
    easing: "easeInOut",
    showFrontline: true,
    label: o.label,
  };
}
function front(
  start: number,
  end: number,
  nation: string,
  keyframes: { offset: number; points: [number, number][] }[],
  o: {
    against?: string;
    capturedSide: [number, number];
    closed?: boolean;
    theater?: FrontTheater;
    clipRegions?: string[];
    holdAfterEnd?: boolean;
    roughness?: number;
    label?: string;
  }
): StudioEvent {
  return {
    id: nid("front"),
    type: "front",
    start,
    end,
    nation,
    against: o.against,
    keyframes,
    capturedSide: o.capturedSide,
    closed: o.closed,
    theater: o.theater ?? (o.against ? "sides" : "land"),
    clipRegions: o.clipRegions,
    fillOccupation: true,
    showFrontline: true,
    holdAfterEnd: o.holdAfterEnd ?? false,
    roughness: o.roughness ?? 0.4,
    easing: "easeInOut",
    label: o.label,
  };
}
function marker(start: number, end: number, kind: MarkerKind, pos: [number, number], o: { extra?: [number, number][]; size?: number; color?: string } = {}): StudioEvent {
  return { id: nid("mk"), type: "marker", start, end, kind, pos, extra: o.extra, size: o.size, color: o.color, pulse: true };
}
function change(start: number, end: number, nationId: string, o: { name?: string; color?: string; flag?: FlagSpec; label?: string }): StudioEvent {
  return { id: nid("chg"), type: "nationChange", start, end, nation: nationId, name: o.name, color: o.color, flag: o.flag, label: o.label };
}

const IND_NORTH = [
  "Jammu and Kashmir",
  "Ladakh",
  "Himachal Pradesh",
  "Punjab",
  "Chandigarh",
  "Haryana",
  "Delhi",
  "Uttarakhand",
  "Uttar Pradesh",
  "Rajasthan",
  "Bihar",
  "Sikkim",
  "West Bengal",
  "Arunachal Pradesh",
  "Assam",
  "Meghalaya",
  "Nagaland",
  "Manipur",
  "Mizoram",
  "Tripura",
  "Jharkhand",
  "Madhya Pradesh",
  "Gujarat",
  "Chhattisgarh",
  "Odisha",
].map((n) => `pn:IND:${n}`);
const IND_WEST = ["Maharashtra", "Goa", "Dadra and Nagar Haveli and Daman and Diu"].map((n) => `pn:IND:${n}`);
const IND_SOUTH = ["Karnataka", "Kerala", "Tamil Nadu", "Puducherry"].map((n) => `pn:IND:${n}`);
const IND_EAST = ["Andhra Pradesh", "Telangana", "Andaman and Nicobar Islands"].map((n) => `pn:IND:${n}`);

const JPN_EAST = [
  "Hokkaidō",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
  "Ibaraki",
  "Tochigi",
  "Gunma",
  "Saitama",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Nagano",
  "Yamanashi",
  "Shizuoka",
].map((n) => `pn:JPN:${n}`);
const JPN_WEST = [
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Gifu",
  "Aichi",
  "Mie",
  "Shiga",
  "Kyōto",
  "Ōsaka",
  "Hyōgo",
  "Nara",
  "Wakayama",
  "Tottori",
  "Shimane",
  "Okayama",
  "Hiroshima",
  "Yamaguchi",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kōchi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Kumamoto",
  "Ōita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
].map((n) => `pn:JPN:${n}`);

const TWN_BEACH: [number, number][] = [
  [120.72, 21.92],
  [120.95, 22.05],
  [121.02, 22.22],
  [120.78, 22.32],
  [120.52, 22.18],
  [120.58, 21.98],
  [120.72, 21.92],
];
const TWN_INLAND: [number, number][] = [
  [120.68, 21.88],
  [121.12, 22.12],
  [121.15, 22.48],
  [120.72, 22.62],
  [120.38, 22.35],
  [120.42, 22.05],
  [120.68, 21.88],
];
const PAK_F0: [number, number][] = [
  [71.4, 36.7],
  [73.8, 36.85],
  [75.8, 36.15],
  [77.6, 35.35],
];
const PAK_F1: [number, number][] = [
  [67.0, 30.4],
  [70.4, 31.7],
  [73.0, 32.15],
  [75.1, 31.9],
];
const PAK_F2: [number, number][] = [
  [66.7, 25.4],
  [68.6, 26.7],
  [70.3, 27.4],
  [72.2, 28.1],
];
const HIM_F0: [number, number][] = [
  [74.8, 36.6],
  [77.2, 35.2],
  [79.0, 32.4],
  [81.8, 30.3],
  [85.0, 28.6],
  [88.2, 27.7],
  [92.0, 27.6],
  [95.4, 28.4],
];
const HIM_F1: [number, number][] = [
  [74.2, 34.0],
  [76.8, 32.2],
  [79.5, 29.8],
  [82.5, 27.8],
  [85.5, 26.8],
  [88.0, 26.2],
  [91.2, 26.3],
  [95.0, 27.2],
];
const HIM_F2: [number, number][] = [
  [73.5, 28.5],
  [76.0, 27.2],
  [79.0, 26.5],
  [82.2, 25.8],
  [85.0, 25.2],
  [87.8, 24.8],
  [91.0, 25.2],
  [94.5, 26.0],
];
const VNM_F0: [number, number][] = [
  [102.15, 22.9],
  [104.4, 22.7],
  [106.2, 22.5],
  [107.9, 21.4],
];
const VNM_F1: [number, number][] = [
  [103.8, 16.8],
  [106.0, 16.2],
  [108.2, 15.4],
  [109.3, 13.6],
];
const VNM_F2: [number, number][] = [
  [104.4, 10.9],
  [106.3, 10.6],
  [108.2, 11.4],
  [109.2, 12.2],
];
const JPN_F0: [number, number][] = [
  [129.4, 31.15],
  [130.15, 32.7],
  [131.4, 33.45],
  [132.35, 34.15],
];
const JPN_F1: [number, number][] = [
  [131.1, 33.15],
  [132.9, 34.35],
  [135.05, 34.75],
  [136.85, 35.15],
];
const JPN_F2: [number, number][] = [
  [136.4, 34.7],
  [138.15, 34.95],
  [139.75, 35.55],
  [140.9, 36.7],
];
const ANNAM_F0: [number, number][] = [
  [104.2, 16.4],
  [106.5, 15.6],
  [108.6, 14.8],
];
const ANNAM_F1: [number, number][] = [
  [102.8, 12.6],
  [104.9, 11.8],
  [106.7, 11.2],
  [104.6, 10.4],
];
const MALAY_F0: [number, number][] = [
  [99.4, 15.3],
  [101.6, 13.8],
  [103.4, 13.0],
  [104.8, 12.5],
];
const MALAY_F1: [number, number][] = [
  [100.1, 6.6],
  [101.8, 5.9],
  [103.5, 4.2],
  [104.0, 1.35],
];
const JAVA_P0: [number, number][] = [
  [105.2, -5.2],
  [107.4, -5.4],
  [110.2, -6.2],
  [112.8, -6.9],
  [114.4, -7.6],
  [113.2, -8.6],
  [109.5, -8.2],
  [106.4, -7.4],
  [105.2, -5.2],
];
const JAVA_P1: [number, number][] = [
  [104.6, -5.0],
  [108.0, -5.5],
  [111.6, -6.4],
  [114.8, -7.4],
  [115.2, -8.6],
  [112.4, -9.0],
  [108.2, -8.5],
  [105.5, -7.2],
  [104.6, -5.0],
];
const PNG_F0: [number, number][] = [
  [140.2, -2.2],
  [143.5, -3.1],
  [146.8, -4.0],
  [150.4, -5.4],
];
const PNG_F1: [number, number][] = [
  [140.8, -6.2],
  [144.2, -6.8],
  [147.5, -7.4],
  [150.8, -8.6],
];
const PHL_F0: [number, number][] = [
  [120.2, 18.8],
  [121.6, 18.5],
  [122.4, 17.6],
];
const PHL_F1: [number, number][] = [
  [120.4, 14.2],
  [121.5, 13.4],
  [123.6, 12.2],
  [125.2, 11.0],
];
const AUS_F0: [number, number][] = [
  [114.8, -21.5],
  [121.5, -17.8],
  [129.8, -12.4],
  [136.4, -13.6],
  [141.2, -16.8],
];
const AUS_F1: [number, number][] = [
  [115.4, -28.4],
  [122.8, -25.6],
  [131.2, -22.5],
  [138.4, -23.8],
  [145.2, -26.4],
];
const AUS_F2: [number, number][] = [
  [116.2, -33.8],
  [124.5, -31.2],
  [134.0, -30.4],
  [142.6, -32.2],
  [150.4, -33.6],
];
const DEC_F0: [number, number][] = [
  [72.8, 22.4],
  [76.5, 22.8],
  [80.4, 22.2],
  [84.2, 21.6],
];
const DEC_F1: [number, number][] = [
  [73.4, 15.6],
  [76.8, 14.2],
  [79.6, 13.4],
  [80.4, 12.0],
];

export function greatAsianWarTemplate(): ProjectDoc {
  counter = 0;
  const heavenly = findFlagPreset("People's Heavenly Republic");
  const purification = findFlagPreset("Purification Zone");
  const pla = findFlagPreset("PLA Administration");
  const eadi = findFlagPreset("EADI (East Asian Defense Initiative)");
  const pdto = findFlagPreset("PDTO (Pacific Defense Treaty Org.)");
  const junta = findFlagPreset("Indian Warlord Junta");

  const nations: Nation[] = [
    nation("prc", "People's Republic of China", MAROON, iso("CN"), ["c:CHN", "c:HKG", "c:MAC"], {
      note: "Transitions into the People's Heavenly Republic in 2023.",
    }),
    nation("roc", "Republic of China", "#1c2c6e", iso("TW"), ["c:TWN"]),
    nation("ind", "India", "#6e4a2a", iso("IN"), [], { note: "Colored when the nuclear war begins; joins the PDTO in 2031." }),
    nation("pak", "Pakistan", "#1e5a2e", iso("PK"), [], { note: "Becomes a Chinese client, later Purification Zone 'Hindu'." }),
    nation("mng", "Mongolia", "#4a3a1e", iso("MN"), ["c:MNG"]),
    nation("jpn", "Japan", PDTO_BLUE, iso("JP")),
    nation("kor", "Korea", ALLY_OCHRE, iso("KR")),
    nation("aus", "Australia", PDTO_BLUE, iso("AU")),
    nation("tha", "Thailand", PDTO_BLUE, iso("TH")),
    nation("khm", "Cambodia", PDTO_BLUE, iso("KH")),
    nation("vnm", "Vietnam", PDTO_BLUE, iso("VN")),
    nation("mys", "Malaysia", PDTO_BLUE, iso("MY")),
    nation("sgp", "Singapore", PDTO_BLUE, iso("SG"), [], { labelHidden: true }),
    nation("idn", "Indonesia", PDTO_BLUE, iso("ID")),
    nation("phl", "Philippines", PDTO_BLUE, iso("PH")),
    nation("png", "Papua New Guinea", PDTO_BLUE, iso("PG")),
    nation("lka", "Sri Lanka", PDTO_BLUE, iso("LK")),
    nation("mmr", "Myanmar", ALLY_OCHRE, iso("MM")),
    nation("lao", "Laos", ALLY_OCHRE, iso("LA")),
    nation("npl", "Nepal", ALLY_OCHRE, iso("NP")),
    nation("btn", "Bhutan", ALLY_OCHRE, iso("BT")),
    nation("bgd", "Bangladesh", ALLY_OCHRE, iso("BD")),
    nation("ind_west", "Deccan Compact", "#5a4636", junta),
    nation("ind_south", "Dravida Front", "#4d3b2f", junta),
    nation("ind_east", "Coromandel Junta", "#6a5240", junta),
    nation("tokyo_e", "Purification Zone Tokyo East", RUST, pla),
    nation("tokyo_w", "Purification Zone Tokyo West", RUST, pla),
    nation("annam_pla", "Annamite PLA Administration", RUST, pla),
    nation("sea_pla", "South East Asia PLA Administration", RUST, pla),
    nation("idn_pla", "Indonesian PLA Administration", RUST, pla),
    nation("phl_pla", "Philippine PLA Administration", RUST, pla),
    nation("pz_jambudvipa", "Purification Zone 'Jambudvipa'", BLACK, purification),
  ];

  const events: StudioEvent[] = [
    // ---------------------------------------------------------------- 2022: Fourth Taiwan Strait Crisis (00:00 – 00:07)
    year(0, "2022"),
    { id: nid("flags"), type: "flags", start: 0, end: 8, left: ["prc"], right: ["roc", "kor", "jpn", "aus"] },
    sub(0.3, 3.8, "Xi Jinping orders the invasion of Taiwan. The Fourth Taiwan Strait Crisis begins."),
    marker(1.2, 5, "ship", [120.75, 21.55], { size: 15, color: "#ff5a5a" }),
    front(1.5, 4.6, "prc", [
      { offset: 0, points: TWN_BEACH },
      { offset: 3.1, points: TWN_INLAND },
    ], { against: "roc", capturedSide: [120.75, 22.15], closed: true, theater: "sides", holdAfterEnd: false, roughness: 0.45, label: "PLA landing on the southern coast" }),
    marker(2.2, 4.6, "battle", [120.6, 22.35], { size: 13, color: "#ffffff" }),
    marker(2.8, 4.4, "explosion", [120.32, 22.62], { size: 12, color: "#ff8a3d" }),
    sub(3.8, 6.2, "Unrest erupts across mainland China. The PLA aborts the landing and withdraws."),
    marker(4, 6.5, "revolt", [113.3, 23.1], { size: 12, color: "#ffb300", extra: [[121.47, 31.23], [104.07, 30.67]] }),
    front(4.8, 6.6, "prc", [
      { offset: 0, points: TWN_INLAND },
      { offset: 1.8, points: TWN_BEACH },
    ], { against: "roc", capturedSide: [120.75, 22.15], closed: true, theater: "sides", holdAfterEnd: false, roughness: 0.35, label: "Withdrawal" }),
    sub(6.2, 8, "The Manila Peace Accord ends the crisis."),

    // ---------------------------------------------------------------- 2022: Nationalist coup (00:08 – 00:13)
    cam(8, 13, ASIA, "Pull out to Asia"),
    { id: nid("flags"), type: "flags", start: 8, end: 14, left: ["prc"], right: [] },
    sub(8.4, 11, "Nationalist Government takes charge."),
    marker(8.6, 13, "revolt", [116.4, 39.9], { size: 16, color: "#ffb300" }),
    sub(11, 14, "Hardliner Chen Quanguo is elected leader by the party delegates."),

    // ---------------------------------------------------------------- 2023: Pakistan (00:14 – 00:25)
    year(14, "2023"),
    { id: nid("flags"), type: "flags", start: 14, end: 26, left: ["pak", "prc"], right: ["ind"] },
    terr(14, 14.2, ["c:IND", "c:KAS"], "ind", { mode: "instant", label: "India enters the war" }),
    terr(14, 14.2, ["c:PAK"], "pak", { mode: "instant", label: "Pakistan enters the war" }),
    sub(14.3, 19, "Nuclear exchange between India and Pakistan."),
    marker(14.5, 24, "nuke", [74.35, 31.55], { size: 15, color: "#ff2d55", extra: [[73.05, 33.6], [71.5, 34.0], [67.0, 24.9]] }),
    marker(15.5, 24, "nuke", [77.2, 28.6], { size: 15, color: "#ff2d55", extra: [[75.8, 26.9], [72.6, 23.0]] }),
    sub(19, 25.5, "Pakistan collapses. Chinese intervention begins."),
    front(19, 25, "pak", [
      { offset: 0, points: PAK_F0 },
      { offset: 2.8, points: PAK_F1 },
      { offset: 6, points: PAK_F2 },
    ], { against: "pak", capturedSide: [76.2, 35.9], theater: "sides", holdAfterEnd: false, roughness: 0.55, label: "Chinese pacification of Pakistan" }),
    marker(19.5, 25, "tank", [74.2, 34.2], { size: 12, color: "#c8ff9a" }),
    change(19, 25, "pak", { name: "Pakistan (Chinese client)", color: "#1f6b34", label: "Client state" }),

    // ---------------------------------------------------------------- 2023: Mongolia & Imperial transformation (00:26 – 00:33)
    { id: nid("flags"), type: "flags", start: 26, end: 31, left: ["prc"], right: ["mng"] },
    sub(26, 30.5, "China annexes Mongolia. The Imperial Administrative System is reinstated."),
    terr(26.5, 30, ["c:MNG"], "prc", { mode: "auto", from: "prc", roughness: 0.75, label: "Annexation of Mongolia" }),
    { id: nid("flags"), type: "flags", start: 31, end: 40, left: ["prc"], right: [], leftFaction: eadi },
    sub(30.8, 34, "The state is refounded as the People's Heavenly Republic — Neo-Confucian, militarist, fascist."),
    change(31, 33, "prc", { name: "People's Heavenly Republic", color: OCHRE, flag: heavenly, label: "Imperial transformation" }),
    change(31, 33, "mng", { color: OCHRE }),

    // ---------------------------------------------------------------- 2023–2031: Road to war (00:34 – 00:39)
    year(34, "2024"),
    change(34, 37, "pak", { name: "Purification Zone 'Hindu'", color: BLACK, flag: purification, label: "Pakistan becomes a Purification Zone" }),
    sub(34, 37, "Pakistan is reorganized as Purification Zone 'Hindu'."),
    year(36, "2027"),
    sub(37, 39.4, "Eight years of military buildup against the PDTO. Operation Xuanyuan is finalized."),
    year(38, "2030"),
    year(39, "2031"),
    { id: nid("text"), type: "text", start: 39.2, end: 43, text: "OPERATION XUANYUAN", pos: [104, 32], size: 26, color: "#ffd27a" },
    sub(39.4, 41.5, "2031: Operation Xuanyuan is launched."),

    // ---------------------------------------------------------------- 2031: Outbreak (00:40 – 00:55)
    {
      id: nid("flags"),
      type: "flags",
      start: 40,
      end: 106,
      left: ["prc", "kor", "mmr", "npl", "btn", "bgd", "lao"],
      right: ["jpn", "ind", "aus", "tha", "khm", "vnm", "mys", "idn", "phl", "png", "lka", "roc"],
      leftFaction: eadi,
      rightFaction: pdto,
      leftLabel: "EADI",
      rightLabel: "PDTO",
    },
    terr(40, 42, ["c:JPN"], "jpn", { mode: "fade", label: "PDTO mobilizes" }),
    terr(40, 42, ["c:AUS"], "aus", { mode: "fade" }),
    terr(40, 42, ["c:THA"], "tha", { mode: "fade" }),
    terr(40, 42, ["c:KHM"], "khm", { mode: "fade" }),
    terr(40, 42, ["c:VNM"], "vnm", { mode: "fade" }),
    terr(40, 42, ["c:MYS", "c:BRN"], "mys", { mode: "fade" }),
    terr(40, 42, ["c:SGP"], "sgp", { mode: "fade" }),
    terr(40, 42, ["c:IDN", "c:TLS"], "idn", { mode: "fade" }),
    terr(40, 42, ["c:PHL"], "phl", { mode: "fade" }),
    terr(40, 42, ["c:PNG"], "png", { mode: "fade" }),
    terr(40, 42, ["c:LKA"], "lka", { mode: "fade" }),
    change(40, 42, "ind", { color: PDTO_BLUE, flag: iso("IN") }),
    change(40, 42, "roc", { color: PDTO_BLUE }),
    terr(40, 42, ["c:KOR", "c:PRK"], "kor", { mode: "fade", label: "EADI mobilizes" }),
    terr(40, 42, ["c:MMR"], "mmr", { mode: "fade" }),
    terr(40, 42, ["c:LAO"], "lao", { mode: "fade" }),
    terr(40, 42, ["c:NPL"], "npl", { mode: "fade" }),
    terr(40, 42, ["c:BTN"], "btn", { mode: "fade" }),
    terr(40, 42, ["c:BGD"], "bgd", { mode: "fade" }),
    sub(41.5, 45.5, "The Chemical Weapons Convention is abandoned. Chemical, ballistic and nuclear strikes begin."),
    marker(42, 50, "gas", [91.7, 26.1], { size: 14, color: "#9dff5a", extra: [[80.9, 26.8]] }),
    marker(42.5, 52, "missile", [100.5, 13.75], { size: 13, color: "#ff8a3d", extra: [[139.7, 35.7], [72.9, 19.1]] }),
    front(43.5, 52, "prc", [
      { offset: 0, points: HIM_F0 },
      { offset: 4, points: HIM_F1 },
      { offset: 8.5, points: HIM_F2 },
    ], { against: "ind", capturedSide: [88.5, 29.4], theater: "sides", holdAfterEnd: false, roughness: 0.55, label: "Strike across the Himalayas" }),
    terr(52, 52, IND_NORTH, "prc", { mode: "instant", label: "Northern India occupied" }),
    front(44.5, 52, "prc", [
      { offset: 0, points: VNM_F0 },
      { offset: 3.5, points: VNM_F1 },
      { offset: 7.5, points: VNM_F2 },
    ], { against: "vnm", capturedSide: [105.2, 23.4], theater: "sides", holdAfterEnd: false, roughness: 0.5, label: "Invasion of Vietnam" }),
    terr(52, 52, ["c:VNM"], "prc", { mode: "instant" }),
    sub(45.5, 50, "Chinese forces strike across the Himalayas, through Southeast Asia and against Japan."),
    marker(46, 56, "nuke", [139.7, 35.68], { size: 17, color: "#ff2d55" }),
    marker(47, 68, "fire", [135.5, 34.7], { size: 13, color: "#ff6a00", extra: [[136.9, 35.2], [140.9, 38.3], [130.4, 33.6], [141.35, 43.06], [132.45, 34.4]] }),
    sub(50, 53, "The Imperial House is incinerated."),
    {
      id: nid("dis"),
      type: "disintegrate",
      start: 52.5,
      end: 56,
      from: "ind",
      mode: "shatter",
      dissolveRemainder: true,
      parts: [
        { nation: "ind_west", regions: IND_WEST },
        { nation: "ind_south", regions: IND_SOUTH },
        { nation: "ind_east", regions: IND_EAST },
      ],
      label: "India disintegrates",
    },
    sub(53, 56, "Devastated by the assault, India disintegrates into warring regional factions."),

    // ---------------------------------------------------------------- 2032: Southeast Asia & Japan (00:56 – 01:29)
    year(56, "2032"),
    sub(56, 60, "2032: Chinese forces land in Kyushu. Japan burns."),
    front(56, 63, "prc", [
      { offset: 0, points: JPN_F0 },
      { offset: 3.2, points: JPN_F1 },
      { offset: 7, points: JPN_F2 },
    ], { against: "jpn", capturedSide: [130.0, 32.4], theater: "sides", holdAfterEnd: false, roughness: 0.5, label: "Invasion of Japan" }),
    marker(56, 63, "ship", [129.9, 32.9], { size: 13, color: "#ff5a5a" }),
    {
      id: nid("dis"),
      type: "disintegrate",
      start: 63,
      end: 66,
      from: "prc",
      mode: "shatter",
      parts: [
        { nation: "tokyo_e", regions: JPN_EAST },
        { nation: "tokyo_w", regions: JPN_WEST },
      ],
      label: "Japan carved into military districts",
    },
    sub(62.5, 66, "Japan is carved into military districts: Purification Zone Tokyo East / West."),
    front(64, 70, "annam_pla", [
      { offset: 0, points: ANNAM_F0 },
      { offset: 6, points: ANNAM_F1 },
    ], { against: "prc", capturedSide: [105.5, 17.2], theater: "regions", clipRegions: ["c:VNM", "c:KHM"], holdAfterEnd: false, roughness: 0.45, label: "Annamite PLA Administration" }),
    terr(70, 70, ["c:VNM", "c:KHM"], "annam_pla", { mode: "instant" }),
    sub(66, 72, "Chinese forces sweep down the Indochinese Peninsula."),
    marker(68, 76, "tank", [100.5, 13.75], { size: 12, color: "#ffd27a" }),
    front(70, 78, "sea_pla", [
      { offset: 0, points: MALAY_F0 },
      { offset: 8, points: MALAY_F1 },
    ], { capturedSide: [100.2, 16.2], theater: "regions", clipRegions: ["c:THA", "c:MYS", "c:SGP", "c:BRN"], holdAfterEnd: false, roughness: 0.45, label: "South East Asia PLA Administration" }),
    terr(78, 78, ["c:THA", "c:MYS", "c:SGP", "c:BRN"], "sea_pla", { mode: "instant" }),
    sub(72, 80, "The Malay Peninsula falls. Singapore surrenders."),
    front(78, 88, "idn_pla", [
      { offset: 0, points: JAVA_P0 },
      { offset: 10, points: JAVA_P1 },
    ], { capturedSide: [110.0, -7.2], closed: true, theater: "regions", clipRegions: ["c:IDN", "c:TLS"], holdAfterEnd: false, roughness: 0.4, label: "Java pocket" }),
    front(78, 88, "idn_pla", [
      { offset: 0, points: PNG_F0 },
      { offset: 10, points: PNG_F1 },
    ], { capturedSide: [145.0, -2.0], theater: "regions", clipRegions: ["c:PNG"], holdAfterEnd: false, roughness: 0.45, label: "New Guinea landing" }),
    terr(88, 88, ["c:IDN", "c:TLS", "c:PNG"], "idn_pla", { mode: "instant" }),
    marker(78, 86, "ship", [106.5, -5.5], { size: 13, color: "#ff5a5a", extra: [[112.7, -7.0]] }),
    front(81, 88, "phl_pla", [
      { offset: 0, points: PHL_F0 },
      { offset: 7, points: PHL_F1 },
    ], { against: "phl", capturedSide: [121.0, 19.2], theater: "sides", holdAfterEnd: false, roughness: 0.45, label: "Philippine PLA Administration" }),
    terr(88, 88, ["c:PHL"], "phl_pla", { mode: "instant" }),
    marker(81, 87, "plane", [121.0, 14.6], { size: 13, color: "#ffd27a" }),
    sub(80, 89, "Maritime Southeast Asia is overrun."),

    // ---------------------------------------------------------------- 2033: Australia (01:30 – 01:45)
    year(90, "2033"),
    { id: nid("inset"), type: "inset", start: 90, end: 106, camera: { lon: 134, lat: -26.5, scale: 640 }, corner: "bottom-right", width: 0.3, height: 0.36, title: "Australia" },
    sub(90, 95, "2033: Amphibious landings in northern and western Australia."),
    marker(90, 96, "ship", [130.8, -12.2], { size: 14, color: "#ff5a5a", extra: [[115.7, -31.8]] }),
    front(92, 102, "pz_jambudvipa", [
      { offset: 0, points: AUS_F0 },
      { offset: 5, points: AUS_F1 },
      { offset: 10, points: AUS_F2 },
    ], { against: "aus", capturedSide: [130.8, -12.0], theater: "sides", holdAfterEnd: false, roughness: 0.5, label: "Conquest of Australia" }),
    terr(102, 102, ["c:AUS"], "pz_jambudvipa", { mode: "instant" }),
    sub(95, 101.5, "The continent turns black: Purification Zone 'Jambudvipa'."),
    sub(101.5, 106, "EADI victory - China wins the Great Asian War."),

    // ---------------------------------------------------------------- 2033–2034: Consolidation (01:46 – 01:59)
    year(106, "2034"),
    { id: nid("flags"), type: "flags", start: 106, end: 120, left: ["prc", "tokyo_e", "annam_pla", "idn_pla", "phl_pla", "pak", "pz_jambudvipa"], right: [], leftFaction: eadi },
    sub(106, 111, "Totalitarian Purification Zones are established across the conquered continent."),
    terr(106, 108, ["c:THA", "c:MYS", "c:SGP", "c:BRN"], "annam_pla", { mode: "fade" }),
    terr(106, 108, JPN_WEST, "tokyo_e", { mode: "fade" }),
    change(107, 110, "annam_pla", { name: "Purification Zone Indochina", color: BLACK, flag: purification }),
    change(107, 110, "idn_pla", { name: "Purification Zone 'Yindunixiya'", color: BLACK, flag: purification }),
    change(107, 110, "phl_pla", { name: "Purification Zone 'Feilubin'", color: BLACK, flag: purification }),
    change(107, 110, "tokyo_e", { name: "Purification Zone Nihon", color: BLACK, flag: purification }),
    terr(109, 111, IND_NORTH, "pak", { mode: "fade", label: "Northern India merged into Zone 'Hindu'" }),
    sub(111, 117, "Exploiting India's division, Chen launches the final campaigns against the warlord states."),
    front(111, 117.5, "pak", [
      { offset: 0, points: DEC_F0 },
      { offset: 6.5, points: DEC_F1 },
    ], { capturedSide: [77.5, 23.5], theater: "regions", clipRegions: [...IND_WEST, ...IND_EAST, ...IND_SOUTH], holdAfterEnd: false, roughness: 0.5, label: "Final Indian campaigns" }),
    terr(117.5, 117.5, [...IND_WEST, ...IND_EAST, ...IND_SOUTH], "pak", { mode: "instant" }),
    marker(111.5, 117, "battle", [76.5, 19.5], { size: 13, color: "#ffffff", extra: [[78.5, 17.4], [77.6, 13.0]] }),
    sub(117, 120, "The subcontinent is absorbed into the black zone. The Great Asian War is over."),
  ];

  return {
    version: 1,
    name: "The Great Asian War (2022–2034)",
    description:
      "Alternate-history template inspired by HOI4: The Fire Rises. Demonstrates camera moves, drawn frontlines, territory commits, nation transitions, disintegration, purification zones, markers, flags, subtitles and an inset map.",
    duration: 120,
    map: { ...defaultMapSettings(), defaultCamera: TAIWAN, projection: "mercator", lod: "medium", borderYear: "present", theme: "neon-noir" },
    nations,
    events,
  };
}
