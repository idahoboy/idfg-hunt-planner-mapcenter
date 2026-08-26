# Where this should go next

Branch: `brainstorming`. Written 2026-08-26, after finding the Hunt Planner API.

---

## 1. The thing that changes everything

I built the Hunt Finder against ArcGIS attribute queries and told you seasons,
weapons and tags were not obtainable. That was wrong — I was looking at the map
services, which are geometry. The inventory lives here:

```
GET /ifwis/huntplanner/api/1.1/list/
```

Probed live 2026-08-26:

| Query | Result |
|---|---|
| `?game=2` (elk) | **319** opportunities |
| `?game=1` (deer) | **674** |
| `?game=1,2` | **993** |
| all published | **1,052** |
| `?game=2&start=2026-10-01&end=2026-10-07` | **76** |
| `?game=2&method=2` (archery) | **281** |
| `?game=2&type=2` (controlled) | **220** |

A row is a bookable thing, not a polygon:

```json
{ "tag": "Elk A Tag - Pioneer Zone", "season": "General A Tag",
  "ornament": "Antlerless", "method": "Any Weapon",
  "open": "8/1/26", "close": "8/29/26", "permits": 999999,
  "area": "Portion of Unit 50", "tagid": 32302, "id": 80484 }
```

The facet vocabulary is already what a trip planner needs: `game` (29 species
plus rollups), `method` (13 weapons), `ornament` (19 sex/antler restrictions),
`season`, `type` (general vs controlled), `restriction` (including the access
warnings and the Motorized Hunting Rule), `unit`, `zone`, `region`, `county`,
`town`, `start`/`end`, `n` (controlled hunt number), `sort`/`order`/`offset`/`limit`.

**Two numbers that should drive the whole design:**

- **Deer + elk are 94% of published inventory** (993 of 1,052). Your read is
  correct and the data is unambiguous about it.
- **Upland bird and waterfowl return zero for every regulation year.** The API
  is big game only. Birds, small game and turkey are served by the regulations
  pages and the map layers, not this inventory.

---

## 2. What people actually want

Nobody opens a hunt planner to browse layers. They open it with a constraint set
already in their head, and the current tool makes them translate it into GIS.

> *"I've got the first two weeks of October, I shoot a bow, I can drive four
> hours from Boise, and I have three points. Where can I actually go?"*

Every clause maps to something the API already accepts — dates, `method=2`,
a `unit`/`region` set, and controlled-vs-general. The translation is the product.

Three audiences, in honest proportion:

**The 94% — deer and elk.** Wants: which tag, valid when, what weapon, which
unit, general or draw, and how hard is access. Needs GMU and elk-zone geometry,
because a tag is defined by an area. Needs *timing overlap* — the thing you
flagged — which `open`/`close` now gives us and the map services never did.

**The overlay users — bear, lion, wolf, and fishing.** Not a separate app: a
second question asked while planning the first. *"While I'm in Unit 39 that
week, what else is open?"* That is one more query with the dates held constant.

**Birds, waterfowl, small game.** A different mental model — proximity,
stocking dates, dogs, walk-in access. Not served by this API at all. They should
get their own profile built on the existing map layers (pheasant stocking, WMAs,
Access Yes!), not a bolted-on facet in a big-game UI.

---

## 3. The reframe

Expedia's insight is not "a map with filters." It is: **state a trip, get ranked
options, with the reasoning visible.** You never browse the hotel inventory; you
declare constraints and the system does the narrowing.

The current app — and my rewrite of it — is a *layer browser with a filter bar
bolted on*. The map is the interface and the data is decoration.

Invert it. **The inventory is the interface. The map is the evidence.**

| Today | Proposed |
|---|---|
| Turn on layers, look at polygons | State a trip, get ranked tags |
| Filter facets against geometry | Query real inventory: dates, weapon, tag |
| Map is the product | Map proves *where* an option is |
| One UI for every quarry | Trip profiles per quarry group |
| User translates intent to GIS | System translates intent to query |

"Price" has an equivalent here, and it is the interesting design problem:
**permits** (999999 means unlimited), draw odds, access difficulty from
`restriction`, distance from home, and season crowding. That composite is what
ranking should sort on — the thing Expedia calls price and sort-by-value.

---

## 4. Trip profiles — the grouping you asked for

