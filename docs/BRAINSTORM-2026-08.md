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

Still open — and now a one-line answer rather than an investigation:

> Of **574** distinct `BigGame` + `HuntArea` pairs, **523 (91%) already resolve
> to exactly one `AreaID`.** Only **51** are ambiguous, and none has more than
> three versions. In every one, the versions split into a low id and a high id
> in the 2680–2840 band, which looks like a bulk re-issue.
>
> **All I need: is the highest `AreaID` the current boundary?** If yes, that is
> one line in the cache builder and the question is closed. If not, a list of
> the 51 correct ids closes it just as well.

Examples: `Elk 1-1` → 1519 or 2787 · `Deer 10A` → 184 or 2827 ·
`Deer 1-1X` → 1518, 1519 or 2814.
