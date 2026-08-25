# Migration index — Map Center 4.x → 5.0

Audit date: **2026-08-25**. Source of truth for the legacy behaviour was the
production deployment's `src/dist/main.js` (3,800 lines — the file `index.html`
actually loads), **not** its `src/js/map.js`: the two had drifted apart and
`src/js/map.js` is the older of the pair, still referencing four variables whose
declarations had been commented out.

The legacy tree is not vendored here, so the line references below point into
that deployed bundle rather than into this repository.

---

## 1. Functionality index

Every capability of the legacy application, and where it went.

| Legacy capability | Status | Notes |
|---|---|---|
| Turn layers on/off (4 grouped `LayerList` dijits) | **Ported** | Config-driven layer tree, per-layer opacity, per-layer legend |
| Per-layer opacity slider | **Ported** | |
| Per-layer legend swatches | **Ported** | Esri `Legend` widget per layer, so symbology always matches the service |
| Layer disclaimers ("Learn More" blurbs) | **Ported + fixed** | Legacy attached these by hard-coded checkbox id (`tocDiv3_checkbox_7`); four of them pointed at indices that no longer existed, so those disclaimers never rendered. Now attached to the layer itself |
| "(zoom in to activate)" scale gating | **Ported** | Was four hand-written pairs of enable/disable jQuery functions keyed to DOM ids; now `scaleGate.enableBelow` per layer |
| Change the basemap (6 basemaps) | **Ported + extended** | 7 basemaps, all keyless. Added USGS Imagery Topo |
| Highlight a Hunt Area (GMU / Elk Zone / Controlled Hunt / Waterfowl) | **Ported + fixed** | Pick lists now read from the live service. Legacy Turkey list was static and years out of date |
| Download highlighted areas as KML | **Ported** | `kmlTemplate` per source |
| Deep link `?val=&lyr=&lbl=` | **Ported + fixed** | `lyr=2` (Access Yes!) pointed at a URL missing the `/Hosted/` path segment and always 404'd |
| Layer bitmask deep links `?hunt=&admin=…` | **Ported** | `legacyBit` per layer; validator rejects collisions within a group |
| Shared view `?X=&Y=&zoom=` | **Ported** | |
| Upload waypoints & tracks (GPX) | **Ported + extended** | Now GPX, KML, GeoJSON, CSV — and parsed **in the browser**. Legacy POSTed the user's file to `arcgis.com/sharing/rest/content/features/generate` |
| Place search | **Ported** | Esri World Geocoder, clipped to the Idaho extent |
| Coordinate search | **Ported + extended** | Legacy accepted decimal degrees only and silently dropped a pin in the ocean for anything else; now DD, DMS, and DDM |
| Pointer coordinate readout (DD / DMS / UTM) | **Ported + fixed** | Legacy constructed a `GeometryService` and fired **a network request on every mousemove** to project to UTM. Now projected client-side, throttled to one update per frame |
| Measure distance / area / location | **Ported** | Esri 4.x measurement widgets. Popups now reliably re-enable — legacy left them disabled if you closed the panel mid-measurement |
| Draw on the map | **Ported + extended** | Esri `Sketch`: select, move, reshape, undo/redo. Legacy was draw-only. Drawings now survive a page refresh |
| Add text to the map | **Ported** | Still a separate graphics layer — mixing `TextSymbol`s into the sketch layer makes them export as bare points |
| Create printable map (PDF/PNG) | **Ported** | Esri `Print` widget against the same IDFG print service. Reports a dead print service instead of spinning forever |
| Help documentation + F1 shortcut | **Ported** | Links to the existing `HelpDocV2`; the static help site is unchanged |
| Disclaimer modal | **Ported** | Header link |
| Collapsible sidebar / mobile layout | **Ported + rebuilt** | Tool rail + panel + results rail, responsive at 768/1024 |
| Locate button, scalebar, zoom | **Ported** | Plus Home, Compass, Fullscreen, Basemap toggle |
| Popups for ~12 layers | **Ported + fixed** | Legacy built popup HTML by string-concatenating `${FIELD}`, so any value containing a quote or angle bracket broke the markup. Now built as DOM with every value escaped |
| CSV export of results | **Ported + fixed** | Legacy concatenated raw values; any hunt-area note containing a comma shifted every later column. Now RFC 4180 quoted, UTF-8 BOM for Excel |

