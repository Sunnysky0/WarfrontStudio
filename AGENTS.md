# Warfront Animation Studio

Browser studio for frontline mapping videos. Users assign countries and provinces to nations, keyframe territory transfers (auto-drawn advancing fronts), camera, markers, flags, subtitles, then export a frame-accurate MP4 (WebCodecs) or WebM from the browser.

This file is the agent operating manual. Prefer it over rediscovering the tree.

The previous architecture (factions / memberships / painted occupation polygons / Zustand store / optional JSON file repo) is gone. Do not resurrect those files or that document model.

## Commands

```bash
npm install
cp .env.example .env.local   # DATABASE_URL for local Postgres
npm run db:up                # Docker Desktop Compose, else zonky binaries
npm run db:push              # drizzle-kit push --force
npm run dev                  # http://localhost:3000
npm run build
npm run lint
npm run typecheck            # tsc --noEmit
npm run db:down
npm run db:studio            # drizzle-kit studio
```

`DATABASE_URL` is required at runtime. `src/db/index.ts` throws if it is missing. `next build` can still import route modules because the Pool is constructed lazily.

Local Postgres (`scripts/pg-local.mjs`): prefers Docker Desktop Compose (`docker-compose.yml`, postgres:16, bound to `127.0.0.1:5432`). Falls back to zonky binaries in `.cache/pgsql-16` with data in `.data/pgdata`. Loopback to 5432 must stay off any system VPN proxy (`NO_PROXY=localhost,127.0.0.1` in `.env.example`).

Rebuild TopoJSON base maps (needs network, ~6 GB Node heap):

```bash
node --max-old-space-size=6144 scripts/build-basemap.mjs
```

Renderer / region-key smoke (no package script; uses `public/basemap/` via a stub `fetch`):

```bash
npx tsx scripts/smoke.ts
```

There is **no test suite**. After logic changes, run `npm run typecheck`. For renderer/editor work, exercise the studio in the browser: open the Great Asian War template, scrub the timeline, paint a province, assign it, export a short clip.

## Stack

| Piece | Choice |
| --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript strict |
| UI | Tailwind 4 (`src/app/globals.css` is `@import "tailwindcss"`), dark zinc chrome, violet accents |
| State | React state inside `Studio.tsx` (no Zustand) |
| Map | d3-geo + d3-geo-projection, TopoJSON in `public/basemap/` |
| Flags | SVG files in `public/flags/` (`/flags/CN.svg`) plus procedurally drawn custom flags |
| Persist | Drizzle ORM + `pg`. Postgres is required. |
| Export | Client-only: WebCodecs H.264 (`mp4-muxer`) / VP9 (`webm-muxer`), MediaRecorder WebM fallback |

Path alias: `@/*` → `src/*`. `package.json` name is leftover (`nextjs-postgresql-template`); ignore it.

Fonts (Google, loaded in `layout.tsx`): Josefin Sans, Montserrat, Cinzel, Oswald, Share Tech Mono, Inter. Themes pick from those stacks.

## Layout

