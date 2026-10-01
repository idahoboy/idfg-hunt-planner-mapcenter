# Change tracking — what a real five-week diff shows

Branch `change-tracking`. Investigated 2026-10-01 against the snapshot taken
2026-08-27, which is a genuine five-week interval rather than a synthetic one.

## The four findings

### 1. `id` is a stable identity

Of 795 hunts present in both, **zero** had a mismatched tag or area. The
opportunity `id` means the same thing five weeks later.

This is the question that sank the boundary work — `AreaID` turned out to be an
autonumber with no currency — so it was worth settling before designing
anything. It is settled: `id` is the key.

### 2. "Removed" means "the season ended"

| | |
|---|---:|
| In the August snapshot | 1,052 |
| Live today | 795 |
| Disappeared | **257** |
| …of those, already past their close date | **257** |

Every single removed hunt had already closed. The API publishes open
opportunities, not a permanent catalogue.

**A naive differ would report "257 hunts deleted" and be alarming and wrong.**
Expiry has to be separated from withdrawal, or the first report anyone reads is
noise.

### 3. Nothing was added, and nothing changed in place

Zero additions. Zero changes to tag, season, ornament, dates or method across
all 795 common hunts.

### 4. The permit signal was my own artifact

A first pass reported `permits` changing on **358** hunts, which looked like the
headline feature — tag quotas drawing down through the season, visible week to
week.

It was false. The snapshot stores unlimited tags as `permits: null` with
`unlimited: true`; the API returns `999999`. Comparing the normalised snapshot
against raw API output made 358 hunts look like they had changed. Comparing
like with like gives **zero** permit movement.

**Design consequence:** the differ must compare snapshot against snapshot, both
normalised by the same builder. Diffing a stored artifact against a live
response will manufacture changes out of its own normalisation rules.

## What this means for the feature

The attractive hypothesis — a live view of quota drawdown — is not supported.
Within a season the inventory is nearly static, and the only movement is hunts
ageing out, which a calendar already predicts.

That does not kill the idea; it relocates the value:

| Stream | Within a season | Across seasons | Worth building? |
|---|---|---|---|
| **Hunt inventory** | expiry only | new hunts, dropped hunts, date and quota changes, rule changes | Yes, but the payoff is annual |
| **Services and schema** | layers dying, fields vanishing, hosts blackholing | same, continuously | **Yes — this is where the decay actually lives** |
| **Data quality** | ambiguous boundaries, unmappable hunts, vocabulary drift | same | Yes, and it is already computed |

The project's own history argues for the second row. Every defect found in this
rebuild — GeoMAC dead since 2020, a host that blackholes TCP, 404 season links
on the GMU layer, a spec documenting the wrong object — was a *service* change
nobody noticed, not an inventory change.

## Proposed shape

1. **Archive every snapshot.** `build:inventory` writes a timestamped copy.
   Cheap, and without history there is nothing to diff.
2. **Also snapshot the services**: for each configured endpoint, record HTTP
   status, layer list, field names and record count. This is the stream that
   matters and it does not exist yet.
3. **`diff-snapshots.mjs`** compares any two archived snapshots, normalised the
   same way, and classifies: expired · withdrawn · added · changed · service
   gained/lost/altered.
4. **A report page** rendered from that diff — in the app behind the existing
   Service health tool, or as a standalone static page.

Step 2 is the one with no prior art here and the most value. Step 1 is a
prerequisite and takes minutes.


---

## Built: steps 1 and 2

```bash
npm run snapshot            # both captures
npm run snapshot:services   # services only
```

**Archive** — `snapshots/`, committed, gzipped. An inventory capture is 27 KB
compressed against 416 KB raw; a service capture is 7 KB. A year of weekly
captures is a few megabytes, which is a reasonable price for being able to
answer "when did this change".

Filenames carry a content hash (`2026-10-01-inventory-4ca1ab8d07.json.gz`) so
two differing captures on the same day cannot overwrite each other, and two
identical ones resolve to the same name. `index.json` records every run,
including the ones where nothing moved — knowing a thing was checked and found
unchanged is itself a fact worth keeping.

**Service capture** — 53 endpoints: every enabled layer and its fallback, every
basemap, the click context and ownership layers, all seven access programmes,
the highlight pick lists, the print service and the geocoder. Per endpoint:
reachability, response time, HTTP status, layer name, geometry type, sorted
field names, sublayers, `maxRecordCount`, and a `shapeHash` over the structural
parts. Comparing two captures is then one hash comparison per endpoint, with
the detail available when it differs.

`--counts` also records row counts. Opt-in, because it doubles the requests and
counts drift for ordinary reasons.

### It found something on the first run

`USA_Wildfires_v1/FeatureServer/0` — the Active Wildfire Incidents layer —
answers HTTP 200 but publishes **no layers at all**; layer 0 returns "not
found". Repointed to NIFC `WFIGS_Incident_Locations_Current`, whose schema is
close but not identical: `DailyAcres` does not exist there, so the popup now
reads `DiscoveryAcres`.

