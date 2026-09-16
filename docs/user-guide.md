# Warfront Animation Studio — User Guide

[中文指南](./user-guide.zh-CN.md)

Browser studio for **frontline mapping videos**. You assign countries and provinces to nations, keyframe territory transfers (auto-drawn advancing fronts) or **draw a frontline** that is not stuck to provincial borders, then export a frame-accurate **MP4** or **WebM** from the browser.

This guide is for people using the studio, not for developers. The in-app **Field guide** (workspace rail, or Help inside a project) is a short checklist; this document is the full walkthrough.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Start it locally](#2-start-it-locally)
3. [Ten-minute first project](#3-ten-minute-first-project)
4. [The workspace](#4-the-workspace)
5. [Studio layout](#5-studio-layout)
6. [Map and project settings](#6-map-and-project-settings)
7. [Nations and flags](#7-nations-and-flags)
8. [Selecting and painting territory](#8-selecting-and-painting-territory)
9. [Time, scenes, and the timeline](#9-time-scenes-and-the-timeline)
10. [Event types](#10-event-types)
11. [Camera](#11-camera)
12. [Frontlines (territory transfers)](#12-frontlines-territory-transfers)
13. [Nation transitions and disintegration](#13-nation-transitions-and-disintegration)
14. [Story layer: year, subtitles, text, markers, flags, insets](#14-story-layer-year-subtitles-text-markers-flags-insets)
15. [Assets](#15-assets)
16. [Saving, undo, and JSON import](#16-saving-undo-and-json-import)
17. [Export](#17-export)
18. [Keyboard shortcuts](#18-keyboard-shortcuts)
19. [Region keys (advanced)](#19-region-keys-advanced)
20. [Tips and pitfalls](#20-tips-and-pitfalls)

---

## 1. What you need

| Need | Notes |
| --- | --- |
| A desktop browser | **Chrome or Edge** recommended. MP4 export uses WebCodecs (H.264). Firefox and older Safari fall back to real-time WebM recording. |
| Postgres | Required. The studio will not load a workspace without `DATABASE_URL`. |
| Local run | Node.js, then either Docker Desktop **or** the bundled Postgres binaries. |
| Screen | The editor is a dense desktop layout (header, rail, map, inspector, timeline). Use a wide window. |

Video is encoded **in your browser**. There is no server-side encoder and no cloud render queue. Keep the tab open until export finishes.

Preview and export share the same map renderer. What you see on the canvas (minus editor overlays such as selection highlights and the stage captions around the canvas) is what the file will contain.

---

## 2. Start it locally

From the project folder:

```bash
npm install
cp .env.example .env.local
npm run db:up
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- `npm run db:up` prefers **Docker Desktop** (`postgres:16` on `127.0.0.1:5432`). If Docker is not running, it falls back to bundled Postgres binaries under `.cache/pgsql-16` with data in `.data/pgdata`.
- If a system VPN is proxying loopback, local Postgres will fail. Keep `NO_PROXY=localhost,127.0.0.1` in `.env.local` (already in `.env.example`).
- The first time the workspace loads and the projects table is empty, a copy of **The Great Asian War** is seeded automatically. That seed is not protected — you can delete it.

Stop the database with `npm run db:down` when you are done.

---

## 3. Ten-minute first project

The fastest way to learn is to open the template, not a blank world.

1. On the home page, open **Templates** (or **New project**) and click **Open a fresh copy** under **The Great Asian War**.
2. Wait for the basemap to finish loading (status bar, or “Loading basemap…” on the canvas).
3. Press **Space** (or **Preview** in the header) and watch 2022–2034 play through: Taiwan crisis, coup, Pakistani intervention, the People’s Heavenly Republic, India’s split, Purification Zones, an Australia inset.
4. Click clips on the **timeline**. The right **Properties** panel switches to that event.
5. Pause. Click the Taiwan landing clip on the **Drawn frontline** track — that beachhead is a drawn lobe, not the whole of Pingtung. Switch **Unit** to **Provinces**, paint a region, and **Create event** for a political transfer if you want the auto-drawn kind.
6. Pan and zoom the map, then click the crosshair on the toolbar (**Set a camera keyframe from the current view**).
7. **Export video**, set a short range (for example 0–5 s), 720p, 30 fps, and download an MP4.

When you are ready to author from scratch, create a **Blank project**, pick a border year, add nations, paint starting territory, then add events.

---

## 4. The workspace

The home page is a four-pane workspace with the same header / rail / status bar as the studio.

| Rail pane | What it is |
| --- | --- |
| **Projects** | Your saved projects. Search by name or description. Click a card to open the studio. Hover a card to delete (in-card confirm, not a browser dialog). |
| **Templates** | Start from **The Great Asian War**, a **blank** world, or **import JSON**. |
| **Assets** | Catalogue of what ships with the studio (basemap layers, historical years, event types, export formats) — not your uploads. |
| **Guide** | The short six-step field guide and a shortcut list. |

**New** on the projects pane:

- **Blank project…** — 60 s, Mercator, present-day borders, Neon Noir theme, one year marker (`1914`). You can name it on the Templates pane.
- **The Great Asian War** — 120 s feature tour (2022–2034, neon-noir, present borders). Every event type is used on purpose.
- **Import JSON…** — load a project document (see [JSON import](#json-import)).

The workspace status bar shows how many projects are stored, and whether Postgres is reachable.

---

## 5. Studio layout

Outside in:

```
Header          Wordmark, rename, save state, undo/redo, Preview, Export
Menu bar        File / Edit / View / Help + breadcrumb back to the workspace
[ Rail | Left panel? |  Scene strip → Map toolbar → Map canvas → View bar  | Inspector? ]
                 Timeline   (spans the map + inspector, not the rail or left panel)
Status bar
```

Panel sizes and open/closed state are **editor-only**. They are never saved into the project, so they cannot desync preview from export.

### Header

- Click the project title to rename it. Duration is shown as a pill (`120s`).
- Save state: **All changes saved** / **Unsaved changes** / **Saving…** / **Save failed — retry**.
- **Preview** plays or pauses the timeline on the canvas. It is not a separate window.
- **Export video** is disabled until the basemap has loaded.

### Left rail

| Tab | Role |
| --- | --- |
| **Layers** | Visibility switches for the 15 map layers, plus a project card that opens Map properties. |
| **Nations** | List of sides. Counts are regions owned **at the playhead**. |
| **Assets** | Flag presets, your uploads, marker kinds, colour palette. |
| **Guide** | The studio field guide and shortcuts. |

The arrow at the bottom of the rail returns to the workspace. **View → Left panel / Properties panel** hides a column without changing the document.

### Scene strip

There is **no scenes model** in the project file. “Scene 03 · title” is derived:

- The latest **year** event with `start ≤ playhead` numbers the chapter (`01`, `02`, …).
- The **subtitle** active at the playhead titles it; if none, the year text is used.

The jump menu seeks to each year event. **+** adds a year marker at the playhead. The same title is shown as a caption on the **stage surround** (around the canvas, not on the video).

### Map toolbar

- Tools: **Select regions**, **Pan**, **Place marker**.
- **Unit**: **Countries** or **Provinces** — what a click hits.
- Crosshair: **Set a camera keyframe from the current view**.
- Eye: toggle **HUD preview** (year, flags, subtitles) in the editor only. Export still draws HUD from events.
- Resolution dropdown: the project’s output size (canvas and default export).

### Map canvas

The canvas is the video frame. Corner labels on the dark surround (name, size × duration, scene caption, cursor lat/lon) are **not** burned into the export.

### View bar (under the map)

Tool hint, **Free camera** chip when you have panned/zoomed off the timeline, lat/lon, zoom − / +, and a reset that re-attaches the preview to the timeline camera.

### Inspector (right)

Three modes: **Map** | **Event** | **Nation**. Selecting a clip or a nation switches the mode and opens the panel in the same click.

If any regions are painted, a **Map selection** block is pinned **above** the mode switch so “hand these to a nation” is never a tab away.

### Timeline

Ten tracks, one per event type. See [§9](#9-time-scenes-and-the-timeline).

### Status bar

Save state, border year, projection, basemap load, description, output size, and a **Shortcuts** button that opens the field guide.

---

## 6. Map and project settings

Open **Map** in the inspector, or click the project card at the top of **Layers**.

Layers (left) are **visibility**. Map properties (right) are **configuration**. Both write the same project fields.

### Project

Title and description. The title is also editable in the header. Description appears in the workspace card and the status bar.

### Historical borders

| Year | Basemap |
| --- | --- |
| Present day | Natural Earth admin-0 |
| 2010, 1994, 1960, 1945, 1920, 1914, 1900 | Historical country polygons |
| 1935 | Closest snapshot is **1930** |
| 1939 | Closest snapshot is **1938** |

**Provinces are always modern admin-1 units**, even on a 1914 country map. That is a data limitation, not a bug.

Country ids change with the year. Present-day China is `c:CHN`. On a 1914 map the same land is a historical name such as `c:China` / `cn:…`. A project that mixes `c:CHN` with **border year 1914** will not paint China — switch the year, or use name-based keys (`cn:` / `pn:`). See [§19](#19-region-keys-advanced).

Changing year or detail level reloads the basemap (spinner in the status bar).

### Projection

| Projection | Typical use |
| --- | --- |
| Mercator | Default; regional campaigns |
| Equirectangular (Plate Carrée) | Simple world |
| Robinson, Natural Earth, Equal Earth, Winkel Tripel, Miller, Mollweide | World maps with less polar stretch |
| Orthographic (Globe) | Spinning globe |
| Satellite (Tilted Globe) | Dramatic globe |
| Stereographic, Azimuthal Equal Area | Polar / regional globe |
| Lambert Conic Conformal | Mid-latitude theatres |

Globe-style projections rotate the sphere; cylindrical ones pan longitude and centre latitude. Conic conformal recenters its parallels on the camera latitude.

### Map detail (LOD)

| Level | Weight | When |
| --- | --- | --- |
| Low | 1:110m | Fast drafting |
| Medium | 1:50m | Default |
| High | 1:10m | Final export, tight coasts |

High is heavier. Draft on medium, switch to high before a 1080p/4K export if coasts matter.

### Theme (look of the **video**)

Themes colour the canvas/export only. The dark green studio chrome does not change.

- Neon Noir (Fire Rises)
- Classic Atlas (Parchment)
- Cold War Blueprint
- Minimal Light
- Blood & Iron
- Night Lights

### Density and style

- **Label scale** — nation / country / city type size.
- **City density** / **Sea label density** — how many names survive crowding.
- **Projection precision** — adaptive resampling. Lower values smooth curves and cost more to draw.
- **Coastline glow** — on/off.

### Output resolution

Presets: 720p, 1080p, 1440p, 4K, square 1080, vertical 1080×1920. Width/height can be set by hand (even numbers). This is the **document** size: the preview canvas and the default export size. The export dialog can override it for one render.

Camera scale is stored independently of pixel width, so the same project can export at 720p or 4K without re-keyframing.

### Default camera

Longitude, latitude, scale used **before the first camera keyframe**. **Use current view** copies the live preview. Setting a keyframe at `0:00` also writes this default (it does not insert a camera clip).

### Layers (left panel)

Fifteen switches, grouped:

| Group | Layers |
| --- | --- |
| Nation layers | Nation outlines, nation labels, neutral country labels |
| Base map | Land fill, coastlines, country borders, provinces (admin-1), lakes, rivers, railroads |
| Labels & cities | Cities, city labels, sea / ocean labels |
| Atmosphere | Graticule, vignette / atmosphere |

The badge `N/15 on` is how many are visible. Search filters the list. Toggling a layer **is** part of the project and **does** affect export.

At the bottom of Layers, **Auto-draw frontlines** hands the current map selection to the selected nation (or the first nation) as a 3-second auto frontline.

---

## 7. Nations and flags

A **nation** is a named colour + optional flag + the region keys it owns at `0:00`. Later **Territory** and **Disintegration** events rewrite ownership. The map never “paints occupation polygons” by hand — you assign regions.

### Create a nation

1. Optionally paint countries/provinces first (they become starting territory).
2. Open **Nations** and press **+**, or use the empty-state **New nation** button.
3. The inspector opens on **Nation**: name, colour (picker or palette chips), flag, optional note.
4. **Initial territory** lists region chips. Add from the map selection, replace, search by name, or **Show on map**.

Deleting a nation asks for confirm. Timeline events that still name that nation **stay**; they will simply have nothing to colour until you retarget them.

The number on each row in the Nations list is how many regions that side owns **right now** (at the playhead), not how many are in the initial list.

### Flags

In the nation inspector (or a nation-change / belligerent-flags event):

| Kind | How |
| --- | --- |
| Preset | Countries (ISO), Historical (Russian Empire, German Empire, Qing, …), Great Asian War fiction (Heavenly Republic, PDTO, …) |
| Any ISO code | Two-letter code; loads `/flags/CN.svg` and so on |
| Image URL / data URL | Your upload, or a URL |
| Custom builder | Horizontal / vertical / solid stripes, comma-separated colours, optional emblem (star, sun, crescent, cross, diamond, octastar, hammer, trident, circle) with size and x/y |

Select a nation first, then click a preset or colour in the **Assets** panel to apply it.

Label overrides: pick a lon/lat (crosshair → click the map), scale, colour, or hide the label.

---

## 8. Selecting and painting territory

Set **Unit** to **Countries** or **Provinces**. Use the **Select** tool (arrow).

| Action | Result |
| --- | --- |
| Click a region | Select only that region |
| Shift-click | Add to the selection |
| Ctrl/Cmd-click | Toggle that region |
| Shift-drag | Paint: every region the pointer crosses is added |
| Click empty ocean | Clear the selection (unless Ctrl/Cmd is held) |
| Esc | Clear the selection (also cancels a lon/lat pick) |
| Drag without Shift | Pan (even in Select). Wheel zooms toward the cursor |

Hover shows the region name. The view bar and the bottom-right stage caption show lat/lon.

Selected regions highlight on the canvas (editor overlay — **not** exported).

### Hand selection to a nation

With a non-empty selection, the inspector’s **Map selection** block offers:

1. **Transfer at playhead** — nation, animation mode, duration in seconds → **Create event**. This inserts a Territory clip starting now. The selection then clears.
2. **Add to “Name” initial territory** — only if a nation is selected. This changes `t = 0` ownership, not a later conquest.

You can also add/replace regions on an existing Territory event, a disintegration successor, or a nation’s initial list via **Add selection**.

---

## 9. Time, scenes, and the timeline

There is **one clock**: video time `t` from `0` to the project **duration** (seconds). Playback, the scrubber, and export all use it. Year labels are HUD text; they do not drive geography.

Event intervals are `[start, end)`.

- HUD clips (subtitle, map text, marker, flags, inset) are visible while `start ≤ t < end`.
- Territory ownership **commits at `end`**, except **instant** transfers (or `end ≤ start`), which commit at `start`. While a front is in flight you see a mask, not the final owner.

### Transport

- Play / pause: Space, header **Preview**, or the timeline play button.
- Jump to start: Home, or the skip-back button.
- Jump to end: skip-forward button (no End key).
- Nudge: ← / → by 0.5 s, Shift+arrows by 5 s.
- Scrub: drag on the time ruler.

Playback stops at the duration. The numeric field next to the time display **is** the project length; raise it before you need clips past the old end.

### Clips

- Click a clip to select it and open Event properties.
- Drag the body to move; drag either edge to trim. Minimum length while dragging is 0.1 s.
- **Magnet** snaps to **¼ second**. Turn it off for fine timing.
- Zoom the timeline with − / slider / + (pixels per second).
- **Duplicate** (Ctrl/Cmd+D) places a copy immediately after the original, same length.
- **Delete** (Delete or Backspace) removes the selected event.

The **+** on the Tracks header adds an event **at the playhead**. Defaults (duration, text, and so on) are listed under each type in [§10](#10-event-types).

### Tracks

Order, top to bottom:

Year counter → Camera → Territory / Frontline → Disintegration → Nation transition → Marker → Map text → Subtitle → Belligerent flags → Inset map

Overlapping clips on one type stack into extra lanes.

**Lock** (padlock on the track header): clips stay selectable but cannot be dragged. **Collapse** (eye): hides the lane in the editor. Neither flag is saved, and **neither changes the video**.

---

## 10. Event types

Every clip has a timeline **label** (optional) plus **start** and **end** in seconds.

| Type | What it does | Default length when added |
| --- | --- | --- |
| **Year counter** | HUD year (or any short string) top-left. Latest year with `start ≤ t` wins. | 1 s (the window does not have to cover the whole chapter) |
| **Camera** | Interpolates from the previous camera (or the default) to this target across `[start, end]`. | 3 s |
| **Territory / Frontline** | Animates listed regions to a nation; commits ownership at `end`. | 3 s |
| **Disintegration** | Splits a nation into successor parts. | 3 s |
| **Nation transition** | Crossfades name / colour / flag / label. | 2 s |
| **Marker** | Battle, nuke, ship, … at a lon/lat; optional extra points for a cluster. | 4 s |
| **Map text** | Uppercase label on the map (or you can still pick an anchor). | 4 s |
| **Subtitle** | Title card: bottom-left, top-centre, or centre; plain glow or boxed. | 4 s |
| **Belligerent flags** | Two rows of flags in the HUD (left vs right). | 10 s |
| **Inset map** | Second camera in a corner of the frame. | 10 s |

---

## 11. Camera

A camera is **longitude, latitude, scale** (optional roll on globes). Scale is a zoom factor normalized to a 1920 px-wide frame — you do not bake 4K into the number.

### Live view vs timeline camera

Pan (drag) and zoom (wheel, or − / + on the view bar) write a **preview override**. A **Free camera** chip appears. The timeline has not changed yet.

- **Follow timeline camera** (undo icon on the toolbar, the chip itself, View menu, or the reset button on the view bar) drops the override.
- **Set keyframe from view** (crosshair):
  - At **0:00** → writes **default camera**.
  - After 0:00 → inserts a **Camera** event ending at the playhead (starting 3 s earlier, clamped to 0).

On a Camera clip, **Use current view as target** copies the live camera into that keyframe. Easing: ease in-out (default), ease out, ease in, linear.

Scale interpolates in log space (zooms feel even). Longitude takes the shortest arc across the date line.

**Pick** mode (crosshair next to a lon/lat field): the toolbar pulses “Click the map to pick a point — Esc cancels”, then returns to the previous tool.

---

## 12. Frontlines (territory transfers)

A Territory event lists **regions**, a **to** nation, optional **from / attacker** nation (steers the sweep), a **mode**, optional **origin** or **direction**, **roughness** (0–1, noisy front instead of a perfect circle), **easing**, **draw glowing frontline**, and **country transfer clears province overrides** (on by default).

### Modes (Properties)

| Mode | Look |
| --- | --- |
| **Auto frontline (from attacker)** | Default. Sweeps from the attacker’s heartland (or the to-nation if from is empty). Tiny regions fade instead. |
| **Radial sweep from origin** | Circle from a lon/lat you pick (or the region centre). |
| **Linear front (direction)** | Straight front. Direction in degrees: **0 = east, 90 = north, −90 = south**. |
| **Fade** | Cross-dissolve, no marching line. |
| **Instant** | Ownership jumps at `start`; no in-flight mask. |

Roughness feeds the irregular edge so the line is not a compass circle. Turn **Draw glowing frontline** off for a quiet fade.

### Country vs province transfers

You may assign a whole country (`China`) and later transfer provinces (`Punjab`). When a **country** is transferred, **Country transfer clears province overrides** (default on) drops province-level exceptions under that country so the new owner gets the entire ADM0.

If the front never appears:

- The region keys must exist on the **current border year** (see [§19](#19-region-keys-advanced)).
- The **to** nation must still exist.
- `end` must be after `start` unless the mode is instant.
- You are looking at a time inside `[start, end)` — after `end` the land is simply that nation’s colour.

### Drawn frontline

When the war should **cut through provinces**, add a **Drawn frontline** clip (timeline **+**, or the spline tool on the map toolbar). This does **not** change who owns a region key. It paints an occupation overlay from a polyline you draw.

1. Add the clip at the playhead (default 8 s). Occupier = the selected nation.
2. Click the map to drop vertices. Double-click or **Enter** finishes a keyframe. Click near the first vertex to close a ring (landing / pocket).
3. Scrub. **Set a frontline keyframe at the playhead** (spline button on the toolbar, or Properties) snapshots the interpolated line so you can drag it.
4. Drag handles to edit. Click a segment to insert a vertex. Empty-map click on a keyframe sets the **captured side** (which half of the line is occupied).
5. Properties: occupier / defender, clip fill to both sides’ land (default) or a frozen region list, fill, glow, closed, **hold last shape after the clip ends**.

Clip fill to **both sides** when a defender is set, otherwise the fill is land plus a pad around the line so a local landing does not paint Eurasia.

Hold (default on for new clips; the Great Asian War campaigns turn it off and follow with an instant Territory commit) keeps the last keyframe painted after `end`. Turn it off if the overlay should vanish, or add a Territory event when the political map should match.

Coordinates are **longitude, latitude**. Do not draw a single line across the date line — use two clips.

---

## 13. Nation transitions and disintegration

### Nation transition

Pick a nation, optionally a **new name**, **new colour**, **new flag**, and a new label position. Colour and name **crossfade** between start and end (for example Russian Empire → RSFSR). The flag switches around the midpoint.

Leave name empty to keep the old one. Tick **Change colour** only when you want a recolour.

### Disintegration

1. Add a **Disintegration** event.
2. **Nation that breaks apart** = the parent.
3. Mode: **Shatter (staggered)** (successors appear in sequence), **Fade together**, or **Instant**.
4. **Dissolve everything else the nation owned** — parent is emptied of leftover land. Optionally send the remainder to another nation.
5. **Add successor state** — uses the current map selection as that part’s regions. Repeat. Each successor has its own nation picker and region list.

Create the successor **nations** first (name, colour, flag) so you can point each part at them.

---

## 14. Story layer: year, subtitles, text, markers, flags, insets

### Year counter

The string is shown in the HUD from that time onward until a later year event. It can be `2022`, `Winter 1914`, or any label. Scene numbers in the strip come from the **order** of year events, not from the text.

### Subtitle

Body text, **plain (glow)** or **boxed**, position **bottom-left**, **top-centre**, or **centre**. Active subtitles also title the scene strip.

### Map text

Multi-line text, drawn uppercase on the map at a lon/lat. Size and colour. **Pick** the anchor on the map. (These sit in the frame, unlike the DOM captions around the canvas.)

### Markers

| Icon | Typical use |
| --- | --- |
| Nuclear strike | Strategic attack |
| Explosion / strike | Generic blast |
| Fire / bombardment | Cities on fire |
| Battle (crossed swords) | Land battle |
| Massacre / disaster | Skull |
| Capital / key point | Star |
| Naval landing | Ship |
| Air raid | Plane |
| Armored offensive | Tank |
| Flag / occupation | Raised flag |
| Chemical weapons | Gas |
| Ballistic missile | Missile |
| Siege | Siege |
| Revolt / uprising | Revolt |

Ways to place one:

- **Place marker** tool: choose the kind on the toolbar, click the map. Clip starts at the playhead, 4 s long, at that lon/lat.
- **Assets → Markers**: drops the kind at the **view centre**.
- Timeline **+ → Marker**.

Properties: size, colour, pulse, and **extra positions** (pick more points for a barrage).

### Belligerent flags

HUD row, usually top-left: **left** side vs **right** side. Each side has a label, optional faction emblem, and checkboxes for nations. The **first checked** nation on a side gets the large flag.

### Inset map

A second camera in a corner (`bottom-right` default). Title, lon/lat/scale (or **Use current view**), width and height as fractions of the frame (about 0.3 × 0.36 by default). Insets render with the same layers and theme as the main map.

---

## 15. Assets

Studio **Assets** tab (not the workspace catalogue):

- **Flag presets** — click to assign to the **selected** nation.
- **Your uploads** — PNG / SVG / JPG as a data URL, stored in Postgres, **max 2 MB**, reusable in every project. Optional name, then **Upload an image**. Delete with the small trash badge. Click to apply as an image flag.
- **Markers** — see above.
- **Colour palette** — historical and scenario swatches (PRC Maroon, Entente Blue, …) applied to the selected nation.

The workspace **Assets** pane is only a list of built-in capabilities.

---

## 16. Saving, undo, and JSON import

### Autosave

Edits mark the project **dirty**. After **4 seconds** idle the studio PUTs the full document to the server. **Ctrl/Cmd+S** (File → Save, or the cloud icon) saves immediately.

The cloud icon in the header is the save button. If you see **Save failed — retry**, Postgres is down or the network dropped; fix that and save again.

Closing the tab with unsaved dirty state can lose the last few seconds of edits. Wait for **All changes saved** before you walk away.

### Undo

Up to **80** document steps. **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** or **Ctrl/Cmd+Y** redo. Transient drags (moving a clip, panning) do not flood history: the undo step is committed when you release.

Chrome (open panels, selected tabs, track lock/collapse, timeline zoom, free camera) is **not** in the undo stack and is **not** saved.

### JSON import

On the workspace, import a `.json` **project document**: the object with `version`, `name`, `description`, `duration`, `map`, `nations`, `events`.

- `version` must be **1**. There is no migrator for other versions.
- Coordinates in the file are `[longitude, latitude]` in degrees — never `[lat, lon]`.
- The studio does **not** currently offer “Download JSON” in the UI. Projects live in Postgres and autosave there. To archive a file, copy the `data` object from a project you already have (or keep the file you originally imported).

The first empty database is seeded with the Great Asian War template; importing another JSON creates a **new** row.

---

## 17. Export

**Export video** (header or File menu) opens a modal.

| Field | Options |
| --- | --- |
| Format | **MP4 (H.264)** or **WebM (VP9)** |
| Resolution | Project size, or 720p / 1080p / 1440p / 4K / square / vertical |
| Frame rate | 24 / 30 / 60 |
| Bitrate | 1–80 Mbps (default 12) |
| Start / End | Seconds; defaults to the full duration |

The dialog shows frame count (`seconds × fps`). **Render & download** starts encoding. Progress is per frame when WebCodecs is available.

- **Chrome / Edge** (and recent Safari with WebCodecs): offline, frame-accurate encode. Keep the tab in the foreground if the browser throttles background tabs.
- If WebCodecs is missing or fails: **real-time WebM** via MediaRecorder (the playhead is recorded as it runs). This is slower and not frame-perfect.
- **Escape** closes the dialog unless a render is in progress (so a stray Esc cannot kill an encode).
- **PNG snapshot** downloads the current playhead as a still at the chosen resolution (HUD included, editor overlays not).

Export uses the **same renderer** as preview: layers, theme, ownership, fronts, HUD events. It does **not** include selection highlights, hover, the pick crosshair, or the DOM captions around the canvas.

**HUD preview** off in the editor only hides HUD while you work; exported files still draw year / flags / subtitles from events.

Leave the tab open. A 120 s 1080p30 clip is thousands of frames; 4K and 60 fps cost more CPU and produce larger files.

---

## 18. Keyboard shortcuts

Ignored while the cursor is in an input, textarea, or select.

| Shortcut | Action |
| --- | --- |
| Space | Play / pause |
| ← → | Nudge playhead 0.5 s |
| Shift+← / Shift+→ | Nudge 5 s |
| Home | Jump to 0:00 |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| Ctrl/Cmd+D | Duplicate selected event |
| Delete or Backspace | Delete selected event (front tool: last draft vertex, or selected handle) |
| Enter | Finish a frontline draft as a keyframe |
| Ctrl/Cmd+S | Save now |
| Esc | Cancel frontline draft; else clear map selection / cancel pick / leave front tool |

Menus show ⌘ on macOS and Ctrl elsewhere. There is no shortcut for tools; use the toolbar or **View**.

---

## 19. Region keys (advanced)

Every country and province has a stable id. You usually never type these — you click the map or search by name in a region list. They matter when a fill does not appear, or when you import JSON / edit a template.

| Key | Meaning | Example |
| --- | --- | --- |
| `c:CHN` | Present-day country (ISO3 / ADM0_A3) | China on **present** borders |
| `c:Austro-Hungarian_Empire` | Historical country; spaces → underscores | 1914 snapshot |
| `p:USA-NY` | Province / admin-1 code | New York |
| `pn:JPN:Tokyo` | Province by country code + name | Accent-insensitive; trailing “prefecture” ignored |
| `cn:Russian Empire` | Country by display name | Walks the loaded country features |

`pn:` and `cn:` are author-facing aliases. Once the basemap is loaded they resolve to `p:` / `c:`. Unresolved keys stay as written and **will not fill**.

Search in a region list (type at least two characters) adds the canonical id for you.

**Present** snapshot uses ISO3 (`c:CHN`). **Historical** snapshots use underscored names. Match keys to **Historical borders**.

---

## 20. Tips and pitfalls

**Start from the template.** The Great Asian War is a worked example of every event type, not just a story.

**Paint, then assign** for political transfers. **Draw a frontline** when the war should cut through provinces — the spline tool, not region paint.

**Default camera vs camera clips.** Framing at `0:00` is the default camera. Later moves are Camera events that interpolate from the previous target.

**Free camera is a preview.** If the map does not follow the timeline, click **Free camera** or the reset control.

**Instant vs animated conquest.** Duration 0 or mode Instant commits immediately. A 3 s auto front needs `[start, end)` covering the shot you are looking at.

**Clear provinces.** Leaving this on when transferring a whole country avoids “Swiss cheese” leftover provinces in the old owner’s colour.

**Year is a label.** Changing the year event does not change 1914 borders. Use **Historical borders** for that.

**HUD toggle is editorial.** Export still composites year, flags, and subtitles.

**High LOD + 4K + 60 fps** is the heavy path. Draft on medium / 1080p / 30 fps.

**Nation delete does not delete events.** Retarget or delete those clips yourself.

**Track lock/collapse is local.** Another machine (or a refresh) will show all tracks expanded and unlocked. The video is unchanged.

**Coordinate order is lon, lat.** Inspector fields are labelled that way. JSON must match.

**Fonts.** Map labels use Josefin Sans / Cinzel / Oswald / Share Tech Mono as named by the theme. If those Google fonts fail to load, export still runs with fallbacks but will not match a machine that has them.

**No multi-user, no cloud share, no auth.** This is a local studio plus Postgres. Copy the database (or a JSON document) to move work.

**Do not edit files under `public/basemap/`.** Those are compiled TopoJSON. Wrong year / missing fill is almost always a region key or border-year mismatch, not a missing file.

---

### Menus (quick index)

**File** — Save project, Export video…, Back to projects  
**Edit** — Undo, Redo, Duplicate event, Delete event, Clear map selection  
**View** — Left panel, Properties panel, HUD preview, tools, Countries/Provinces, Set keyframe from view, Follow timeline camera  
**Help** — Studio field guide, Keyboard shortcuts  

---

*Warfront Animation Studio. Preview and export share one renderer; the document is a version-1 JSON project stored in Postgres.*
