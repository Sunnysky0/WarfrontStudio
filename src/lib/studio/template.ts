import type { Camera, FlagSpec, Nation, ProjectDoc, StudioEvent, MarkerKind, FrontMode } from "./types";
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
    terr(1.5, 4.6, ["pn:TWN:Pingtung"], "prc", { mode: "radial", from: "prc", origin: [120.85, 21.7], roughness: 0.7, label: "PLA landing on the southern coast" }),
    marker(2.2, 4.6, "battle", [120.6, 22.35], { size: 13, color: "#ffffff" }),
    marker(2.8, 4.4, "explosion", [120.32, 22.62], { size: 12, color: "#ff8a3d" }),
    sub(3.8, 6.2, "Unrest erupts across mainland China. The PLA aborts the landing and withdraws."),
    marker(4, 6.5, "revolt", [113.3, 23.1], { size: 12, color: "#ffb300", extra: [[121.47, 31.23], [104.07, 30.67]] }),
    terr(4.8, 6.6, ["pn:TWN:Pingtung"], "roc", { mode: "radial", from: "roc", origin: [120.55, 22.75], roughness: 0.5, label: "Withdrawal" }),
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
    terr(19, 25, ["c:PAK"], "pak", { mode: "radial", from: "prc", origin: [76.2, 35.9], roughness: 0.7, label: "Chinese pacification of Pakistan" }),
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
    terr(43.5, 52, IND_NORTH, "prc", { mode: "radial", from: "prc", origin: [88.5, 27.8], roughness: 0.8, label: "Strike across the Himalayas" }),
    terr(44.5, 52, ["c:VNM"], "prc", { mode: "radial", from: "prc", origin: [106.2, 22.6], roughness: 0.7, label: "Invasion of Vietnam" }),
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
    terr(56, 63, ["c:JPN"], "prc", { mode: "radial", from: "prc", origin: [130.2, 33.2], roughness: 0.8, label: "Invasion of Japan" }),
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
    terr(64, 70, ["c:VNM", "c:KHM"], "annam_pla", { mode: "linear", from: "prc", direction: -85, roughness: 0.6, label: "Annamite PLA Administration" }),
    sub(66, 72, "Chinese forces sweep down the Indochinese Peninsula."),
    marker(68, 76, "tank", [100.5, 13.75], { size: 12, color: "#ffd27a" }),
    terr(70, 78, ["c:THA", "c:MYS", "c:SGP", "c:BRN"], "sea_pla", { mode: "linear", from: "prc", direction: -80, roughness: 0.6, label: "South East Asia PLA Administration" }),
    sub(72, 80, "The Malay Peninsula falls. Singapore surrenders."),
    terr(78, 88, ["c:IDN", "c:TLS", "c:PNG"], "idn_pla", { mode: "linear", from: "prc", direction: -25, roughness: 0.7, label: "Indonesian PLA Administration" }),
    marker(78, 86, "ship", [106.5, -5.5], { size: 13, color: "#ff5a5a", extra: [[112.7, -7.0]] }),
    terr(81, 88, ["c:PHL"], "phl_pla", { mode: "radial", from: "prc", origin: [120.9, 18.6], roughness: 0.7, label: "Philippine PLA Administration" }),
    marker(81, 87, "plane", [121.0, 14.6], { size: 13, color: "#ffd27a" }),
    sub(80, 89, "Maritime Southeast Asia is overrun."),

    // ---------------------------------------------------------------- 2033: Australia (01:30 – 01:45)
    year(90, "2033"),
    { id: nid("inset"), type: "inset", start: 90, end: 106, camera: { lon: 134, lat: -26.5, scale: 640 }, corner: "bottom-right", width: 0.3, height: 0.36, title: "Australia" },
    sub(90, 95, "2033: Amphibious landings in northern and western Australia."),
    marker(90, 96, "ship", [130.8, -12.2], { size: 14, color: "#ff5a5a", extra: [[115.7, -31.8]] }),
    terr(92, 102, ["c:AUS"], "pz_jambudvipa", { mode: "linear", from: "prc", direction: -40, roughness: 0.8, label: "Conquest of Australia" }),
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
    terr(111, 117.5, [...IND_WEST, ...IND_EAST, ...IND_SOUTH], "pak", { mode: "radial", from: "pak", origin: [77.5, 21.5], roughness: 0.8, label: "Final Indian campaigns" }),
    marker(111.5, 117, "battle", [76.5, 19.5], { size: 13, color: "#ffffff", extra: [[78.5, 17.4], [77.6, 13.0]] }),
    sub(117, 120, "The subcontinent is absorbed into the black zone. The Great Asian War is over."),
  ];

  return {
    version: 1,
    name: "The Great Asian War (2022–2034)",
    description:
      "Alternate-history template inspired by HOI4: The Fire Rises. Demonstrates camera moves, auto-drawn frontlines, nation transitions, disintegration, purification zones, markers, flags, subtitles and an inset map.",
    duration: 120,
    map: { ...defaultMapSettings(), defaultCamera: TAIWAN, projection: "mercator", lod: "medium", borderYear: "present", theme: "neon-noir" },
    nations,
    events,
  };
}