That is the whole argument for this feature, demonstrated on day one by the
first capture ever taken.

### Three defects fixed while building it

- The capture reported that failure with a **blank reason**. ArcGIS left
  `message` empty and put the sentence in `details`; a blank failure reason is
  worse than no capture.
- `validate-config --probe` was still enumerating `huntFinder.sources` and
  `highlight.queryLayers`, both renamed weeks ago. It had been silently
  probing nothing for those sections.
- `npm run snapshot` chained the two steps with `&&`. `build-inventory` exits 3
  when a hunt cannot be mapped — a data-quality signal, not a failure — so the
  service capture was skipped on exactly the days something was wrong.

### Also visible against August

| | 27 Aug | 1 Oct |
|---|---:|---:|
| Hunts published | 1,052 | 795 |
| Unmappable | 2 | **1** |
| Ambiguous boundaries | 20 | **18** |

The data-quality numbers improved on their own, which is worth knowing and was
previously unknowable.

---

## Built: steps 3 and 4

```bash
npm run diff                                   # last two captures of each kind
node scripts/diff-snapshots.mjs --kind services
node scripts/diff-snapshots.mjs --from 2026-08-27 --to 2026-10-01
```

`npm run snapshot` now ends with a diff, so one command captures, compares and
publishes.

### What counts as a change

**Hunts** are keyed by hunt id and classified four ways. The split that
matters is between the two kinds of disappearance:

| | |
|---|---|
| **added** | not in the earlier capture |
| **expired** | gone, and its close date had passed — ordinary |
| **withdrawn** | gone **while its season was still ahead of it** — news |
| **changed** | same hunt, different field |

The reference date for expiry is the later capture's own date, not today's, so
an old comparison does not silently reclassify itself as the archive ages.

A changed hunt lists every field that moved, and each field is marked material
or not. Material covers dates, permits, weapon, ornamentation, area, boundary,
restrictions and access grade. Not material covers the names and codes —
wording that changes often and changes nothing. The table defaults to material
only, because the alternative is a reader scrolling past forty renames to find
the one season that moved.

Above 25% removal the report stops listing withdrawals and says so: that is a
season rollover, and reading 257 rows as individual decisions would be wrong.
The 1,052 → 795 drop between August and October is exactly this case.

Also diffed: the published vocabulary (a new weapon or ornamentation value is
how a filter quietly empties), the headline counts, and the two data-quality
measures.

**Services** are keyed by URL and classified five ways, each meaning exactly
one thing:

| | |
|---|---|
| **gained / lost** | the configuration watches more, or fewer, endpoints |
| **broke / recovered** | reachability changed; the endpoint set did not |
| **reshaped** | answered both times, and answered differently |

A reshaped service is flagged for attention when a field disappeared or the
geometry type changed, because a missing field is what empties a popup without
raising an error anywhere. Response time is deliberately *not* a change: it
varies by tens of milliseconds per run and would bury everything above.

### The rule the differ enforces

**A capture is only ever compared with another capture.** The differ reads from
`snapshots/` and has no code path to a live service or to
`public/inventory.json`. This is the design consequence of the 358 phantom
permit changes: that comparison was snapshot-against-raw-API, and every
difference was an artefact of the two sides representing an unlimited tag
differently — `null` on one side, `999999` on the other. Both sides go through
the same writer, or the diff measures the normalisation instead of the data.

### Exit codes

`0` nothing or only ordinary changes · `4` an endpoint that used to answer no
longer does. Four propagates out of `npm run snapshot`, outranking the
inventory's exit 3, because a dead dependency is the one result that needs a
person the same day.

### The report page

`/changes.html` — a second Vite entry point. It imports nothing from the map,
so Rollup gives it its own graph: **216 KB total, with zero references to
`esri`**, against 2.2 MB for the map's entry before its lazy chunks. Somebody
reading two tables does not download a mapping SDK.

It reads `changes.json`, which the differ publishes beside it. Summary tiles,
then collapsible sections, then the full archive timeline, then a plain
statement of how the numbers were produced. The changed-hunts table has a
material-only toggle and a text filter; long lists cap at 25 rows behind a
"show the remaining N". Native `<details>`, real tables with captions and
scoped headers, light and dark, legible at 375px, and printable.

Its own stylesheet, not the app's: line 1 of `src/styles/index.css` imports the
ArcGIS theme, which would have dragged ~100 KB of CSS and the SDK's asset graph
onto a page that draws no map. The colour tokens are duplicated, and every pair
it uses is one `check-contrast.mjs` already validates.

Linked from the service-health panel in the app — that panel says what is true
now, this page says what moved.

### Today it has nothing to compare

One capture of each kind exists, so the page says so plainly and names the
baseline on file. The first real comparison appears after the next capture that
differs. The classification logic was exercised against a synthetic later
capture covering every branch — expiry, withdrawal, addition, material and
cosmetic change, new vocabulary, a broken endpoint, three reshapes, a gain and
a loss — and all of them render.