```
src/
  app/
    page.tsx                 Project list / create / import / delete
    studio/[id]/page.tsx     Server page → client Studio
    api/projects/            GET list + seed, POST create
    api/projects/[id]/       GET / PUT / DELETE
    api/assets/              GET / POST / DELETE custom assets
    api/health/              `select 1` against Postgres
  components/studio/         Entire editor UI (client)
    Studio.tsx               Document state, undo, autosave, keyboard, layout
    MapView.tsx              Canvas preview, pan/zoom, region hit-test, paint
    Panels.tsx               Left tabs: nations / map / assets / help
    Timeline.tsx             Multi-track event editor
    Inspector.tsx            Selected nation / event
    ExportDialog.tsx         MP4 / WebM / PNG
    ui.tsx                   Shared Field, Button, Select, …
  lib/studio/                Domain logic — keep React out of here
    types.ts                 Canonical ProjectDoc (version: 1)
    state.ts                 resolveState(t) — ownership, transfers, HUD
    renderer.ts              Canvas2D MapRenderer
    export.ts                WebCodecs + MediaRecorder
    basemap.ts               Load + cull TopoJSON, region keys, hit-test
    projections.ts           13 projections + camera framing
    drawing.ts               Flags, markers, noise used by frontlines
    themes.ts                MapTheme presets
    presets.ts               emptyProject, colours, flag presets, resolutions
    template.ts              greatAsianWarTemplate()
  db/
    index.ts                 Lazy drizzle Pool (DATABASE_URL required)
    schema.ts                projects + assets tables
public/basemap/              Compiled TopoJSON + cities.json + seas.json
public/flags/                ISO / regional SVG flags
scripts/build-basemap.mjs    Natural Earth + historical-basemaps compiler
scripts/pg-local.mjs         Local Postgres (Docker or zonky)
scripts/smoke.ts             Load basemap + render template frames (stub canvas)
.data/                       Zonky Postgres data (gitignored)
.cache/                      Zonky binaries (gitignored)
```

Keep domain logic in `src/lib/studio/`. Keep React in `src/components/studio/` and `src/app/`. Do not import components from `lib/`.

## Domain: the Project document

The unit of work is a JSON `ProjectDoc` (`src/lib/studio/types.ts`, `version: 1`). Postgres stores it as `projects.data` jsonb. Home-page import/export is that JSON.

Coordinates are **`[longitude, latitude]`** in degrees. Never `[lat, lon]`.

| Field | Role |
| --- | --- |
| `version` | Always `1`. Import should reject anything else until a migrator exists. |
| `name` / `description` | Mirrored onto the `projects` row on PUT. |
| `duration` | Timeline length in **seconds**. |
| `map` | Projection, LOD, border year, theme, layers, output size, default camera. |
| `nations` | Named colours + flags + initial region ownership at `t = 0`. |
| `events` | Timeline clips (camera, territory, HUD, markers, …). |

Element ids come from `uid(prefix)` in `types.ts`.

### Time

One clock: **video time** `t` in `[0, project.duration]`. Playback, export, and the timeline scrubber use this. There is no separate historical-date clock.

Year labels are `year` events: the latest `year` with `start <= t` is shown in the HUD. They do not drive geography.

Event intervals are `[start, end)`. HUD clips (subtitle, text, marker, flags, inset) are visible while `start <= t < end`. Territory ownership commits at `end` (or at `start` when the transfer is instant).

### Nations and region keys

A `Nation` owns a list of region keys at `t = 0`. Later `territory` / `disintegrate` events rewrite ownership.

Canonical ids come from the basemap compiler:

| Key | Meaning |
| --- | --- |
| `c:CHN` | Present-day country, Natural Earth `ADM0_A3` / `ISO_A3`. |
| `c:Austro-Hungarian_Empire` | Historical country; name with spaces → underscores. |
| `p:USA-NY` | Province / admin-1, Natural Earth `adm1_code` (or `iso_3166_2`). |

Author-facing aliases, resolved by `resolveRegionKey` (`basemap.ts`):

| Key | Meaning |
| --- | --- |
| `pn:JPN:Tokyo` | Province by ADM0 code + name (`provinceNameIndex`, accent-insensitive). |
| `cn:Russian Empire` | Country by display name (walks `countries.features`). |

`normalizeName` strips combining marks, lowercases, drops a trailing `prefecture`. Use `pn:` / `cn:` in templates; the resolver maps them to `p:` / `c:` once the basemap is loaded. Unresolved keys stay as written and will not fill.

Country ids on the **present** snapshot are ISO3 (`c:CHN`). On **historical** snapshots they are underscored names (`c:German_Empire`). A project that mixes `c:CHN` with `borderYear: "1914"` will not paint China — switch year or use `cn:`.

