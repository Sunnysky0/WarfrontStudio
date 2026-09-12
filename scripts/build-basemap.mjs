/**
 * Warfront Animation Studio – basemap build pipeline.
 *
 * Downloads Natural Earth vector data + historical-basemaps borders, converts
 * everything to compact TopoJSON at three granularity levels (low / medium / high)
 * and writes the results to public/basemap/.
 *
 * Usage: node --max-old-space-size=6144 scripts/build-basemap.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { topology } from "topojson-server";
import {
  presimplify,
  simplify,
  filter,
  filterAttachedWeight,
  sphericalTriangleArea,
  sphericalRingArea,
} from "topojson-simplify";
import { quantize } from "topojson-client";
import { geoCentroid, geoArea } from "d3-geo";

const OUT = path.resolve("public/basemap");
const CACHE = path.resolve("/tmp/ne-cache");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const HIST = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/";

async function download(url, name) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`  ↓ ${name}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text);
      fs.writeFileSync(file, text);
      return JSON.parse(text);
    } catch (e) {
      console.warn(`    retry ${attempt + 1} for ${name}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`Failed to download ${name}`);
}

function lower(obj) {
  const o = {};
  for (const k of Object.keys(obj || {})) o[k.toLowerCase()] = obj[k];
  return o;
}

// Visvalingam thresholds in steradians (1 km² ≈ 2.46e-8 sr)
const WEIGHTS = { low: 2.5e-6, medium: 2.5e-7, high: 1.5e-8 };

/**
 * @param objects GeoJSON objects keyed by name
 * @param q quantization grid
 * @param keep 1 = keep native resolution (quantize only); otherwise the LOD name whose
 *             steradian threshold is applied.
 */
function buildTopo(objects, q, keep) {
  let topo = topology(objects);
  if (keep !== 1) {
    const minWeight = typeof keep === "string" ? WEIGHTS[keep] : keep;
    topo = presimplify(topo, sphericalTriangleArea);
    topo = simplify(topo, minWeight);
    topo = filter(topo, filterAttachedWeight(topo, minWeight, sphericalRingArea));
    topo.arcs = topo.arcs.map((arc) => arc.map((p) => [p[0], p[1]]));
    delete topo.transform;
  }
  return quantize(topo, q);
}

function write(name, data) {
  const json = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, name), json);
  console.log(`  ✔ ${name} (${(json.length / 1024).toFixed(0)} KB)`);
  return json.length;
}

const LODS = {
  low: { q: 1e4 },
  medium: { q: 4e4 },
  high: { q: 1e5 },
};

const manifest = { layers: {}, years: [], lods: ["low", "medium", "high"], generated: new Date().toISOString() };

// ---------------------------------------------------------------- countries (present, Natural Earth)
function prepCountries(fc) {
  const seen = new Map();
  const feats = [];
  for (const f of fc.features) {
    const p = lower(f.properties);
    let key = p.adm0_a3 || p.iso_a3 || p.name;
    if (!key || key === "-99") key = p.name;
    let id = `c:${key}`;
    if (seen.has(id)) {
      const n = seen.get(id) + 1;
      seen.set(id, n);
      id = `${id}#${n}`;
    } else seen.set(id, 0);
    feats.push({
      type: "Feature",
      id,
      properties: {
        name: p.name || p.admin || key,
        iso2: p.iso_a2 && p.iso_a2 !== "-99" ? p.iso_a2 : undefined,
        adm0: key,
      },
      geometry: f.geometry,
    });
  }
  return { type: "FeatureCollection", features: feats };
}

function prepHistorical(fc) {
  const seen = new Map();
  const feats = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const p = lower(f.properties);
    const name = (p.name || p.abbrevn || "unnamed").toString().trim();
    let id = `c:${name.replace(/\s+/g, "_")}`;
    if (seen.has(id)) {
      const n = seen.get(id) + 1;
      seen.set(id, n);
      id = `${id}#${n}`;
    } else seen.set(id, 0);
    feats.push({
      type: "Feature",
      id,
      properties: {
        name,
        subject: p.subjecto || undefined,
        partof: p.partof || undefined,
        adm0: name,
      },
      geometry: f.geometry,
    });
  }
  return { type: "FeatureCollection", features: feats };
}