Different quarry needs different questions. That is a config profile, not a
different application, and the config engine already built supports it.

```yaml
profiles:
  - id: big-game
    label: Deer & Elk                     # the 94% — default
    inventory: huntplanner-api
    facets: [dates, species, weapon, ornament, type, unit, zone, region]
    layers: [game-management-units, elk-management-zones, controlled-hunt-*,
             surface-management, access-yes, roads-trails, fire-*]
    rank: [permits, drawOdds, accessDifficulty, distanceFromHome]

  - id: predator
    label: Bear, Lion & Wolf
    inventory: huntplanner-api            # same API, different defaults
    facets: [dates, species, weapon, unit, region]
    layers: [game-management-units, wolf-management-zones, surface-management]

  - id: birds
    label: Upland & Waterfowl
    inventory: none                       # not in the API — layers + regs
    facets: [region, access, proximity]
    layers: [pheasant-stocking, wildlife-management-areas, access-yes,
             restrictions-waterfowl, sage-grouse-zones]

  - id: fishing
    label: Fishing
    inventory: fishingplanner-api         # /list /water /stocking /returns
    facets: [waterBody, species, facility, region, stocking]
    layers: [access-yes, campgrounds, roads-trails, quagga-closures]
```

Switching profile swaps facets, layers, ranking and empty states together. The
fishing API is genuinely rich — `facility` covers ramp, dock, toilet, camp and
ADA access, and `/stocking` and `/returns` give recent stocking and creel data,
which is the closest thing to "recent reviews" in the whole system.

---

## 4a. Access is the product

You said access is the hardest thing for people to work out, and it should be
prominent. Agreed — and it is the one place this app can be genuinely better
than the regulations booklet, because access is the question the booklet is
*worst* at answering.

Access has two halves, and today the tool makes the user assemble both by eye.

**Regulatory access** is already encoded in the API's `restriction` vocabulary —
about forty types, and the significant ones are all access:

| Code | Restriction | Rows |
|---|---|---|
| 4 | **Motorized Hunting Rule** — vehicles limited to established roads, 30 Aug–31 Dec | **212** (20% of inventory) |
| 2 | Very limited access: few roads, private property, only a portion of the unit open | 25 |
| 3 | **EXTREMELY LIMITED ACCESS** — get permission before buying the tag | 7 |
| 1 | Limited access | 1 |
| 7 | Only a portion of this area is open | — |
| 24 / 27 | Outside National Forest Boundary **only** — a legislative line, not the property line | — |
| 29 | Landowner Permission Hunt — written permission required even to *apply* | — |
| 33 / 34 | Lolo Motorway permit · INEEL pass required | — |

One in five published hunts carries the Motorized Hunting Rule, and today the
only way to discover that is to read the booklet footnotes.

### Correction after building the snapshot

Running the builder against every restriction code exposed something that
weakens the claim above, and it should be on the record.

**Eighteen of the twenty-four restriction codes return zero rows** — including
six of the ten that describe access: 7 (only a portion open), 24 and 27
(outside National Forest boundary), 29 (landowner permission), 33 (Lolo
Motorway) and 34 (INEEL pass). The documented vocabulary is far richer than
what is actually populated this season.

What the API really carries:

| Access grade | Hunts | Source |
|---|---:|---|
| Open — no access code at all | **811** | 77% of inventory |
| Special rule | 208 | almost entirely the Motorized Hunting Rule |
| Limited | 26 | codes 1 and 2 |
| Permission required | 7 | code 3 |

So **only 241 of 1,052 hunts (23%) carry any access signal from the API.** For
the other 811 the API says nothing — which does not mean access is easy, only
that nothing is recorded.

That makes the land-ownership intersection **essential rather than a
refinement**. It is the only way to say anything about access for three
quarters of the inventory, and it should move from a follow-on to part of the
first access milestone.



**Physical access** is the map half: surface management (public vs private),
Access Yes! properties, roads and trails, MVUM, and closures. We already have
every one of those layers, restored and healthy.

The unlock is that **`AreaID` joins the two**. Once a hunt row resolves to a
polygon, land ownership can be intersected against it *at cache-build time*, so
every hunt carries a real number:

> **Elk Controlled Hunt 2093 · Area 55-2** — 78% public land · Motorized Hunting
> Rule applies · 2 Access Yes! properties on the boundary