Assigning a whole country (`c:IND`) and then transferring provinces (`pn:IND:Punjab`) is valid. `TerritoryEvent.clearProvinces` (default **true**) drops province-level overrides under a country when that country is transferred, so the new owner gets the whole ADM0.

### Events

| `type` | What it does |
| --- | --- |
| `camera` | Interpolates from the previous camera (or `map.defaultCamera`) across `[start, end]`. |
| `territory` | Animates listed regions to `toNation`; commits ownership at `end`. |
| `nationChange` | Crossfades a nation's name / colour / flag / label. |
| `disintegrate` | Splits `from` into `parts[]` (shatter staggers each part). Optional `dissolveRemainder`. |
| `subtitle` | Lower/top/center title card. |
| `text` | Map-anchored or screen-anchored label. |
| `marker` | Battle / nuke / ship / … icon, optional `extra[]` cluster. |
| `flags` | Belligerent flag row (left vs right nation ids). |
| `inset` | Second camera in a corner of the frame. |
| `year` | HUD year string; last one with `start <= t` wins. |

`FrontMode` on territory: `auto` | `radial` | `linear` | `fade` | `instant` | `sweep-from-attacker`. `fromNation` + `origin` / `direction` steer the front. `roughness` (0–1) feeds `ringNoise` so the front is not a perfect circle. `showFrontline` defaults true.

`instant` (or `end <= start`) applies ownership at `start` with no in-flight transfer.

### Camera

`Camera = { lon, lat, scale, roll? }`. `scale` is a d3 projection scale **normalized to a 1920px-wide frame**; `applyCamera` multiplies by `width / 1920` so the same document exports at 720p or 4K.

Scale interpolates in **log space**. Longitude uses shortest-arc lerp. Azimuthal projections (`orthographic`, `satellite`, `stereographic`, `azimuthalEqualArea`) rotate the globe; cylindrical / pseudo rotate longitude and center latitude. Conic conformal recenters parallels around `camera.lat`.

Live pan/zoom in the editor writes `viewCamera` (preview override). “Set keyframe from view” at `t = 0` patches `map.defaultCamera`; otherwise it inserts a `camera` event.

## Rendering

`MapRenderer` (`src/lib/studio/renderer.ts`) is the only place that draws a frame. Preview (`MapView`) and export (`exportVideo` / `exportFrame`) both call `renderer.render(ctx, W, H, t, opts)`.

`resolveState(project, t, resolveKey, provincesOf)` is the pure playback function. The renderer asks it every frame (or accepts a precomputed `opts.state`). Do not duplicate ownership logic in the UI.

Compositing (per viewport, including insets):

1. Background / ocean, optional graticule.
2. Land fill, nation fills (countries + leftover provinces), in-flight transfer masks.
3. Cached line overlay: coast, lakes, rivers, railroads, province mesh, country mesh.
4. Nation outlines, cities, labels.
5. Frontline stroke on active transfers.
6. Markers, map text.
7. Editor overlay (preview only): selection, hover, crosshair.
8. HUD: year, flags, subtitles. Vignette last.

Viewport cache key: projection + rounded camera + size + precision + basemap lod/year. Changing those drops `Path2D` / line-canvas caches. Geometry far from the frame is culled with `partBoxes` / `cullGeometry` (disabled for azimuthal views and antimeridian-spanning frames).

Author stroke widths as 1080p pixels; the renderer scales with frame height.

Export is **client-side only**. Do not add a server encode path unless asked. MP4 uses WebCodecs + `mp4-muxer`; WebM uses WebCodecs + `webm-muxer`. If WebCodecs is missing or fails, `exportVideo` falls back to real-time MediaRecorder WebM. `editorOverlay` must be false for export.

## Editor

`Studio` holds the live `ProjectDoc`, 80-deep undo (`past` / `future` refs), playhead, tool, selection (region keys), selected nation/event, and a `MapRenderer` instance.

**Every document mutation** goes through `setProject(updater, record = true)`:

```ts
setProject((p) => ({ ...p, /* next */ }));
```

