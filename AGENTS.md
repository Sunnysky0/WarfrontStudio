# Warfront Animation Studio

Browser studio for historical war-front map videos. Users paint alliances by date, morph occupation zones and front lines between keyframes, add arrows/markers/labels/events, keyframe the camera, then export a frame-accurate MP4 (WebCodecs) or WebM from the browser.

This file is the agent operating manual. Prefer it over rediscovering the tree.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 — no Postgres required
npm run build
npm run lint
npm run typecheck    # tsc --noEmit
```

Optional Postgres: set `DATABASE_URL`. Without it, `getRepo()` uses `.data/store.json`.

Rebuild TopoJSON base maps (needs network, ~6 GB Node heap):

```bash
node --max-old-space-size=6144 scripts/build-basemap.mjs
```

There is **no test suite**. After logic changes, run `npm run typecheck`. For renderer/editor work, exercise the studio in the browser: load the WWI template, scrub the timeline, drag a zone vertex, paint a country, export a short clip.

## Stack

| Piece | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript strict |
| UI | Tailwind 4 (`src/app/globals.css` is `@import "tailwindcss"`), lucide-react, dark slate chrome |
| State | Zustand (`src/store/studio.ts`) |
| Map | d3-geo + d3-geo-projection, TopoJSON in `public/data/` |
| Persist | Drizzle + `pg` **or** JSON file repo |
| Export | Client-only: WebCodecs H.264 (`mp4-muxer`) or MediaRecorder WebM |

Path alias: `@/*` → `src/*`. `package.json` name is leftover (`nextjs-postgresql-template`); ignore it.

## Layout

```
src/
  app/                    Next routes
    page.tsx              Project list / create / clone / delete
    studio/[id]/page.tsx  Studio shell (client Studio)
    api/projects/         GET list, POST create
    api/projects/[id]/    GET / PUT / DELETE
    api/assets/           GET list, POST custom asset
    api/health/           Repo ping
  components/studio/      Entire editor UI (client)
  store/studio.ts         Editor session state + undo
  lib/types.ts            Canonical Project document (version: 1)
  lib/time.ts             Date parse + video↔history mapping
  lib/interpolate.ts      Shape/value/camera interpolation
  lib/edit.ts             Pure Project mutators (used by UI)
  lib/render/renderer.ts  Canvas2D FrameRenderer
  lib/export/exporter.ts  MP4 / WebM / PNG
  lib/geo/basemap.ts      Load + cull TopoJSON layers
  lib/geo/projections.ts  20 projections + camera framing
  lib/assets.ts           Icons, palettes, line/arrow/shape presets
  lib/templates/wwi.ts    WWI template + blank project factory
  lib/server/seed.ts      Idempotent template + builtin assets
  db/                     Repo interface, file + Postgres impls
public/data/              Prebuilt TopoJSON + cities.json
scripts/build-basemap.mjs Natural Earth + historical-basemaps compiler
.data/store.json          Local persist (gitignored)
.cache/geodata/           Download cache for the compiler (gitignored)
```

Keep domain logic in `src/lib/`. Keep React in `src/components/studio/` and `src/app/`. Do not import components from `lib/`.

## Domain: the Project document

The unit of work is a JSON `Project` (`src/lib/types.ts`, `version: 1`). The DB stores it as jsonb / file blob. Import/export is that JSON (`.warfront.json`).

Coordinates are **`LonLat = [longitude, latitude]`** in degrees. Never `[lat, lon]`.

| Field | Role |
| --- | --- |
| `video` | Output width/height/fps/duration (seconds) |
| `map` | Projection, granularity, border year, layer toggles, style |
| `time` | Historical `start`/`end` ISO dates + `pacing` curve |
| `factions` | Named colours; optional `hatch` |
| `memberships` | Country → faction over a date range |
| `zones` | Closed occupation polygons with shape keyframes |
| `lines` | Open front polylines with shape keyframes |
| `arrows` | Quadratic offensive arrows (`start`/`end`/`holdUntil`) |
| `markers` | Battle/unit icons with `from`/`to` |
| `labels` | Map text; `{value}` interpolates `valueKeyframes` |
| `events` | Timeline subtitles / headlines |
| `camera.keyframes` | Center, zoom, optional roll |
| `overlays` | Date, clock, title card, legend, watermark |

Element ids come from `uid()` in `types.ts`. Selection is `{ type: ElementType; id: string }` (`camera` uses the keyframe index as `id`).

### Time

Two clocks:

1. **Video time** `t` — seconds in `[0, project.video.duration]`. Playback, export, and the timeline scrubber use this.
2. **Historical date** `ms` — UTC milliseconds from `parseDate`.

`dateAtTime` / `timeAtDate` (`src/lib/time.ts`) lerp along `time.pacing`. Endpoints are always `(t=0, start)` and `(t=duration, end)`.

`parseDate` is custom: `"1914-07-28"` or `"1914-07-28T05:00"` as **UTC**, including years `< 100`. Do not use `Date.parse` / `new Date("1914-07-28")` for stored dates.

`isActive(from, to, ms)` is inclusive. Missing `from`/`to` means unbounded.

Element fades: `fadeAlpha` in the renderer fades in/out over ~0.5 s of **video** time around `from`/`to`.

### Memberships (country paint)

`Membership.country` must match the borders layer property `NAME`. If `includeSubjects` is true, features whose `SUBJECTO` equals that name also fill (colonies follow the metropole).

`factionForCountry` picks the matching membership active at `ms` with the latest `from`. Direct `NAME` match beats `SUBJECTO`.

`paintCountry` (edit.ts) closes any membership active at the playhead and opens a new one. Neutral = `factionId: null`.

Country names are **historical** (`German Empire`, `Austro-Hungarian Empire`, `United Kingdom of Great Britain and Ireland`). The WWI template duplicates some modern aliases (`Russia`, `Italy`, `United Kingdom`) because snapshots differ by year.

`1935` reuses the 1930 border file; `1939` reuses 1938 (`BORDER_YEARS` in `basemap.ts`).

### Shape keyframes

Zones and lines morph via `shapeAt` → `lerpShape`:

- Equal vertex counts → vertex-to-vertex lerp (what the editor tries to preserve).
- Unequal counts → resample to a common length, then align (closed rings rotate/reverse to minimise distance).

`insertVertex` / `removeVertex` apply the same index to **every** keyframe when counts already match. Do not break that on purpose.

Occupation zones that should look like captured territory (not a thin ribbon along the front) close through friendly hinterland. See `wf()` / `ef()` in `wwi.ts`: front polyline + fixed closing path.

Closed rings are rewound clockwise before `d3.geoPath` (`signedArea` > 0 is reversed). Counter-clockwise rings fill the rest of the sphere.

Arrows are **not** shape-keyframed. They draw from `from`→`to` with `curve` ∈ [-1, 1] as a screen-space quadratic, progressing between `start` and `end`, then fading after `holdUntil` (~14 days).

Camera zoom interpolates in **log space**. Default camera if none: `[15, 50]`, zoom `4`.

## Rendering

`FrameRenderer` (`src/lib/render/renderer.ts`) is the only place that draws a frame. Preview (`MapCanvas.previewRenderer`) and export (`exportVideo` / `renderPng`) both call `render(ctx, project, t, opts)`.

HUD / stroke widths scale with `s = height / 1080`. Author sizes as 1080p pixels.

Compositing:

1. **Cached static underlay** — ocean, graticule, land, faction country fills (clipped to land).
2. **Dynamic zones** — occupation polygons, clipped to land, then hatch/outline.
3. **Cached static overlay** — lakes, rivers, provinces, railroads, interior borders, coastline, cities, paper hatch.
4. **Dynamic** — front lines, arrows, markers, labels.
5. **Editor overlay** (preview only) — handles, draft, hover country.
6. **HUD** — date, clock, legend, title, subtitles, watermark.

Cache key includes projection, camera (rounded), layers, style, faction colours, border assignments, data version. `setLayers` bumps `dataVersion`. `invalidate()` drops the cache. `fast: true` skips provinces, railroads, rivers, city labels (used while the camera is dragged).

`hitTest` / `countryAt` use `lastProjection`. Hit order: selected shape vertices → markers → labels → arrows → lines → zone interiors.

Export is **client-side only**. Do not add a server encode path unless asked. MP4 uses WebCodecs + `mp4-muxer`; fallback is real-time WebM via MediaRecorder. `forExport: true` omits editor chrome.

## Editor state

`useStudio` holds the live `Project`, 60-deep undo (`past` / `future`), playhead, mode, selection, draft polyline, active faction, panel.

**Every Project mutation** goes through `update(fn, opts?)`:

```ts
update: (fn, opts) => {
  const next = structuredClone(state.project);
  fn(next);
  // transient: skip undo (live drags). else push previous onto past, clear future
}
```

Mutators in `src/lib/edit.ts` and `src/components/studio/actions.ts` assume they receive that clone and mutate it in place. Do not assign `state.project.foo = …` from a component.

- Vertex/camera drags: `update(..., { transient: true })` after an initial `snapshot()`.
- Wheel zoom snapshots at most every 600 ms.

Autosave: Studio subscribes to project changes and PUT `/api/projects/:id` after 2 s. Ctrl/Cmd+S saves immediately. Dirty flag + `beforeunload`.

Modes (`store/studio.ts`): `navigate` `select` `paint` `drawZone` `drawLine` `placeMarker` `placeLabel` `drawArrow`. Keyboard map in `Studio.tsx` (`h v p z l a m t`). Drawing finishes on Enter via `finishDraft()`.

Studio chrome: TopBar | LeftPanel (map/factions/elements/events/camera/assets) | MapCanvas | Timeline | Inspector | ExportDialog. Shared controls live in `ui.tsx` (`Section`, `Field`, `DateInput`, …).

## Persistence

`getRepo()` (`src/db/index.ts`) is a process singleton:

- `DATABASE_URL` set → Drizzle/Postgres (`src/db/pg-repo.ts`, schema in `src/db/schema.ts`).
- else → `.data/store.json` with a write lock (`src/db/file-repo.ts`).

Repo methods: list/get/insert/update/delete projects, find by `templateKey`, list/insert assets, `ping`. Keep both impls in sync when changing `Repo`.

`ensureSeeded()` runs on project/asset API reads: inserts the WWI template (`templateKey: "wwi"`, `isTemplate: true`) if missing, and any missing `BUILTIN_ASSETS`. The template **cannot be deleted**.

Create project POST body: `{ from: "wwi" | "blank", name?, cloneOf?, data? }`.

## Base map data

Compiled TopoJSON in `public/data/`:

| Layer file prefix | Source |
| --- | --- |
| `land`, `lakes`, `rivers`, `provinces`, `railroads` | Natural Earth 10m (public domain) |
| `borders_YYYY` | aourednik/historical-basemaps (CC BY-NC-SA) |
| `cities.json` | Compact `{ n, x, y, r, p, c, a? }` (name, lon, lat, scalerank, pop, capital) |

Each polygon/line layer has `low` / `medium` / `high`. Loader: `ensureLayer(file, gran)` → `LoadedLayer` with `features` (bbox + props), `interior` mesh, `outline` mesh. Features are culled with `visibleBounds` of the current projection.

Do not hand-edit the JSON in `public/data/`. Change `scripts/build-basemap.mjs` and rebuild.

## Templates and assets

`createWwiTemplate()` / `createBlankProject()` in `src/lib/templates/wwi.ts`. The WWI file is large on purpose: it is the feature tour (zones, lines, arrows, markers, counters, events, camera, pacing). When adding a capability, **show it in the template** if it is user-visible.

Helpers at the top of that file (`zone`, `marker`, `arrow`, `ev`, `stat`, `m`, `wf`, `ef`) are the preferred way to add template content. Keep dates ISO. Keep occupation rings closed through hinterland.

`src/lib/assets.ts`:

- `ICONS` — 24×24 path data; `stroke: true` = NATO-style outlines. `IconId` in `types.ts` must stay in sync.
- `PALETTES` — faction colours + map neutrals (WWI classic is index 0).
- `LINE_STYLES`, `ARROW_STYLES`, `SHAPE_PRESETS`.
- `BUILTIN_ASSETS` flattens those for the seed.

Applying a palette from the Assets panel writes faction colours **and** map style fields. Do not silently retint existing memberships' identities.

## Conventions

- TypeScript only. Strict. No `any` unless crossing TopoJSON/GeoJSON JSON.
- Functional components + hooks. Studio files are `"use client"`.
- Server routes stay tiny: seed, repo, JSON. No rendering on the server.
- Match surrounding style: 2-space indent, no semicolons-vs-semicolons bikeshed (this repo **uses** semicolons), early returns, small helpers next to the call site.
- Tailwind tokens already in use: `slate-950/900/800`, `sky-600` accents, `text-xs` / `text-[11px]` inspector chrome. Do not introduce a second design system.
- Comments only for non-obvious constraints (spherical winding, vertex-count alignment, UTC year handling, cache keys).
- New user-facing map behaviour belongs in `FrameRenderer` so export matches preview.
- New Project fields: add to `types.ts`, default in `createBlankProject` + `createWwiTemplate`, inspector/left panel if editable, renderer if visible. Bump or migrate `version` only with an explicit migrator — current version is `1` and import rejects anything else.

## Invariants (do not break)

1. Preview and export must share `FrameRenderer.render`. Visual bugs that only show in one path mean someone branched drawing.
2. Mutate `Project` only inside `useStudio.update` (or a test that clones first).
3. Preserve aligned vertex counts on zone/line keyframes when the user inserts/deletes a vertex.
4. Zone rings must remain valid polygons (≥ 3 points) and lines ≥ 2 points.
5. Dates in the document are ISO-like UTC strings; round-trip with `parseDate` / `toISODate`.
6. Membership `country` strings must match border `NAME` (and optionally `SUBJECTO`).
7. Do not delete the seeded template project.
8. File repo and Postgres repo must implement the same `Repo` surface.
9. `fast` render is a LOD hint, not a different composition order.
10. Historical geography in the WWI template is data, not decoration — do not “simplify” fronts into random blobs.

## Common changes

**New template (e.g. WWII)**  
Add `src/lib/templates/<name>.ts` exporting `createXTemplate(): Project`. Seed it from `ensureSeeded` with a new `templateKey`. Wire `POST /api/projects` `from` and the home page button. Reuse palettes in `assets.ts`.

**New projection**  
Add the id to `ProjectionId`, a `PROJECTIONS` entry with the correct `family` (`cylindrical` | `conic` | `azimuthal` | `pseudo`). `buildProjection` already branches on family for rotate/center/parallels.

**New marker icon**  
Add to `IconId` and `ICONS` (24×24 viewBox path). Builtin assets pick it up automatically.

**New overlay / HUD widget**  
Extend `Overlays` in `types.ts`, default it in both factories, draw in `drawHud`, expose in `ProjectInspector`.

**New border year**  
Add to `BorderYear`, `BORDER_YEARS` (file prefix + optional `note` if aliased), generate `public/data/borders_<year>_{low,medium,high}.json` via the compiler (or alias an existing snapshot like 1935/1939).

**Pacing / duration**  
`video.duration` is the timeline length. If you change it, keep the last pacing point at `t === duration` or `pacingPoints` will append `time.end` there.

**Autosave / API shape**  
PUT body is `{ data: Project, name?: string }`. `name` is mirrored onto `data.name`. Keep that.

## Out of scope unless asked

- Server-side video encoding or FFmpeg.
- Auth, multi-user, or sharing.
- Mapbox / Leaflet / WebGL. The renderer is Canvas2D by design.
- Editing committed files under `public/data/` by hand.
- Renaming the leftover `nextjs-postgresql-template` package name in a drive-by change.