That is the sentence people currently spend an evening assembling by hand. It
should be on the card, filterable, and it should be a sort option — the closest
thing this domain has to sort-by-price.

Proposed access grades, computed once per hunt at snapshot time:

- **Open** — majority public land, no access restriction codes
- **Limited** — restriction 1/2/7, or mixed ownership
- **Permission required** — restriction 3 or 29
- **Special rule** — restriction 4/24/27/33/34: legal to enter, but a rule
  changes how you hunt it

`restriction` is a filter parameter and is *not* returned on rows — so the
snapshot builder queries each restriction code once and stamps the ids. Forty
cheap queries, once, at build time.

## 4b. Snapshot, do not proxy

Since 1.1 may fall over under concurrency, nothing should query it at runtime.

The entire published inventory is **1,052 rows.** That is nothing. Build a
snapshot artefact on a schedule:

```
build-inventory.mjs
  1. GET /list  (paged, serial, polite)              -> 1,052 rows
  2. GET /list?restriction=N  for each code          -> stamp access codes
  3. join game + area -> BigGame + HuntArea -> AreaID
  4. intersect AreaID polygon with surface management -> % public land
  5. emit inventory.json  (~1-2 MB, gzips small)
```

Everything downstream reads that file. Consequences, all good:

- **Zero runtime load** on a fifteen-year-old server, and no rate limit to fear.
- **Instant filtering** — the whole corpus is client-side, so faceting is
  synchronous and result counts are exact with no round trip.
- **Access grades are precomputed**, including the expensive spatial
  intersection, which could never be done per-request.
- The app keeps working when the API is down; the snapshot just goes stale, and
  the existing service-health panel is the natural place to say so.
- Refresh cadence is a config value. Regulations change seasonally, not hourly.

This also means the AI path never talks to the live API either: intent resolves
to parameters, and the parameters filter the snapshot.

## 5. What survives, and what I would throw away

Being blunt about my own work, because you are paying to maintain it.

**Throw away**

- `src/features/filterbar/queryEngine.ts` — the ArcGIS attribute search. The
  API replaces it wholesale. Everything it does, the API does better and with
  data the map services do not carry.
- `huntFinder.sources` / `facets` config, `dedupeBy`, the composite-identity
  work, `queryDistinctCount`. All of it exists to make geometry tables behave
  like an inventory. There is a real inventory now.
- The `Year` archaeology. Moot for search. It still matters for *drawing a
  boundary*, and the open question for IDFG GIS stands.

**Keep — this is the reusable half**

- The whole config engine: schema, loader, `${roots.*}`, validator, health
  probe. Profiles are a natural extension of it.
- `layerFactory`, `popup`, `symbols`, fallback URLs, scale gating, the 45-layer
  catalogue and the seven restored endpoints. That is the map, and the map stays.
- The **mobile shell** — filter row, sheets, map/list pill, expand-in-place,
  paging. That pattern is exactly right for an inventory app; it was arguably
  built for the wrong data.
- Service health, `config:health`, Docker, CSP, CI. Infrastructure is agnostic.
- Legacy URL compatibility. Existing links must keep resolving regardless.

Rough split: **~70% of the code survives, and the 30% that goes is the part I
spent the most effort on.** Better to know now.

---

## 6. The AI path

This is where it stops being a filter UI. Three uses, in increasing risk order.

**(a) Intent → query.** The highest-value, lowest-risk use. Free text to API
parameters, with the model choosing from a fixed vocabulary and never inventing
values.

```
"first two weeks of october, bow, elk, within 4 hours of boise, i have 3 points"
  → { game: [2], method: [2], start: "2026-10-01", end: "2026-10-14",
      type: [1,2], region: [3,4], notes: { points: 3 } }
```

Structured outputs against a JSON schema generated from the API's own
vocabulary. The model picks parameters; **it never answers the question itself.**
The API answers, from live data.

**(b) Explain the tradeoff.** Given the rows the API returned, write the
comparison a knowledgeable friend would: why this tag is easier to draw, why
that unit is a road-hunting problem, what the Motorized Hunting Rule means for
your plan. Grounded strictly in returned fields plus the layer metadata already
in config. Every claim traceable to a row.