Pass `record = false` only for transient in-gesture updates that should not create an undo step. Do not mutate `project` in place.

Autosave: when `saveState === "dirty"`, PUT `/api/projects/:id` with `{ data: project }` after **4 s**. Ctrl/Cmd+S saves immediately. PUT mirrors `data.name`, `data.description`, `data.duration` onto the row.

Tools (`MapView`): `select` (click/drag-paint regions), `pan`, `marker` (click places a marker event), `pick` (one-shot lon/lat callback for inspector fields). Region mode is `country` | `province`. Shift-click adds to the selection set.

Keyboard (ignored while typing in inputs): Space play/pause, arrows ±0.5 s (Shift ±5 s), Home, Delete/Backspace selected event, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo, Ctrl/Cmd+D duplicate event, Esc clear selection / cancel pick.

Studio chrome: header | left `Panels` | `MapView` | right `Inspector` | bottom `Timeline` | `ExportDialog`. Shared controls live in `ui.tsx`.

## Persistence

Postgres via Drizzle (`src/db/schema.ts`):

- `projects` — `id`, `name`, `description`, `data` jsonb (`ProjectDoc`), `thumbnail`, `duration_seconds`, timestamps.
- `assets` — user-uploaded flags/images/markers (`kind` + data-URL, max 2 MB).

`GET /api/projects` calls `ensureSeed()`: if the table is empty, inserts `greatAsianWarTemplate()`. Unlike the old file-repo, the seed is **not** protected from deletion.

Create project POST body: `{ name?, template?: "great-asian-war", data? }`. Missing both template and data → `emptyProject()`.

Studio page is a server component that loads the row and passes `row.data` into `<Studio>`. `dynamic = "force-dynamic"` on API routes and the studio page.

## Base map data

Compiled TopoJSON in `public/basemap/`:

| File prefix | Source |
| --- | --- |
| `land`, `lakes`, `rivers`, `provinces`, `railroads` | Natural Earth (public domain) |
| `countries-present-*` | Natural Earth admin-0 |
| `countries-YYYY-*` | aourednik/historical-basemaps (CC BY-NC-SA) |
| `cities.json` | Compact rows `[name, lon, lat, rank, cap, pop, adm0]` |
| `seas.json` | Compact rows `[name, lon, lat, rank, class, area]` |

Each polygon/line layer has `low` / `medium` / `high`. Loader: `loadBasemap(lod, year)` → `Basemap`. Present-day countries use NE 110m / 50m / 10m by LOD; historical years reuse one GeoJSON simplified to three weights.

`1935` is the 1930 historical file; `1939` is the 1938 file (`HIST_YEARS` in `build-basemap.mjs`).

Do not hand-edit JSON under `public/basemap/`. Change `scripts/build-basemap.mjs` and rebuild. Download cache is `/tmp/ne-cache` (outside the repo).

ISO flags live in `public/flags/{CODE}.svg`. `FlagSpec.kind === "iso"` loads `/flags/CN.svg`. Custom flags are drawn in `drawing.ts` (stripes + emblem).

## Templates and presets

`greatAsianWarTemplate()` in `src/lib/studio/template.ts` is the feature tour (2022–2034, 120 s, neon-noir, present borders). Helpers at the top (`nation`, `year`, `cam`, `sub`, `terr`, `marker`, `change`) are the preferred way to add template content. Reset `counter = 0` at the start of the factory so ids are stable.

When adding a user-visible capability, **show it in the template**.

`emptyProject()` (`presets.ts`) is a 60 s blank with a single `year` event. Default theme `neon-noir`, projection Mercator, LOD medium, border year present, 1920×1080.

Themes (`themes.ts`): `neon-noir`, `classic-atlas`, `blueprint`, `minimal-light`, `blood-iron`, `satellite-night`. `getTheme` falls back to the first.