### New in 5.0

| Capability | Why it matters |
|---|---|
| **Hunt finder** — top filter bar + results rail | The VRBO-style layout: facets across the top, live result cards on the left, map on the right. Hover a card to flash the geometry, click to zoom and highlight |
| Live result counts | `executeForCount` per source, so "387 areas" is exact without paging the set into the browser |
| Search as I move the map | Optional extent-bound searching |
| **Service health panel** | Live status of all 45 configured endpoints. This is the thing that would have caught the GeoMAC decommission in 2020 instead of 2025 |
| `npm run config:health` | Same probe from the command line, CI-friendly exit codes |
| Share this map | Legacy could be deep-linked *into* but never produced a link to your current view |
| Runtime YAML config | Layers, basemaps, popups, filters, tools — all editable without a build |
| Keyboard shortcuts | `/` search, `l` layers, `f` filters, `Esc` clear highlight, `?` help |
| Dark mode | Follows the OS setting |
| Drawings persist across reload | |
| Per-layer fallback URLs | A dead service degrades one layer instead of the map |

---

## 2. Endpoint remediation

Probed 2026-08-25. The legacy application referenced **7 services that no longer
work**; four of them had been silently commented out rather than replaced.

### Dead in the legacy app — now restored

| Layer | Legacy endpoint | Failure | Replacement |
|---|---|---|---|
| Current Year Fire Perimeters | `wildfire.cr.usgs.gov/…/geomac_fires/2` | DNS does not resolve (GeoMAC decommissioned 2020) | NIFC `WFIGS_Interagency_Perimeters_YearToDate` |
| MODIS Fire Detections | `wildfire.cr.usgs.gov/…/geomac_fires/3` | DNS does not resolve | Esri Live `Satellite_VIIRS_Thermal_Hotspots` — 375m vs 1km resolution |
| Inactive Fire Perimeters | `wildfire.cr.usgs.gov/…/geomac_fires/4` | DNS does not resolve | Folded into WFIGS YearToDate |
| Historic Fire Perimeters | `rmgsc.cr.usgs.gov/…/geomac_dyn/27` | HTTP 403 — **still wired into the live layer list** | NIFC `InterAgencyFirePerimeterHistory_All_Years_View` |
| State & Federal Land Management | `gis.blm.gov/idarcgis/…/BLM_ID_Surface_Management_Agency` | HTTP 404 *Service not found* | `BLM_Natl_SMA_Cached_without_PriUnk` |
| Airports & Airstrips | `gis.itd.idaho.gov/…/RoadFeatureLayers/29` | HTTP 500 | BTS `NTAD_Aviation_Facilities` (the older RITA-BTS A-16 fallback also returns 503) |
| Land Cover (NLCD 2011) | `utility.arcgis.com/…/USA_NLCD_2011/ImageServer` | *Service not started* | Dropped — was already `visible: false` and unreachable from the layer list |

### Broken and not yet replaceable

| Layer | Endpoint | Failure | Handling |
|---|---|---|---|
| Fire Emergency Closure Areas | `…/Emergency_Wildfire_Closures/FeatureServer/0` | **Token Required** — the item is no longer shared publicly | `enabled: false` with an inline note. Re-share the item and flip the flag; no code change |
| Wildlife Tracts | `…/South_Central_Idaho_Wildlife_Tracts/FeatureServer/0` | Token Required | Already deprecated in the legacy source (2025-09-16) |

### Unverified from the build network

| Layer | Endpoint | Handling |
|---|---|---|
| Counties | `gis2.idaho.gov/…/Idaho_Counties/MapServer/1` | Primary switched to the IDFG-hosted `IdahoConservationPlannerAdministrativeBoundaries/1`; old URL retained as `fallbackUrl` |
| Campgrounds | `gis2.idaho.gov/…/Campgrounds/MapServer/0` | Primary switched to USFS `EDW_RecreationOpportunities_01`; old URL retained as `fallbackUrl` |

`gis2.idaho.gov` did not respond from the audit network. It may be reachable
from inside the IDFG network — run `npm run config:health` from a deployment
host to confirm before deciding whether to swap the primaries back.

---

## 3. Defects found in the legacy source

Beyond the dead endpoints, these were live bugs in `src/dist/main.js`:

1. **`Year = 2020` hard-coded** on the controlled hunt layers. `Year` on this
   service is **not** a hunt season — it does not mean what the name suggests,
   and filtering on it drops valid hunt areas. The pin is removed and no year
   clause replaces it. The service stores several rows per hunt area (2,162 rows
   for 574 named areas); the finder collapses them with `dedupeBy`, and the map
   layers draw the duplicate geometry, which is cosmetic. See *Open questions*.
2. **`QueryLayers[2]` missing `/Hosted/`** — the Access Yes! deep link
   (`?lyr=2`) resolved to a URL that returns *Service not found*.
3. **Fire layer disclaimers referenced `tocDiv4_checkbox_4/5/6`** when that
   layer list only had indices 0–2, so none of them rendered.
4. **`src/js/map.js` references four undefined variables** in its
   `map.addLayers([…])` call (`CurrentYearFirePerimeters`, `ModisFireLyr`,
   `InactiveFirePermimetersLyrs`, `endowmentLayer`) — their declarations were
   commented out. Loading that file throws `ReferenceError` and kills the entire
   AMD callback. It is not the deployed file, but it is the file in `src/`.
5. **Popup HTML built by string concatenation** from unescaped attribute values.
6. **CSV export unquoted** — commas in field values shift columns.
7. **A `GeometryService` network round-trip on every `mouse-move`** for the UTM
   readout.
8. **`window.load` handler registered with jQuery 2's `$(window).load()`**,
   removed in jQuery 3 — with a 5-second `setTimeout` fallback bolted on beside
   it to hide the loading spinner when it failed.

---

## 4. Dependency change

| | Legacy | 5.0 |
|---|---|---|
| Map SDK | ArcGIS JS **3.28** (Dojo AMD, from CDN) | `@arcgis/core` **4.34.8** (ES modules, bundled) |
| UI | jQuery 2.2.4 + jQuery UI + Bootstrap 3.3.7 + bootstrap-select | React 19 + TypeScript 5.7 |
| Build | none (a 176KB hand-edited `main.js`) | Vite 6 |
| State | globals and DOM ids | zustand |
| Config | inline in JavaScript | `app.config.yml`, validated by zod at boot |
| CDNs at runtime | 5 (`js.arcgis.com`, `code.jquery.com`, `maxcdn`, `cdnjs`, Google Fonts) | 1 (Google Fonts) — SDK assets are bundled |
| Proxy | `gis_proxy.ashx` | none; direct CORS |
| CSP | none | enforced |

ArcGIS JS 3.x reached end of support; 4.x is the supported line and is what
makes the client-side projection, the sketch/measure widgets, `executeForCount`,
and grouped statistics queries available.


---

## 5. Open questions for IDFG GIS

Raised 2026-08-25. Both are recorded in `config/app.config.yml` next to the data
they concern.

### Which controlled hunt boundary is current?

`Hunting/MapServer/4` stores a named hunt area more than once, each version with
its own `AreaID`:

| AreaID | BigGame | HuntArea | AreaRank | Year values on the rows |
|---|---|---|---|---|
| 1541 | Elk | 3-2 | 125 | 2020, 2021, 2022 |
| 2762 | Elk | 3-2 | 124 | 2023, 2025 |

Nothing in the service identifies the current version:

- `FLAG` is `1` on **both** rows above, and `FLAG = 1` covers only Deer (99),
  Elk (170), Moose (5), Pronghorn (23) and Turkey (4) — not Bear, Goat, Sheep or
  Furbearer.
- `Year` is not a season and is not usable as a filter.

Counts under each candidate identity:

| Identity | Distinct values |
|---|---|
| `AreaID` | 425 |
| `BigGame` + `HuntArea` | 574 |
| `BigGame` + `HuntArea` + `AreaRank` | 582 |

**Current behaviour:** the finder lists one card per `BigGame` + `HuntArea` +
`AreaRank`. The highlight and KML export take whichever row the service returns
first — arbitrary, and surfaced to the user as a caveat in the results rail
rather than presented as authoritative.

**What would resolve it:** the field and value that mark the current boundary,
or confirmation that the highest `AreaID` is always the most recent. Either
becomes a config edit.

### Is `gis2.idaho.gov` reachable from inside the IDFG network?

It did not respond from the audit network. Counties and Campgrounds have been
repointed at live alternatives with the original URLs kept as `fallbackUrl`. Run
`npm run config:health` from a deployment host to confirm before deciding
whether to swap the primaries back.