**(c) Trip assembly.** The genuine Expedia move: combine a tag, an access
strategy, and a second species open in the same window. *"Unit 39 archery elk
Oct 1–14; your general deer tag is valid in the same unit; two Access Yes!
properties on your route; the Boise NF motorized rule applies."* This is a
multi-query composition the current UI cannot express at all.

**Guardrails, non-negotiable.** This is a regulatory surface where a wrong
answer is a citation or a dead animal.

- The model **never states a season, date, weapon legality, or bag limit from
  its own knowledge.** It only re-narrates fields returned by the API.
- Every generated statement carries the row it came from.
- Any answer touching legality links to the rules page and says the booklet
  governs.
- Log prompt, resolved parameters and returned ids together, so a bad answer is
  reproducible.
- Ship (a) first. It is useful alone, and it is testable — you can assert that
  a given sentence produces given parameters, which is an eval, not a vibe.

You have OpenAI credit available, so (a) is a days-not-weeks build: one endpoint
that takes a sentence, returns validated parameters, and refuses when unsure.

---

## 7. Phasing

| Phase | What | Why first |
|---|---|---|
| **0** | `build-inventory.mjs` — snapshot the API, stamp restriction codes, join to `AreaID`. | Removes the fragile-server risk immediately and makes everything after it cheap. |
| **1** | Swap `queryEngine` for the snapshot on a big-game profile. | Proves the reframe against the real UI in days. |
| **2** | **Access grades** — precompute public-land share, surface on every card, filter and sort by it. | The hardest question for users, and the thing no competitor answers well. |
| **3** | Trip profiles in config: big game, predator, fishing. | Delivers the grouping, reuses the config engine. |
| **4** | AI intent → parameters, behind a flag, with an eval set. | Highest leverage, contained risk. Filters the snapshot, never the live API. |
| **5** | Explanation and trip assembly. | Only once intent-parsing is demonstrably trustworthy. |
| **6** | Birds/waterfowl profile from layers; fishing depth via `/stocking` + `/returns`. | Serves the audiences the API does not cover. |

---

## 8. Answers received, and the one thing still open

Resolved 2026-08-26:

1. **Draw odds — skipped.** They exist but are not worth the effort now. Ranking
   leans on access, permits, and distance instead. Which turns out to be the
   better story anyway; see §3.
2. **`AreaID` is the join.** Confirmed end to end: the API's `game` + `area`
   (`Elk` + `55-2`) matches `BigGame` + `HuntArea` on
   `Hunting/MapServer/4`, resolving to `AreaID` 1153 and its polygon.
   Note this is the *same composite key* chosen for `dedupeBy` last session —
   the dedupe identity and the API join key are the same thing.
3. **API 1.1 is wide open and fragile** — concurrency may take the server down,
   and it is fifteen years old. So do not query it at runtime. Snapshot it. See
   §5a.
4. **Points do not exist.** General and Controlled, and the rest do not matter.
   Dropped from intent parsing.

### The boundary question, corrected

`AreaID` is an **autonumber**. It carries no meaning beyond uniqueness, so
"highest id is newest" was invalid reasoning on my part — the id says nothing
about currency. **An `AreaID` is only meaningful if the current season
references it.** That reframes the whole thing, and it mostly dissolves it.

Applying that rule to the live data:

| | |
|---|---|
| Hunt areas the current season references | **239** |
| Resolve to exactly one `AreaID` | **217 (91%)** — no decision needed |
| Ambiguous, more than one `AreaID` | **20** |
| Referenced by the API but **no polygon exists** | **2** |
| GIS pairs the season does **not** reference | **337 of 574** — historical, never draw them |

So the API is the authority on which polygons are live, and 337 stale pairs
disappear on their own by being unreferenced. That is a filter, not a judgement
call, and it belongs in the snapshot builder.

**The join also needs a species alias table**, because the two systems name
game differently:

| API 1.1 `game` | GIS `BigGame` |
|---|---|
| Mule and White-tailed Deer · Mule Deer · White-tailed Deer | Deer |
| Pronghorn Antelope | Pronghorn |

Without it, 138 of 239 referenced areas fail to resolve. With it, 2 fail.

### What is actually left to decide

Only these **20 areas** have more than one candidate polygon and are referenced
by the current season. This is the whole list — no investigation needed, just a
rule or a pick:

| Species | Hunt area | Candidate AreaIDs |
|---|---|---|
| Deer | 1-1X | 1518, 1519, 2814 |
| Deer | 10A | 184, 2827 |
| Deer | 21-1 | 1307, 2755 |
| Deer | 21-1X | 1067, 2756 |
| Deer | 36A-1X | 1069, 2757 |
| Deer | 36B-1 | 1512, 2703 |
| Deer | 39-2 | 1513, 2684 |
| Deer | 60-1 | 1367, 2833 |
| Deer | 60A-1X | 1378, 2754 |
| Elk | 1-1 | 1519, 2787 |
| Elk | 10A-1 | 71, 2828 |
| Elk | 3-2 | 1541, 2762 |
| Elk | 30A-1 | 1266, 2830 |
| Elk | 36-1 | 1551, 2764 |
| Elk | 36B-1 | 1376, 1411 |
| Elk | 39-2 | 1060, 2686 |
| Elk | 60-2 | 131, 2835 |
| Elk | 69-1X | 2693, 2771 |
| Pronghorn | 30-1 | 143, 2836 |
| Pronghorn | 36B-1 | 146, 2837 |

Two more worth flagging to IDFG separately: **`Deer 33` and `Deer 41-2` are
referenced by the current season but have no polygon in
`Hunting/MapServer/4` at all.** That is a data gap rather than an ambiguity —
those hunts cannot be mapped today.


---

## A distinction I had wrong: units are not hunts

I had a filter option labelled "General season units" pointing at the Game
Management Unit layer, which quietly asserts that a unit *is* a general hunt.
It is not.

| | What it is | Where it lives |
|---|---|---|
| **Game Management Unit** | An authoritative geographic boundary | `Hunting/MapServer/3` — a real data layer |
| **General season hunt** | A hunt defined in the seasons brochure that **references** one or more units | The brochure; API 1.1 `type=1` is a queryable view of it |
| **Controlled hunt** | A hunt whose area *is* a named hunt area with its own polygon | API 1.1 `type=2`, joins to `Hunting/MapServer/4` |

**The authoritative source for every season is the PDF at
<https://idfg.idaho.gov/rules>.** API 1.1 is a derived view of it, not the
record itself. Anything the application asserts about a season should be
traceable to the brochure, and the AI guardrails already say the booklet
governs — this is why.

### The general-hunt to GMU join

General hunts name their units in prose, and it is remarkably consistent:
**558 of 561 (99%) name at least one unit.**

```
"Unit 9"                                        -> 9
"Unit 4A"                                       -> 4A
"Portion of Unit 50"                            -> 50
"Unit 2, except Farragut SP"                    -> 2
"Private land in Units 46, 47, 54, 55, 56, 57"  -> 46, 47, 54, 55, 56, 57
```

The snapshot now extracts these into `unitsReferenced`, so a general hunt can
be drawn against the GMU layer. Two things it deliberately does **not** do:

- It does not interpret qualifiers. **42 hunts** say *portion of*, *except*,
  *private land*, *outside* or *within* — for those the polygon is an
  overstatement of where you may hunt, and the text governs. They carry
  `areaQualified: true` so the UI can say so rather than implying the whole
  unit is open.
- It does not treat the parsed list as authoritative. It records which units
  the text *mentions*. The brochure remains the record.

Also worth knowing: `tagArea` means different things by hunt type. On a
general hunt it is the **tag** — "Regular Deer Tag", "White-tailed Deer Tag",
"Pioneer A Tag". On a controlled hunt it is the **hunt area code**. Same field,
two meanings.

---

## Backlog

### Group-level transparency

Per-layer opacity already exists. What is missing is a master fader on each
group, and with 45 layers that is the difference between one gesture and
twelve.

The case is the stacking problem: hunt boundaries over land ownership over fire
perimeters is exactly the combination people need, and it is also opaque mud.
Fading *a whole category* to see the one underneath is the actual task.
Fading twelve layers individually to achieve it is not a feature, it is a chore.

**Design decision that matters: group opacity multiplies, it does not
override.**

```
effective = group.opacity × layer.opacity
```

A group slider is a master fader; the per-layer slider is trim. Multiplying
preserves the relationships someone has already dialled in — pull the group to
40% and the layer they had deliberately set to half stays half *of that*,
rather than being flattened to a single value. Overriding would silently
discard their work, and they would have to redo it every time they faded a
group.

Consequences to handle:

- The per-layer slider should show its own value, not the effective one, or the
  numbers stop making sense when the group moves.
