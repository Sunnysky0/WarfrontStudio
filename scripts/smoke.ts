import fs from "node:fs";
const g = globalThis as any;
g.fetch = async (url: string) => {
  const p = "public" + url;
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, "utf8")) };
};
class Path2DStub { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} roundRect() {} bezierCurveTo() {} quadraticCurveTo() {} addPath() {} }
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function pointSegmentDistance(point: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / l2));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t));
}

function directedPolylineError(a: [number, number][], b: [number, number][]): number {
  let error = 0;
  for (const point of a) {
    let best = Infinity;
    for (let i = 1; i < b.length; i++) best = Math.min(best, pointSegmentDistance(point, b[i - 1], b[i]));
    error = Math.max(error, best);
  }
  return error;
}

async function main() {
  const { loadBasemap, resolveRegionKey, hitTest } = await import("../src/lib/studio/basemap");
  const { greatAsianWarTemplate } = await import("../src/lib/studio/template");
  const { MapRenderer } = await import("../src/lib/studio/renderer");
  const { resolveState } = await import("../src/lib/studio/state");
  const {
    fitBezierPath,
    flattenBezierPath,
    maxReprojectionError,
    pathHasSelfIntersection,
    polylineToBezierPath,
    polylineToLinearBezierPath,
    quantizeLonLat,
    reverseBezierPath,
    splitBezierPathSegment,
  } = await import("../src/lib/studio/front-path");
  const {
    densify,
    interpolateFront,
    interpolatePolylines,
    keyframePolyline,
    projectVisibleSegments,
  } = await import("../src/lib/studio/frontline");

  const nonlinearProject = ([lon, lat]: [number, number]): [number, number] => [lon, lat + lon * lon * 0.01];
  const nonlinearInvert = ([x, y]: [number, number]): [number, number] => [x, y - x * x * 0.01];
  const sSamples = Array.from({ length: 161 }, (_, i) => {
    const geo: [number, number] = [-20 + i * 0.25, Math.sin((i / 160) * Math.PI * 2) * 8];
    return { geo, screen: nonlinearProject(geo) };
  });
  const sPath = fitBezierPath(sSamples, 0.5, nonlinearInvert, 2048, nonlinearProject);
  assert(sPath && sPath.nodes.length >= 2, "S-curve freehand fit should produce an editable path");
  assert(maxReprojectionError(sSamples, sPath, nonlinearProject) <= 0.501, "Exact fit should stay within 0.5 normalized pixels after reprojection");

  const simpleCases = [
    [[-10, 0], [0, 0], [10, 0]],
    [[-10, 0], [0, 0], [0, 10], [10, 10]],
    [[0, 0], [0.1, 0.1]],
  ] as [number, number][][];
  for (const points of simpleCases) {
    const samples = points.map((point) => ({ screen: point, geo: point }));
    const path = fitBezierPath(samples, 0.5, (point) => point, 2048, (point) => point);
    assert(path && path.nodes.length >= 2, "straight, corner, and short strokes should fit");
  }

  const longSamples = Array.from({ length: 2500 }, (_, i) => {
    const point: [number, number] = [-120 + i * 0.08, i % 2 ? 1 : -1];
    return { screen: point, geo: point };
  });
  const longPath = fitBezierPath(longSamples, 0.0001, (point) => point, 128, (point) => point);
  assert(longPath && longPath.nodes.length <= 128, "long fits should honor the node cap");
  assert(Math.abs(longPath.nodes.at(-1)!.anchor[0] - quantizeLonLat(longSamples.at(-1)!.geo)[0]) < 1e-9, "node-cap fallback should retain the final sample");

  const loop = polylineToBezierPath([[0, 0], [8, 8], [0, 16], [-8, 8]], true);
  assert(flattenBezierPath(loop, true).length > loop.nodes.length, "closed bezier loops should adaptively flatten");
  const bow = polylineToLinearBezierPath([[-8, -8], [8, 8], [-8, 8], [8, -8]], true);
  assert(pathHasSelfIntersection(flattenBezierPath(bow, true), true), "self-intersecting loops should be detected");
  const antimeridian = { kind: "bezier" as const, nodes: [{ anchor: [179, 0] as [number, number] }, { anchor: [-179, 2] as [number, number] }] };
  const antimeridianLine = flattenBezierPath(antimeridian, false);
  assert(antimeridianLine.every((point, i) => !i || Math.abs(((point[0] - antimeridianLine[i - 1][0] + 540) % 360) - 180) < 3), "antimeridian bezier evaluation should follow the short longitude arc");

  const legacyPoints: [number, number][] = [[90, 20], [95, 24], [101, 21], [106, 27]];
  const legacyBefore = densify(legacyPoints, false);
  const legacyAfter = keyframePolyline({ offset: 0, points: legacyPoints }, false);
  assert(JSON.stringify(legacyBefore) === JSON.stringify(legacyAfter), "legacy points should retain Catmull-Rom/densify behavior");

  const openA: [number, number][] = [[0, 0], [5, 4], [10, 0]];
  const openMid = interpolatePolylines(openA, openA.slice().reverse(), 0.5, false);
  assert(Math.abs(openMid[0][0]) < 0.1 && Math.abs(openMid.at(-1)![0] - 10) < 0.1, "reversed open keyframes should match direction before interpolation");
  const closedA = Array.from({ length: 12 }, (_, i): [number, number] => [Math.cos((i / 12) * Math.PI * 2) * 10, Math.sin((i / 12) * Math.PI * 2) * 10]);
  const shifted = [...closedA.slice(4), ...closedA.slice(0, 4)].reverse();
  const closedMid = interpolatePolylines(closedA, shifted, 0.5, true);
  assert(Math.min(...closedMid.map((point) => Math.hypot(point[0], point[1]))) > 8, "closed keyframes with shifted starts and direction should not twist through the center");
  const variedMid = interpolatePolylines(openA, [[0, 0], [2, 2], [4, 5], [7, 2], [10, 0]], 0.5, false);
  assert(variedMid.length >= 64 && variedMid.every((point) => point.every(Number.isFinite)), "keyframes with different node counts should interpolate stably");

  const splitSource = { kind: "bezier" as const, nodes: [
    { anchor: [10, 10] as [number, number], out: [4, 8] as [number, number], linked: true },
    { anchor: [25, 18] as [number, number], in: [-6, 3] as [number, number], linked: true },
  ] };
  const beforeSplit = flattenBezierPath(splitSource, false, 1e-6);
  const split = splitBezierPathSegment(splitSource, 0, 0.37, false);
  const afterSplit = flattenBezierPath(split.path, false, 1e-6);
  const splitError = Math.max(directedPolylineError(beforeSplit, afterSplit), directedPolylineError(afterSplit, beforeSplit));
  assert(split.index === 1 && splitError < 2e-5, "de Casteljau insertion should preserve curve geometry");
  assert(JSON.stringify(reverseBezierPath(reverseBezierPath(splitSource))) === JSON.stringify(splitSource), "double path reversal should restore the original geometry");
  assert(quantizeLonLat([12.12345649, -4.98765449])[0] === 12.123456, "coordinates should serialize at 1e-6 degree precision");

  const invalidEvent: any = {
    type: "front", id: "invalid-front", start: 0, end: 4, nation: "n", capturedSide: [0, 1],
    keyframes: [{ offset: 0 }, { offset: 1, points: [[0, 0], [5, 0]] }],
  };
  assert(interpolateFront(invalidEvent, 0)?.length, "keyframes without path or points should be ignored safely");

  const visibility = projectVisibleSegments(
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    (point) => point[0] === 2 ? null : point,
    false
  );
  assert(visibility.segments.length === 2 && visibility.segments.every((segment) => segment.length === 2), "invisible projection intervals should split strokes instead of bridging them");
  const seam = projectVisibleSegments([[179, 0], [179.5, 0], [-179.5, 0], [-179, 0]], (point) => point, false, 1);
  assert(seam.segments.length === 2 && seam.segments.every((segment) => segment.every((point, i) => !i || Math.abs(point[0] - segment[i - 1][0]) <= 1)), "projection seam jumps should be split");
  console.log("front path assertions: OK");

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
  const showcaseFront = project.events.find((event) => event.type === "front" && event.keyframes.some((keyframe) => keyframe.path));
  assert(showcaseFront?.type === "front" && showcaseFront.roughness === 0, "template should showcase a precise bezier frontline");
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
    console.log(`t=${t}s year=${st.year} cam=${st.camera.lon.toFixed(1)},${st.camera.lat.toFixed(1)}x${st.camera.scale.toFixed(0)} nations=${owners.size} transfers=${st.transfers.length} fronts=${st.fronts.length} markers=${st.markers.length} subs=${st.subtitles.length} insets=${st.insets.length} prc=${st.nations.get("prc")?.name}/${st.nations.get("prc")?.color} pak=${st.nations.get("pak")?.name} ${Date.now() - t0}ms`);
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