function prepProvinces(fc) {
  const feats = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const p = lower(f.properties);
    const code = p.adm1_code || p.iso_3166_2 || `${p.adm0_a3}-${p.name}`;
    feats.push({
      type: "Feature",
      id: `p:${code}`,
      properties: {
        name: p.name_en || p.name || p.gn_name || p.woe_name || code,
        adm0: p.adm0_a3,
        iso: p.iso_3166_2 || undefined,
        type: p.type_en || undefined,
      },
      geometry: f.geometry,
    });
  }
  return { type: "FeatureCollection", features: feats };
}

function stripProps(fc, keepFn) {
  return {
    type: "FeatureCollection",
    features: fc.features
      .filter((f) => f.geometry)
      .map((f) => ({ type: "Feature", properties: keepFn ? keepFn(lower(f.properties)) : {}, geometry: f.geometry })),
  };
}

async function step(label, fn) {
  console.log(`\n== ${label}`);
  try {
    await fn();
  } catch (e) {
    console.error(`  ✖ ${label} failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------- main
await step("Countries (present)", async () => {
  const c110 = prepCountries(await download(NE + "ne_110m_admin_0_countries.geojson", "ne_110m_admin_0_countries.geojson"));
  const c50 = prepCountries(await download(NE + "ne_50m_admin_0_countries.geojson", "ne_50m_admin_0_countries.geojson"));
  const c10 = prepCountries(await download(NE + "ne_10m_admin_0_countries.geojson", "ne_10m_admin_0_countries.geojson"));
  write("countries-present-low.json", buildTopo({ countries: c110 }, LODS.low.q, 1));
  write("countries-present-medium.json", buildTopo({ countries: c50 }, LODS.medium.q, 1));
  write("countries-present-high.json", buildTopo({ countries: c10 }, LODS.high.q, "high"));
  manifest.years.push({ id: "present", label: "Present day (Natural Earth)", source: "Natural Earth 5.x" });
});

const HIST_YEARS = [
  ["1900", "world_1900.geojson", "1900"],
  ["1914", "world_1914.geojson", "1914"],
  ["1920", "world_1920.geojson", "1920"],
  ["1935", "world_1930.geojson", "1935 (c. 1930 borders)"],
  ["1939", "world_1938.geojson", "1939 (c. 1938 borders)"],
  ["1945", "world_1945.geojson", "1945"],
  ["1960", "world_1960.geojson", "1960"],
  ["1994", "world_1994.geojson", "1994"],
  ["2010", "world_2010.geojson", "2010"],
];
for (const [id, file, label] of HIST_YEARS) {
  await step(`Historical borders ${id}`, async () => {
    const fc = prepHistorical(await download(HIST + file, file));
    write(`countries-${id}-low.json`, buildTopo({ countries: fc }, LODS.low.q, "low"));
    write(`countries-${id}-medium.json`, buildTopo({ countries: fc }, LODS.medium.q, "medium"));
    write(`countries-${id}-high.json`, buildTopo({ countries: fc }, LODS.high.q, 1));
    manifest.years.push({ id, label, source: "aourednik/historical-basemaps" });
  });
}

await step("Provinces (admin-1)", async () => {
  const fc = prepProvinces(
    await download(NE + "ne_10m_admin_1_states_provinces.geojson", "ne_10m_admin_1_states_provinces.geojson")
  );
  write("provinces-low.json", buildTopo({ provinces: fc }, LODS.low.q, "low"));
  write("provinces-medium.json", buildTopo({ provinces: fc }, LODS.medium.q, "medium"));
  write("provinces-high.json", buildTopo({ provinces: fc }, LODS.high.q, "high"));
  // name index for user-friendly lookups (pn:ADM0:Name)
  const index = fc.features.map((f) => [f.id, f.properties.adm0, f.properties.name]);
  write("provinces-index.json", index);
});

await step("Land / coastlines", async () => {
  const l110 = stripProps(await download(NE + "ne_110m_land.geojson", "ne_110m_land.geojson"));
  const l50 = stripProps(await download(NE + "ne_50m_land.geojson", "ne_50m_land.geojson"));
  const l10 = stripProps(await download(NE + "ne_10m_land.geojson", "ne_10m_land.geojson"));
  write("land-low.json", buildTopo({ land: l110 }, LODS.low.q, 1));
  write("land-medium.json", buildTopo({ land: l50 }, LODS.medium.q, 1));
  write("land-high.json", buildTopo({ land: l10 }, LODS.high.q, "high"));
});

await step("Rivers", async () => {
  const keep = (p) => ({ name: p.name || undefined, rank: p.scalerank });
  const r110 = stripProps(await download(NE + "ne_110m_rivers_lake_centerlines.geojson", "ne_110m_rivers.geojson"), keep);
  const r50 = stripProps(await download(NE + "ne_50m_rivers_lake_centerlines.geojson", "ne_50m_rivers.geojson"), keep);
  const r10 = stripProps(await download(NE + "ne_10m_rivers_lake_centerlines.geojson", "ne_10m_rivers.geojson"), keep);
  write("rivers-low.json", buildTopo({ rivers: r110 }, LODS.low.q, 1));
  write("rivers-medium.json", buildTopo({ rivers: r50 }, LODS.medium.q, 1));
  write("rivers-high.json", buildTopo({ rivers: r10 }, LODS.high.q, "high"));
});

await step("Lakes", async () => {
  const keep = (p) => ({ name: p.name || undefined, rank: p.scalerank });
  const l110 = stripProps(await download(NE + "ne_110m_lakes.geojson", "ne_110m_lakes.geojson"), keep);
  const l50 = stripProps(await download(NE + "ne_50m_lakes.geojson", "ne_50m_lakes.geojson"), keep);
  const l10 = stripProps(await download(NE + "ne_10m_lakes.geojson", "ne_10m_lakes.geojson"), keep);
  write("lakes-low.json", buildTopo({ lakes: l110 }, LODS.low.q, 1));
  write("lakes-medium.json", buildTopo({ lakes: l50 }, LODS.medium.q, 1));
  write("lakes-high.json", buildTopo({ lakes: l10 }, LODS.high.q, "high"));
});

await step("Railroads", async () => {
  const fc = stripProps(await download(NE + "ne_10m_railroads.geojson", "ne_10m_railroads.geojson"), (p) => ({
    rank: p.scalerank,
  }));
  write("railroads-low.json", buildTopo({ railroads: fc }, LODS.low.q, "low"));
  write("railroads-medium.json", buildTopo({ railroads: fc }, LODS.medium.q, "medium"));
  write("railroads-high.json", buildTopo({ railroads: fc }, LODS.high.q, "high"));
});

await step("Cities", async () => {
  const fc = await download(NE + "ne_10m_populated_places_simple.geojson", "ne_10m_populated_places_simple.geojson");
  const cities = [];
  for (const f of fc.features) {
    const p = lower(f.properties);
    if (!f.geometry) continue;
    const [lon, lat] = f.geometry.coordinates;
    const fc2 = (p.featurecla || "").toLowerCase();
    const cap = fc2.startsWith("admin-0 capital") ? 0 : fc2.startsWith("admin-1 capital") || fc2.includes("region capital") ? 1 : 2;
    cities.push([p.name, +lon.toFixed(3), +lat.toFixed(3), p.scalerank ?? 10, cap, p.pop_max ?? 0, p.adm0_a3 || ""]);
  }
  write("cities.json", cities);
});

await step("Sea / ocean labels", async () => {
  const fc = await download(NE + "ne_10m_geography_marine_polys.geojson", "ne_10m_geography_marine_polys.geojson");
  const seas = [];
  for (const f of fc.features) {
    const p = lower(f.properties);
    if (!f.geometry) continue;
    const c = geoCentroid(f);
    const area = geoArea(f);
    seas.push([p.name_en || p.name || p.label || "", +c[0].toFixed(3), +c[1].toFixed(3), p.scalerank ?? 5, (p.featurecla || "").toLowerCase(), +area.toFixed(5)]);
  }
  write("seas.json", seas.filter((s) => s[0]));
});

manifest.layers = fs
  .readdirSync(OUT)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .reduce((acc, f) => {
    acc[f] = fs.statSync(path.join(OUT, f)).size;
    return acc;
  }, {});
write("manifest.json", manifest);
console.log("\nDone.");