- `groups[].opacity` becomes a config default, so a group that is always
  meant to sit behind — land management, for instance — can ship pre-faded.
- Group opacity belongs in the share URL alongside layer visibility, or a
  shared view will not look like what the sender saw.
- Zero should be reachable but distinguishable from "off": a group faded to
  nothing still reports its features on click, whereas a group switched off
  does not. Worth making that visible rather than confusing.

### Make a map click answer a question

Today a click returns whatever Esri's default popup finds: a feature from
whichever layer happened to be hit, paginated "1 of 6" when several overlap.
It answers *what is this polygon* — which is almost never what the person
wanted to know.

**A click is a location query, not a feature query.** The question is the same
one the whole application exists to answer, asked by pointing instead of by
filtering:

> What can I hunt here, and can I get on it?

#### Three inputs we already have and do not use

1. **Zoom** tells us the grain of answer wanted. Someone clicking at statewide
   zoom is asking a different question from someone clicking a drainage.
2. **Which layers are on** tells us what the person cares about. Layer state is
   currently only a draw instruction; it should also be a *reporting*
   instruction. If fire closures are switched on, a click near one should
   mention it.
3. **The inventory snapshot** turns a location into hunts, instantly and with
   no network call — the piece that was impossible before.

#### The response, in priority order

Lead with the hunt answer, not the polygon dump.

| Section | Answers | Source |
|---|---|---|
| **Where** | "Unit 39, Boise County" | GMU + county layers |
| **What can I hunt** | Tags valid here, with dates, weapon, ornament, permits — **filtered by whatever the user already has selected** | snapshot, matched on `unitsReferenced` / hunt area |
| **Can I get on it** | Ownership at the clicked point, nearest Access Yes!, road and trail status, motorized rule | SMA identify, Access Yes!, IDPR, restriction codes |
| **Warnings** | Closures, qualified areas, restrictions | fire closures, `areaQualified`, restrictions |
| **Everything under the cursor** | The raw feature hits, collapsed | the current behaviour, demoted rather than removed |

Respecting the active filters matters: if someone has already narrowed to
archery elk in October, a click should answer *for that*, not list all 47 tags
that touch the unit.

#### Zoom drives granularity

| Zoom | The honest answer |
|---|---|
| Statewide | "Unit 39." Naming a unit is all that is defensible at that scale — offer to zoom rather than pretend to precision |
| Regional | Unit, the hunts available in it, an access summary |
| Local | Ownership *at the point*, roads and trails, the Access Yes! parcel, closures — the "can I stand here" answer |

This also solves the overlap problem honestly: at coarse zoom there is genuinely
only one useful answer, and at fine zoom the point resolves to one parcel.

#### The correctness trap

**A polygon is not a permission.** 42 general hunts say *portion of*,
*except*, *private land* or *outside* — for those the GMU boundary overstates
where hunting is legal. A click inside such a unit must not reply "you can hunt
elk here". It must name the hunt, surface the qualifying text, and say the
brochure governs. This is the one part of the feature where being vague is
correct and being confident is dangerous.

Same rule for the 20 areas with an undecided boundary: if a click lands in one,
say the boundary is unconfirmed rather than drawing an authoritative-looking
answer.

#### Mechanics

- Query **only visible, queryable** layers — `view.hitTest` for graphics,
  `identify` for map-image layers, point queries for feature layers.
- Ownership at a point is a single cheap identify against the SMA service.
- Hunts come from the snapshot: an array filter, no request.
- Desktop can dock the result; mobile should use the existing bottom-sheet
  pattern rather than an Esri popup, which is cramped on a phone.
- Whatever renders it must be reachable by keyboard and announce itself — a
  click result that only exists visually is a step backwards from the list.

### Live attribution from layer metadata and the API

The Esri SDK already reserves a place for this: `MapView` renders an
`Attribution` widget, and every layer carries `copyright` plus
`attributionDataUrl`, which the SDK fetches and merges automatically as layers
come and go. Today the app shows only whatever the basemap supplies —
"Esri, HERE, Garmin, FAO, NOAA, USGS, EPA, NPS" — which credits the basemap and
nothing else, while the substantive data comes from BLM, USFS, IDL, IDPR, NIFC
and IDFG's own services.

