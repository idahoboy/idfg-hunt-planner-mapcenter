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
| **0** | Spike the API behind the existing rail. Swap `queryEngine` for the API on the big-game profile only. | Proves the reframe against the real UI in days. Nothing else changes. |
| **1** | Trip profiles in config. Big game default; predator and fishing as second profiles. | Delivers the grouping, reuses the config engine. |
| **2** | Ranking + the "price" model: permits, draw odds, access difficulty, distance. | This is what makes it Expedia rather than a filtered table. |
| **3** | AI intent → query (a), behind a flag, with an eval set. | Highest leverage, contained risk. |
| **4** | Explanation (b) and trip assembly (c). | Only once (a) is trustworthy. |
| **5** | Birds/waterfowl profile from layers; fishing depth via `/stocking` + `/returns`. | Serves the remaining audiences properly rather than badly. |

---

## 8. Open questions

1. **Draw odds.** Is there an endpoint or dataset for controlled-hunt draw
   statistics? Without it, ranking has no "price" for the 220 controlled elk
   hunts, and that is the single most valuable number to a hunter.
2. **Joining inventory to geometry.** `area` is prose ("Portion of Unit 50").
   The API takes `unit` and `zone` as filters, so the join exists in one
   direction — is there a per-hunt unit id in any response, or is text parsing
   the only path to highlighting a tag's actual footprint?
3. **API stability and terms.** Is 1.1 supported for third-party use, is there a
   rate limit, and is it the same instance the public site depends on?
4. **The boundary-version question** from the last session is still open with
   IDFG GIS and still gates KML and highlight accuracy.
5. **Points and licences.** "I have three points" is the most common real
   constraint. Is there any way to reflect it, or is it always user-asserted?
