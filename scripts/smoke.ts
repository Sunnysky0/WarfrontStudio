import fs from "node:fs";
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.fetch = async (url: string) => {
  const p = "public" + url;
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, "utf8")) };
};
class Path2DStub { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} roundRect() {} bezierCurveTo() {} quadraticCurveTo() {} }
g.Path2D = Path2DStub;
let calls = 0;
const ctxStub: any = new Proxy({}, {
  get: (_t, k) => {
    calls++;
    if (k === "measureText") return (s: string) => ({ width: s.length * 8 });
    if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
    if (k === "createPattern") return () => ({});
    if (k === "canvas") return { width: 1920, height: 1080 };
    return () => {};
  },
  set: () => true,
});
g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
g.window = g;
g.Image = class { onload: any; onerror: any; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } };

async function main() {
  const { loadBasemap, resolveRegionKey, hitTest } = await import("../src/lib/studio/basemap");
  const { greatAsianWarTemplate } = await import("../src/lib/studio/template");
  const { MapRenderer } = await import("../src/lib/studio/renderer");
  const { resolveState } = await import("../src/lib/studio/state");

  for (const lod of ["low", "medium", "high"] as const) {
    const t0 = Date.now();
    const bm = await loadBasemap(lod, "present");
    console.log(lod, "countries", bm.countries.features.length, "provinces", bm.provinces.features.length, "cities", bm.cities.length, "seas", bm.seas.length, "rivers", !!bm.rivers, "rail", !!bm.railroads, "lakes", !!bm.lakes, `${Date.now() - t0}ms`);
  }
  const hist = await loadBasemap("medium", "1914");
  console.log("1914 countries:", hist.countries.features.length, "sample:", hist.countries.features.slice(0, 5).map((f) => f.id).join(", "));
  console.log("cn: lookup ->", resolveRegionKey(hist, "cn:Austro-Hungarian Empire"), resolveRegionKey(hist, "cn:Russian Empire"));

  const bm = await loadBasemap("medium", "present");
  const project = greatAsianWarTemplate();
  const keys = new Set<string>();
  for (const n of project.nations) n.regions.forEach((k) => keys.add(k));
  for (const e of project.events) {
    if (e.type === "territory") e.regions.forEach((k) => keys.add(k));
    if (e.type === "disintegrate") e.parts.forEach((p) => p.regions.forEach((k) => keys.add(k)));
  }
  const unresolved: string[] = [];
  for (const k of keys) {
    const r = resolveRegionKey(bm, k);
    if (!bm.countries.byId.has(r) && !bm.provinces.byId.has(r)) unresolved.push(k);
  }
  console.log("template keys:", keys.size, "unresolved:", unresolved);
  console.log("hitTest Tokyo province:", hitTest(bm, 139.7, 35.7, "province")?.properties.name, "| country:", hitTest(bm, 139.7, 35.7, "country")?.properties.name);
  console.log("hitTest Taiwan south province:", hitTest(bm, 120.7, 22.3, "province")?.properties.name);

  const r = new MapRenderer(project);
  r.setBasemap(bm);
  for (const t of [0, 3, 5.5, 10, 16, 22, 28, 32, 36, 41, 47, 54, 58, 64.5, 75, 84, 96, 108, 114, 119.5]) {
    const st = resolveState(project, t, (k) => resolveRegionKey(bm, k), (k) => bm.provincesByCountry.get(k));
    const t0 = Date.now();
    r.render(ctxStub, 1920, 1080, t, { showHud: true, editorOverlay: true, selection: new Set(["c:JPN", "pn:TWN:Pingtung"]), hover: "c:IND" });
    const owners = new Set(st.ownership.values());
    console.log(`t=${t}s year=${st.year} cam=${st.camera.lon.toFixed(1)},${st.camera.lat.toFixed(1)}x${st.camera.scale.toFixed(0)} nations=${owners.size} transfers=${st.transfers.length} markers=${st.markers.length} subs=${st.subtitles.length} insets=${st.insets.length} prc=${st.nations.get("prc")?.name}/${st.nations.get("prc")?.color} pak=${st.nations.get("pak")?.name} ${Date.now() - t0}ms`);
  }
  // other projections & themes
  for (const proj of ["orthographic", "robinson", "conicConformal", "satellite", "winkel3"] as const) {
    project.map.projection = proj;
    r.setProject({ ...project });
    r.render(ctxStub, 1280, 720, 45, { showHud: true });
    console.log("projection ok:", proj, "screenToLonLat center:", r.screenToLonLat(640, 360)?.map((v) => v.toFixed(1)).join(","));
  }
  console.log("ctx calls:", calls, "SMOKE OK");
}
main().catch((e) => { console.error("SMOKE FAILED", e); process.exit(1); });
