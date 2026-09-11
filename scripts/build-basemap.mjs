// Downloads public-domain geodata (Natural Earth + aourednik historical-basemaps)
// and compiles compact TopoJSON layers at three granularities into public/data.
// Usage: node --max-old-space-size=6144 scripts/build-basemap.mjs
import fs from "node:fs";
import path from "node:path";
import * as topojson from "topojson-server";
import * as simplify from "topojson-simplify";
import * as client from "topojson-client";

const OUT = path.resolve("public/data");
const CACHE = path.resolve(".cache/geodata");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const HB = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/";

// spherical triangle area thresholds (steradians) & min ring area per granularity
const GRAN = {
  high: { simplify: 4e-9, minRing: 0, quant: 1e5 },
  medium: { simplify: 1.2e-7, minRing: 5e-8, quant: 3e4 },
  low: { simplify: 2.5e-6, minRing: 1.2e-6, quant: 1e4 },
};

async function fetchJson(url) {
  const file = path.join(CACHE, path.basename(url));
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(`  downloading ${path.basename(url)} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  console.log(`${(text.length / 1e6).toFixed(1)} MB`);
  return JSON.parse(text);
}

function keepProps(fc, keys, filter) {
  return {
    type: "FeatureCollection",
    features: fc.features
      .filter((f) => f.geometry && (!filter || filter(f.properties || {})))
      .map((f) => {
        const p = {};
        for (const k of keys) if (f.properties && f.properties[k] != null) p[k] = f.properties[k];
        return { type: "Feature", properties: p, geometry: f.geometry };
      }),
  };
}

function write(name, obj) {
  const json = JSON.stringify(obj);
  fs.writeFileSync(path.join(OUT, name), json);
  console.log(`  wrote ${name} (${(json.length / 1e6).toFixed(2)} MB)`);
}

function buildLayer(name, fc, { filters = {} } = {}) {
  for (const gran of ["high", "medium", "low"]) {
    const cfg = GRAN[gran];
    const src = filters[gran] ? keepProps(fc, Object.keys(fc.features[0]?.properties || {}), filters[gran]) : fc;
    let topo = topojson.topology({ [name]: src });
    topo = simplify.presimplify(topo, simplify.sphericalTriangleArea);
    topo = simplify.simplify(topo, cfg.simplify);
    if (cfg.minRing > 0) {
      topo = simplify.filter(topo, simplify.filterAttachedWeight(topo, cfg.minRing, simplify.sphericalRingArea));
    }
    topo = client.quantize(topo, cfg.quant);
    write(`${name}_${gran}.json`, topo);
  }
}

async function main() {
  console.log("Land (10m)");
  buildLayer("land", keepProps(await fetchJson(NE + "ne_10m_land.geojson"), []));

  console.log("Lakes (10m)");
  buildLayer("lakes", keepProps(await fetchJson(NE + "ne_10m_lakes.geojson"), ["name", "scalerank"]), {
    filters: { medium: (p) => (p.scalerank ?? 0) <= 6, low: (p) => (p.scalerank ?? 0) <= 2 },
  });

  console.log("Rivers (10m)");
  const rivers = keepProps(await fetchJson(NE + "ne_10m_rivers_lake_centerlines.geojson"), ["name", "scalerank"]);
  buildLayer("rivers", rivers, {
    filters: { medium: (p) => (p.scalerank ?? 0) <= 7, low: (p) => (p.scalerank ?? 0) <= 4 },
  });

  console.log("Railroads (10m)");
  const railRaw = await fetchJson(NE + "ne_10m_railroads.geojson");
  console.log("  railroad props:", Object.keys(railRaw.features[0].properties).join(","));
  const rails = keepProps(railRaw, ["scalerank", "featurecla"], (p) => p.featurecla !== "Railroad ferry");
  buildLayer("railroads", rails, {
    filters: { medium: (p) => (p.scalerank ?? 0) <= 6, low: (p) => (p.scalerank ?? 0) <= 4 },
  });

  console.log("Provinces (10m admin-1)");
  const provRaw = await fetchJson(NE + "ne_10m_admin_1_states_provinces.geojson");
  buildLayer("provinces", keepProps(provRaw, ["name", "admin", "adm0_a3"]));

  console.log("Cities (10m populated places)");
  const citiesRaw = await fetchJson(NE + "ne_10m_populated_places_simple.geojson");
  const cities = citiesRaw.features
    .filter((f) => f.geometry)
    .map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return {
        n: p.name,
        x: +lon.toFixed(3),
        y: +lat.toFixed(3),
        r: p.scalerank ?? 10,
        p: p.pop_max ?? 0,
        c: p.adm0cap === 1 ? 1 : 0,
        a: p.adm0name,
      };
    });
  write("cities.json", cities);

  const years = [1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2010];
  for (const y of years) {
    console.log(`Borders ${y}`);
    const raw = await fetchJson(HB + `world_${y}.geojson`);
    const fc = keepProps(raw, ["NAME", "SUBJECTO", "PARTOF"]);
    buildLayer(`borders_${y}`, fc);
    if (y === 1914) {
      const names = fc.features.map((f) => `${f.properties.NAME}${f.properties.SUBJECTO ? " <" + f.properties.SUBJECTO + ">" : ""}`);
      fs.writeFileSync(path.join(CACHE, "names_1914.txt"), names.sort().join("\n"));
    }
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