The work: populate `copyright` on every layer from the config, so attribution
follows visible layers rather than the basemap alone, and add the Hunt Planner
API to it once the inventory is wired in.

Worth doing because it is three things at once:

- **Provenance.** A hunter reading a boundary should be able to see whose
  boundary it is. Several of the restored layers are other agencies' data.
- **Compliance.** Some of these services carry attribution requirements in
  their terms; the current app is arguably not meeting them.
- **A data-quality surface.** Attribution derived from live metadata goes
  visibly stale when a service is repointed or dies — the same early warning
  the service-health panel gives, in front of the user rather than an admin.

Config sketch, alongside the existing `disclaimer` block:

```yaml
  - id: surface-management
    attribution: "Surface management: US Bureau of Land Management"
    attributionUrl: https://www.blm.gov/services/geospatial
```

Two details to get right: the widget must stay legible against the map, which
means the accessible-contrast rules apply to it as much as to the chrome; and
attribution should list only layers actually **visible**, since a list of all
45 would be noise rather than credit.

---

## Errata — errors and data gaps found

Observed directly against live services on 25–26 August 2026. **fixed** items are
resolved in the current build; the rest are open, and **blocks** items stop work
described above.

### Hunt inventory ↔ geometry

| | |
|---|---|
| **blocks** | **`Deer 33` and `Deer 41-2` have no polygon.** Both are referenced by the current season in API 1.1 but absent from `Hunting/MapServer/4`. These hunts cannot be mapped. |
| **blocks** | **20 hunt areas resolve to more than one `AreaID`**, with nothing in either system marking which boundary is current. Nine deer, nine elk, two pronghorn — full list above. |
| **breaks joins** | **Species vocabularies disagree.** API says *Mule and White-tailed Deer*, *Mule Deer*, *White-tailed Deer*, *Pronghorn Antelope*; GIS says *Deer*, *Pronghorn*. Unaliased, 138 of 239 referenced areas silently fail to resolve. |

### API 1.1

| | |
|---|---|
| **doc bug** | The spec's `hunt` definition documents *fishing* fields — `id, name, var, loc, rfw, ffw, body, size` — copy-pasted from the Fishing Planner spec. The real response shares only `id`. |
| **breaks clients** | `/list` without a trailing slash returns **301 with an HTML body**. Clients that do not follow redirects get markup where they expect JSON. |
| **dead field** | `group_area` is returned on all 1,052 rows and is null on every one. |
| **dead codes** | `game` 102, 103, 104, 105 (upland bird, small game, waterfowl, upland game) return zero rows for every regulation year, as do `restriction` 5 and 6. |
| **design gap** | `restriction` filters but is never returned on a row. Access data can only be reconstructed by querying each code — the reason the snapshot stamps it at build time. |
| *(useful)* | `limit=1052` returns the entire corpus in **one request**; the snapshot needs no paging. |

### Map services — from the August audit

| | |
|---|---|
| **fixed** | GeoMAC fire perimeters and MODIS detections — DNS dead since the 2020 decommission, still wired into the live layer list. Now NIFC WFIGS and VIIRS. |
| **fixed** | `geomac_dyn` historic perimeters — HTTP 403. Now NIFC history. |
| **fixed** | BLM Idaho surface management — HTTP 404. Now the national SMA service. |
| **fixed** | ITD airports — HTTP 500. Now BTS aviation facilities. |
| **fixed** | Access Yes! deep link `?lyr=2` pointed at a URL missing its `/Hosted/` segment and always 404'd. |
| **fixed** | `Year = 2020` pinned on every controlled hunt layer. `Year` is not a season; filtering on it dropped valid areas. |
| **open** | **Fire Emergency Closures** — the AGOL item now requires a token. Ships disabled; re-share the item to restore it. |
| **open** | **`gis2.idaho.gov` unreachable** from the audit network (counties, campgrounds). Primaries repointed, originals kept as fallbacks; may resolve inside the IDFG network. |
| **open** | NLCD 2011 image service reports *service not started*. Layer dropped — already unreachable and hidden. |

### ArcGIS quirks worth knowing

| | |
|---|---|
| quirk | `returnCountOnly` + `returnDistinctValues` accepts exactly **one** `outField`. Composite counts need a grouped statistics query. |
| quirk | A paged `DISTINCT` query is rejected without an `ORDER BY`, and that order may only reference projected columns. |