Flag / colour presets in `presets.ts` include historical empires and the Great Asian War fictional flags (Heavenly Republic, Purification Zone, PDTO, …). `findFlagPreset(name)` throws if the name is missing — keep template strings in sync with `FLAG_PRESETS`.

## Conventions

- TypeScript only. Strict. No `any` unless crossing TopoJSON/GeoJSON JSON (the smoke script is the exception).
- Functional components + hooks. Studio files are `"use client"`.
- Server routes stay tiny: seed, drizzle, JSON. No rendering on the server.
- Match surrounding style: 2-space indent, semicolons, early returns, small helpers next to the call site.
- Tailwind already in use: `zinc-950/900/800`, `violet-600` accents, `text-xs` / `text-[11px]` inspector chrome. Do not introduce a second design system.
- Comments only for non-obvious constraints (region-key aliases, transfer commit timing, camera scale normalization, cache keys).
- New user-facing map behaviour belongs in `MapRenderer` so export matches preview.
- New `ProjectDoc` fields: add to `types.ts`, default in `emptyProject` + `greatAsianWarTemplate`, inspector/panels if editable, renderer if visible. Bump `version` only with an explicit migrator.

## Invariants (do not break)

1. Preview and export must share `MapRenderer.render`. Visual bugs that only show in one path mean someone branched drawing.
2. Mutate `ProjectDoc` only inside `setProject` (or a test that clones first).
3. Coordinates are `[lon, lat]`.
4. `camera.scale` is 1920px-normalized; never bake the export width into stored projects.
5. Territory ownership commits at `end` unless the event is instant. In-flight transfers are masks, not committed ownership.
6. Region keys in templates should resolve via `resolveRegionKey` against the intended `borderYear`. Run `scripts/smoke.ts` after changing keys.
7. Do not hand-edit `public/basemap/*`.
8. Do not add a server-side encoder.
9. `DATABASE_URL` stays required; do not reintroduce a file-repo unless asked.
10. Historical / scenario geography in the Great Asian War template is data, not decoration — do not “simplify” fronts into random blobs.

## Common changes

**New template (e.g. WWII)**  
Add `src/lib/studio/<name>.ts` exporting `createXTemplate(): ProjectDoc`. Wire `POST /api/projects` `template` and the home-page button. Reuse colours/flags in `presets.ts`. Prefer `pn:` / `cn:` keys.

**New projection**  
Add the id to `ProjectionId` and `PROJECTIONS`. Implement construction in `createProjection`. Extend `isAzimuthal` / `applyCamera` if it is not a standard cylindrical.

**New marker kind**  
Add to `MarkerKind`, `MARKER_KINDS`, and `drawMarker` in `drawing.ts`.

**New theme**  
Push a `MapTheme` onto `THEMES`. Id is what `map.theme` stores.

**New overlay / HUD widget**  
New event type in `types.ts` (add to the union, `EVENT_TYPE_LABELS`, `TRACK_ORDER`), handle in `resolveState`, draw in `renderHud` / `renderScene`, factory in `Studio.addEvent`, fields in `Inspector`.

**New border year**  
Add to `BorderYear` + `BORDER_YEARS`. Add a `HIST_YEARS` row in `build-basemap.mjs` (or alias an existing snapshot like 1935/1939) and rebuild.

**New layer**  
Add to `LayerId`, `ALL_LAYERS`, `LAYER_LABELS`, `defaultLayers()`, load in `loadBasemap`, draw behind a `map.layers.*` flag in the renderer.

**Autosave / API shape**  
PUT body is `{ data: ProjectDoc, name?, thumbnail? }`. `data` drives name/description/duration. Keep that.

## Out of scope unless asked

- Server-side video encoding or FFmpeg.
- Auth, multi-user, or sharing.
- Mapbox / Leaflet / WebGL. The renderer is Canvas2D by design.
- Editing committed files under `public/basemap/` by hand.
- Reintroducing the file-repo / Zustand store / zone-polygon document model.
- Renaming the leftover `nextjs-postgresql-template` package name in a drive-by change.
