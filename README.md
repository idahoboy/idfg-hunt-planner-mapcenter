# IDFG Hunt Planner — Map Center 5.0

A rewrite of the Idaho Fish and Game Hunt Planner Map Center on React 19 and the
ArcGIS Maps SDK for JavaScript 4.x, replacing the ArcGIS JS 3.28 / Dojo /
jQuery 2 / Bootstrap 3 application that shipped as `src/dist/main.js`.

> The legacy application is not vendored in this repository. It was audited
> from the production deployment of August 2026 — the file the site loads is
> `src/dist/main.js` (3,800 lines). [MIGRATION.md](MIGRATION.md) records what it
> did, what was broken in it, and what replaced each piece.

Everything the application shows — layers, basemaps, popups, filters, tools — is
declared in [`config/app.config.yml`](config/app.config.yml) and read at
**runtime**. Adding a layer, repointing a dead service, or retiring a tool is a
config edit and a browser reload, not a code change and a redeploy.

**Live demo:** <https://idahoboy.github.io/idfg-hunt-planner-mapcenter/> —
the real application against the real IDFG services, so the layer list, the
result counts and the Service health panel are all live data.

---

## Quick start

```bash
docker compose up -d mapcenter
```

Then open <http://localhost:8080>. Override the port with `MAPCENTER_PORT`:

```bash
MAPCENTER_PORT=18080 docker compose up -d mapcenter
```

Development server with hot reload:

```bash
docker compose --profile dev up mapcenter-dev
```

Local (no Docker):

```bash
npm install
npm run dev
```

---

## Verify the configuration before you ship it

The single most useful command in this repo. It parses the YAML, checks every
cross-reference, then probes every ArcGIS endpoint the config names:

```bash
npm run config:health
```

```
Config: config/app.config.yml
  45 layers | 4 groups | 7 basemaps | 6 finder sources | 7 facets
  structure ok

Probing 53 endpoints...
  ok   layer:game-management-units            Game Management Units
  warn layer:counties (fallback)              fetch failed
  ...
51/53 endpoints responding.
All required endpoints responding.
```

Exit codes: `0` healthy, `1` structural problem, `2` a required endpoint is
unreachable — so it drops straight into CI or a cron job. A failing
`fallbackUrl` is reported as a warning, not a failure, because a fallback exists
precisely for services that are unreliable.

Structure-only (no network):

```bash
npm run config:validate
```

There is also a **Service health** panel inside the app showing the live status
of every layer. The previous Map Center had no equivalent, which is why the
GeoMAC fire layers stayed broken from 2020 until they were commented out in
2025.

---

## Editing the configuration

`config/app.config.yml` is bind-mounted into the container read-only:

```yaml
volumes:
  - ./config/app.config.yml:/usr/share/nginx/html/config/app.config.yml:ro
```

Edit the file on the host, reload the browser. No rebuild, no container restart.
nginx serves it with `Cache-Control: no-store`.

### Adding a layer

```yaml
  - id: my-new-layer
    title: My New Layer
    group: reference          # must match a groups[].id
    legacyBit: 4096           # optional; keeps ?reference=4096 deep links working
    type: feature             # feature | map-image | tile | imagery | geojson | csv | vector-tile
    url: ${roots.idfgAgol}/MyService/FeatureServer/0
    fallbackUrl: https://…    # optional; used only if the primary fails to load
    visible: false
    opacity: 0.8
    definitionExpression: "STATE = 'ID'"
    outFields: ["*"]
    scaleGate:                # the legacy "(zoom in to activate)" behaviour
      enableBelow: 500000
      message: zoom in to activate
    popup:
      title: "{NAME}"
      fields:
        - { label: Acres, field: ACRES, format: number }
      links:
        - { label: More information, field: INFO_URL }
    disclaimer:
      text: Data maintained by …
      url: https://…
    health: verified          # verified | replaced | unverified | deprecated
```

Then run `npm run config:health` and reload.

### Taking a broken layer out of service

Set `enabled: false`. The layer disappears from the UI, is skipped by the
endpoint probe, and is logged at boot — no commenting-out of code, no risk of a
dangling reference. `fire-emergency-closures` is currently in this state because
its ArcGIS Online item stopped being shared publicly.

### Repointing a dead service

Change `url`. If you want a grace period, keep the old one as `fallbackUrl`; the
layer loader tries the primary, falls back on failure, and reports which one it
used in the Service health panel.

### Publishing the demo

```bash
npm run deploy:pages
```

Builds with `VITE_BASE=/<repo>/` and force-pushes `dist/` to `gh-pages`. Pages
serves from a sub-path, so every runtime fetch resolves against
`import.meta.env.BASE_URL` rather than a leading slash. The demo pulls SDK
assets from the Esri CDN (~17MB deployed); the container bundles them instead
(~100MB) so it keeps working on networks that block `js.arcgis.com`.

---

## Architecture

```
src/
  config/     YAML load + zod schema. One bad layer is skipped, not fatal.
  map/        MapProvider, layer factory, symbol/popup builders, widget host hook
  state/      zustand store + URL state (incl. legacy bitmask codec)
  features/
    filterbar/  the VRBO-style facet bar and its query engine
    results/    results rail, search runner, map interaction
    layers/     layer tree, per-layer legend, basemap picker
    highlight/  the legacy "Highlight a Hunt Area" tool
    search/ measure/ draw/ upload/ print/ share/ coords/ help/
  lib/        ArcGIS query helpers, coordinate parsing, GPX/KML/GeoJSON parsers
```

Notes on a few deliberate choices:

- **`useWidgetContainer`** — Esri widgets take ownership of the DOM node passed
  as `container` and remove it on `destroy()`. Handing them a React-rendered
  node makes React reconcile against a detached element, and under StrictMode's
  double-invoke the panel silently comes up empty. Every widget gets a
  throwaway child node instead. The map view uses the same trick.
- **`sqlIdIn`** — ID fields differ per service (`AreaID` is an integer,
  Access Yes `id` is a string). Quoting an integer field makes ArcGIS return
  *"Unable to complete operation"* rather than an empty set.
- **`Year` is never used as a filter on controlled hunts.** The legacy source
  pinned `Year = 2020`; the field is not a hunt season and filtering on it drops
  valid areas. The service stores several rows per hunt area instead, so the
  finder collapses them with `dedupeBy` (see below) and the map layers simply
  draw the duplicate geometry.
- **`dedupeBy`** — for a source that stores several rows per real-world feature,
  the identity fields *are* the projection: `DISTINCT` applies to the selected
  columns, and the server rejects a paged `DISTINCT` query whose `ORDER BY`
  references anything it did not project. `outFields`, `dedupeBy`, and `orderBy`
  therefore have to line up, and `npm run config:validate` enforces it. Exact
  counts come from a grouped statistics query, because `returnCountOnly` +
  `returnDistinctValues` accepts only one field.
- **No ArcGIS API key.** Every basemap is a keyless service. Nothing in this
  application consumes Esri credits.
- **No proxy.** The legacy `gis_proxy.ashx` is gone; 4.x uses CORS directly.
  `network.trustedServers` is intentionally **empty** — listing a public service
  there makes the SDK send `credentials: include`, and the browser then rejects
  every response that carries `Access-Control-Allow-Origin: *`.

---

## Backward compatibility

Existing links keep working. The legacy URL contract is implemented in
[`src/state/urlState.ts`](src/state/urlState.ts):

| Parameter | Meaning | Status |
|---|---|---|
| `?hunt=` `?admin=` `?reference=` `?wildlife=` | Layer visibility bitmasks | Supported — `legacyBit` per layer |
| `?val=` `?lyr=` `?lbl=` | Highlight a hunt area | Supported — `highlight.queryLayers` is indexed by the old `lyr` value |
| `?X=` `?Y=` `?zoom=` | Initial map view | Supported |
| `?basemap=` | Basemap selection | New |
| `?f.<facet>=` `?q=` | Hunt finder filters | New |

`?hunt=5&f.species=Elk` turns on Game Management Units and Elk Management Zones
*and* filters the results rail to elk — old and new parameters compose.

---

## What the container does

Multi-stage build: Node builds, nginx serves. The final image carries no Node
runtime and no build tooling (~168MB, most of it the 77MB of ArcGIS SDK assets
copied in so the app works on networks that block `js.arcgis.com`).

- Runs as uid 10001, `read_only: true`, `no-new-privileges`, tmpfs for the
  three paths nginx must write.
- `HEALTHCHECK` against `/healthz`.
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and
  `Permissions-Policy` on every response — including `/index.html`, which needs
  the headers repeated in its own `location` block because nginx discards
  inherited `add_header` directives the moment a nested block declares one.
- Fingerprinted assets cached for a year; `index.html` and the config never
  cached.

---

## Known gaps

- **Controlled hunt boundary versions — open question with IDFG GIS.**
  A named hunt area is stored more than once, each version with its own
  `AreaID` (Elk "3-2" is `AreaID` 1541 / `AreaRank` 125 and `AreaID` 2762 /
  `AreaRank` 124). Nothing in the service marks which boundary is current:
  `FLAG` is `1` on both, and `FLAG=1` covers only Deer, Elk, Moose, Pronghorn
  and Turkey. `Year` is not a season and is not used.

  The finder lists one card per `BigGame` + `HuntArea` + `AreaRank` (582 areas).
  **The highlight and the KML export use whichever row the service returns
  first, which is arbitrary** — so the results rail shows a caveat to the user
  rather than presenting the boundary as authoritative. Once the data owner
  confirms the rule, encode it in `huntFinder.sources.controlled-hunts` in the
  config; no application code should need to change.
- **`fire-emergency-closures` is disabled.** Its ArcGIS Online item now returns
  *Token Required*; nothing equivalent is published elsewhere. Re-share the item
  and set `enabled: true`.
- **`gis2.idaho.gov` was unreachable** during the 2026-08 audit. It is retained
  as `fallbackUrl` for counties and campgrounds; both have live primaries.
- **KMZ upload** is rejected with an explanatory message rather than unzipped.
  Uploading the `.kml` inside works.
- The Highlight tool loads up to 2000 options per picker into a native
  `<select multiple>`. Fine today; worth virtualising if the hunt tables grow.

See [MIGRATION.md](MIGRATION.md) for the full feature-by-feature index against
the legacy application and the endpoint remediation table.
