#!/usr/bin/env node
/**
 * Snapshot the IDFG Hunt Planner inventory into a static file.
 *
 *   node scripts/build-inventory.mjs [--out public/inventory.json]
 *
 * Why a snapshot rather than a runtime proxy: API 1.1 is fifteen years old and
 * may fall over under concurrency. The entire published inventory is ~1,050
 * rows, so it is fetched once, joined to geometry, and written to disk. Every
 * request the application would have made becomes a local array filter.
 *
 * The run is deliberately serial and unhurried — one request at a time, with a
 * pause between — because being gentle with that server is the whole point.
 *
 * Also emits a data-quality report: hunts that cannot be mapped, hunt areas
 * with more than one candidate boundary, and unused vocabulary. That report is
 * the document IDFG needs in order to answer the open questions.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const HUNT_API = 'https://idfg.idaho.gov/ifwis/huntplanner/api/1.1/list/';
const HUNT_GIS =
  'https://gisportal-idfg.idaho.gov/hosting/rest/services/Hunting/MapServer/4/query';

const POLITE_DELAY_MS = 250;
const TIMEOUT_MS = 60_000;
const SEP = '';

/**
 * The two systems name game differently. Without this table 138 of 239
 * referenced hunt areas silently fail to join, which looks like missing
 * geometry rather than a vocabulary mismatch.
 */
const SPECIES_ALIASES = {
  'Mule and White-tailed Deer': 'Deer',
  'Mule Deer': 'Deer',
  'White-tailed Deer': 'Deer',
  'Pronghorn Antelope': 'Pronghorn',
};

/**
 * `restriction` is a filter parameter and is never returned on a row, so the
 * only way to learn which hunts carry which restriction is to ask for each one
 * and record the ids that come back. Codes are from the API's own docs.
 *
 * `access` marks the ones that describe getting onto the ground, which is what
 * the access grade is computed from. The others are real restrictions but
 * concern weapons, age or reporting rather than access.
 */
const RESTRICTIONS = [
  { code: 1, label: 'Limited access', access: 'limited' },
  { code: 2, label: 'Very limited access — few roads, private property, only part of the unit open', access: 'limited' },
  { code: 3, label: 'EXTREMELY LIMITED ACCESS — obtain permission before buying this tag', access: 'permission' },
  { code: 4, label: 'Motorized Hunting Rule', access: 'rule' },
  { code: 7, label: 'Only a portion of this area is open', access: 'limited' },
  { code: 24, label: 'Outside National Forest Boundary only', access: 'rule' },
  { code: 27, label: 'Outside National Forest Boundary, near cultivated crops only', access: 'rule' },
  { code: 29, label: 'Landowner Permission Hunt — written permission required to apply', access: 'permission' },
  { code: 33, label: 'Lolo Motorway permit required', access: 'rule' },
  { code: 34, label: 'INEEL pass required', access: 'rule' },
  { code: 5, label: 'Youth hunt, ages 12-17' },
  { code: 6, label: 'Short-range weapons only in a portion of this hunt' },
  { code: 23, label: 'Caution — archers: any-weapon antlerless elk hunts overlap' },
  { code: 30, label: 'Bait prohibited' },
  { code: 31, label: 'A second animal may be taken in all or part of this unit' },
  { code: 32, label: 'Dogs prohibited' },
  { code: 40, label: 'Youth hunt, 15 or younger' },
  { code: 41, label: 'Mandatory check, report and pelt tag' },
  { code: 42, label: 'Valid only on dates the unit is open to general tag holders' },
  { code: 43, label: 'New hunt' },
  { code: 44, label: 'Boundary change from previous hunt area' },
  { code: 45, label: 'Dogs prohibited during part of this hunt' },
  { code: 46, label: 'Youth hunt, ages 10-17' },
  { code: 47, label: 'Caution — archers and muzzleloaders: any-weapon elk hunts overlap' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Game Management Units are an authoritative geographic layer. A general
 * season hunt is NOT a unit — it is defined in the seasons brochure and
 * *references* one or more units in prose: "Unit 9", "Portion of Unit 50",
 * "Private land in Units 46, 47, 54, 55, 56 and 57".
 *
 * This extracts those references so a general hunt can be drawn against the
 * GMU layer. It is parsed prose, not an authoritative key: the extracted list
 * says which units the text mentions, and qualifiers like "Portion of" or
 * "except Farragut SP" are deliberately NOT interpreted. The brochure at
 * idfg.idaho.gov/rules governs.
 */
function unitsReferenced(area) {
  if (!area) return [];
  const m = /\bUnits?\b/i.exec(area);
  if (!m) return [];
  const tail = area.slice(m.index);
  const found = tail.match(/\b\d+[A-Z]?\b/g) ?? [];
  return [...new Set(found)];
}

async function getJson(url, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // The trailing slash matters: without it the API answers 301 with an HTML
    // body, which a client that does not follow redirects will try to parse.
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`expected JSON, got ${text.slice(0, 80)}`);
    }
  } catch (err) {
    throw new Error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

const normaliseSpecies = (game) =>
  SPECIES_ALIASES[String(game).trim()] ?? String(game).trim();

async function fetchInventory() {
  // Ask for the total first so the snapshot cannot silently truncate when the
  // season grows; limit=<total> then returns the whole corpus in one request.
  const probe = await getJson(`${HUNT_API}?limit=1`, 'inventory probe');
  const total = Number(probe.total) || 0;
  console.log(`  published opportunities: ${total.toLocaleString()}`);

  await sleep(POLITE_DELAY_MS);
  const all = await getJson(`${HUNT_API}?limit=${total}`, 'inventory');
  const rows = all.rows ?? [];
  if (rows.length !== total) {
    console.warn(`  ! expected ${total} rows, received ${rows.length}`);
  }
  return rows;
}

async function fetchRestrictionMap() {
  const byId = new Map();
  const unused = [];
  for (const r of RESTRICTIONS) {
    await sleep(POLITE_DELAY_MS);
    let d;
    try {
      d = await getJson(
        `${HUNT_API}?restriction=${r.code}&limit=2000`,
        `restriction ${r.code}`,
      );
    } catch (err) {
      console.warn(`  ! ${err.message}`);
      continue;
    }
    const rows = d.rows ?? [];
    if (rows.length === 0) {
      unused.push(r.code);
      continue;
    }
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, []);
      byId.get(row.id).push(r.code);
    }
    console.log(`  restriction ${String(r.code).padStart(2)}: ${String(rows.length).padStart(4)} rows`);
  }
  return { byId, unused };
}

/**
 * Bounding boxes for every hunt area and unit.
 *
 * "Zoom to" does not need geometry, it needs four numbers. The full GMU layer
 * is 22MB of vertices; an extent is 168 bytes. Rather than 300+ extent queries,
 * the geometry is pulled ONCE per layer at a coarse `maxAllowableOffset` —
 * which drops the GMU payload from 22MB to 74KB — and the boxes are computed
 * here. A box derived from simplified geometry is identical to one derived
 * from full geometry at any zoom a person would use it for.
 */
async function fetchExtents(url, keyFields, offset = 0.01) {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: keyFields.join(','),
    returnGeometry: 'true',
    maxAllowableOffset: String(offset),
    outSR: '4326',
    f: 'json',
  });
  const d = await getJson(`${url}?${q}`, `extents for ${url}`);
  const out = new Map();
  for (const f of d.features ?? []) {
    const rings = f.geometry?.rings;
    if (!rings) continue;
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < xmin) xmin = x;
        if (y < ymin) ymin = y;
        if (x > xmax) xmax = x;
        if (y > ymax) ymax = y;
      }
    }
    if (!Number.isFinite(xmin)) continue;
    const key = keyFields.map((k) => String(f.attributes[k] ?? '').trim()).join(SEP);
    const prev = out.get(key);
    // A key can span several rings or rows; keep the union.
    out.set(
      key,
      prev
        ? [Math.min(prev[0], xmin), Math.min(prev[1], ymin), Math.max(prev[2], xmax), Math.max(prev[3], ymax)]
        : [xmin, ymin, xmax, ymax].map((n) => Number(n.toFixed(5))),
    );
  }
  return out;
}

async function fetchHuntAreaIndex() {
  const url =
    `${HUNT_GIS}?where=1%3D1&outFields=AreaID,BigGame,HuntArea&returnGeometry=false` +
    `&returnDistinctValues=true&orderByFields=BigGame,HuntArea&f=json`;
  const d = await getJson(url, 'hunt area geometry index');
  const byKey = new Map();
  for (const f of d.features ?? []) {
    const a = f.attributes;
    const key = `${String(a.BigGame).trim()}${SEP}${String(a.HuntArea).trim()}`;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(Number(a.AreaID));
  }
  return byKey;
}

/** Worst-case wins: permission beats limited beats rule beats open. */
function grade(codes) {
  const kinds = new Set(
    codes.map((c) => RESTRICTIONS.find((r) => r.code === c)?.access).filter(Boolean),
  );
  if (kinds.has('permission')) return 'permission';
  if (kinds.has('limited')) return 'limited';
  if (kinds.has('rule')) return 'rule';
  return 'open';
}

async function main() {
  const outArg = process.argv.indexOf('--out');
  const outPath = resolve(outArg > -1 ? process.argv[outArg + 1] : 'public/inventory.json');

  console.log('Hunt Planner inventory snapshot');
  console.log('-------------------------------');

  console.log('1. inventory');
  const rows = await fetchInventory();

  console.log('2. access restrictions (one request per code)');
  const { byId: restrictionsById, unused } = await fetchRestrictionMap();

  console.log('3. hunt area geometry index');
  const areaIndex = await fetchHuntAreaIndex();
  console.log(`  distinct BigGame + HuntArea pairs in GIS: ${areaIndex.size}`);

  console.log('4. extents (one coarse request per layer, boxes computed locally)');
  const [areaExtents, unitExtents] = await Promise.all([
    fetchExtents(HUNT_GIS, ['AreaID']).catch(() => new Map()),
    fetchExtents(
      'https://gisportal-idfg.idaho.gov/hosting/rest/services/Hunting/MapServer/3/query',
      ['NAME'],
    ).catch(() => new Map()),
  ]);
  console.log(`  hunt-area boxes: ${areaExtents.size}   unit boxes: ${unitExtents.size}`);

  console.log('5. join');
  const referenced = new Set();
  const ambiguous = new Map();
  const unmappable = [];

  const hunts = rows.map((row) => {
    const species = normaliseSpecies(row.game);
    const area = row.area == null ? '' : String(row.area).trim();
    const codes = restrictionsById.get(row.id) ?? [];

    // Only controlled hunts name a hunt area that maps to a polygon, and even
    // then some describe their area in prose instead of a code — "Portion of
    // Units 54, 55 and 57". A hunt-area code always starts with a digit and
    // never contains a space, so prose is separated out rather than being
    // reported as missing geometry, which it is not.
    const isControlled = /controlled/i.test(String(row.season));
    const isAreaCode = /^\d/.test(area) && !/\s/.test(area);
    let areaIds = null;

    if (isControlled && area && isAreaCode) {
      const key = `${species}${SEP}${area}`;
      const candidates = areaIndex.get(key);
      if (!candidates) {
        unmappable.push({ species, area, tag: row.tag });
      } else {
        referenced.add(key);
        areaIds = [...candidates].sort((a, b) => a - b);
        if (areaIds.length > 1) ambiguous.set(key, areaIds);
      }
    }

    return {
      id: row.id,
      tagId: row.tagid,
      tag: row.tag,
      season: row.season,
      type: isControlled ? 'controlled' : 'general',
      number: row.number ?? null,
      game: String(row.game).trim(),
      species,
      method: row.method,
      ornament: row.ornament,
      open: row.open,
      close: row.close,
      permits: row.permits === 999999 ? null : row.permits,
      unlimited: row.permits === 999999,
      area,
      // prose areas cannot be mapped to a hunt-area polygon; the UI needs to
      // know that so it can say "see the note" rather than showing nothing.
      areaIsCode: isAreaCode,
      // GMUs the area text mentions. A reference, not an identity — and the
      // qualifiers ("Portion of", "except ...") are not interpreted.
      unitsReferenced: unitsReferenced(area),
      areaQualified: /\b(portion|except|private|outside|within)\b/i.test(area),
      tagArea: row.tagarea,
      restrictions: codes,
      accessGrade: grade(codes),
      // null when the hunt names no mappable area; one id when the season
      // resolves it unambiguously; several when the boundary is undecided.
      areaIds,
    };
  });

  const proseAreas = hunts.filter((h) => h.type === 'controlled' && h.area && !h.areaIsCode).length;
  const generals = hunts.filter((h) => h.type === 'general');
  const generalWithUnits = generals.filter((h) => h.unitsReferenced.length > 0).length;
  const generalQualified = generals.filter((h) => h.areaQualified).length;
  const unreferenced = [...areaIndex.keys()].filter((k) => !referenced.has(k));
  const byGrade = hunts.reduce(
    (acc, h) => ((acc[h.accessGrade] = (acc[h.accessGrade] ?? 0) + 1), acc),
    {},
  );

  const snapshot = {
    generated: new Date().toISOString(),
    source: HUNT_API,
    counts: {
      hunts: hunts.length,
      controlled: hunts.filter((h) => h.type === 'controlled').length,
      general: hunts.filter((h) => h.type === 'general').length,
      mappedAreas: referenced.size,
      byAccessGrade: byGrade,
    },
    // Four numbers per feature. This is what makes "zoom to" instant and free.
    extents: {
      areas: Object.fromEntries(areaExtents),
      units: Object.fromEntries(unitExtents),
    },
    vocabulary: {
      species: [...new Set(hunts.map((h) => h.species))].sort(),
      games: [...new Set(hunts.map((h) => h.game))].sort(),
      methods: [...new Set(hunts.map((h) => h.method))].sort(),
      ornaments: [...new Set(hunts.map((h) => h.ornament))].filter(Boolean).sort(),
      seasons: [...new Set(hunts.map((h) => h.season))].sort(),
      restrictions: RESTRICTIONS.filter((r) => !unused.includes(r.code)),
    },
    dataQuality: {
      unmappable,
      ambiguousAreas: [...ambiguous.entries()].map(([k, ids]) => {
        const [species, area] = k.split(SEP);
        return { species, area, candidates: ids };
      }),
      proseAreaHunts: proseAreas,
      generalHuntsReferencingUnits: generalWithUnits,
      generalHuntsWithQualifiedArea: generalQualified,
      unreferencedGisAreas: unreferenced.length,
      unusedRestrictionCodes: unused,
    },
    hunts,
  };

  const json = JSON.stringify(snapshot);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json, 'utf8');

  console.log(`\nWrote ${outPath} (${Math.round(Buffer.byteLength(json) / 1024)} KB)`);
  console.log('-------------------------------');
  console.log(`hunts                    ${hunts.length}`);
  console.log(`  controlled             ${snapshot.counts.controlled}`);
  console.log(`  general                ${snapshot.counts.general}`);
  console.log(`mapped hunt areas        ${referenced.size}`);
  console.log('access grades           ', byGrade);
  console.log('\nDATA QUALITY');
  console.log(`  unmappable hunts       ${unmappable.length}`);
  console.log(`  prose areas (no code)  ${proseAreas} — describe their area in words, not a code`);
  console.log(`  general -> GMU refs     ${generalWithUnits} of ${generals.length} general hunts name a unit`);
  console.log(`  qualified areas         ${generalQualified} say "portion of" / "except" / "private" — text governs, not the polygon`);
  console.log(`  ambiguous areas        ${ambiguous.size}`);
  console.log(`  unreferenced in GIS    ${unreferenced.length} (historical, never drawn)`);
  console.log(`  unused restriction codes ${unused.join(', ') || 'none'}`);

  if (unmappable.length) {
    console.log('\n  hunts with no polygon at all:');
    const seen = new Set();
    for (const u of unmappable) {
      const k = `${u.species} ${u.area}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`    ${k}`);
    }
  }
  if (ambiguous.size) {
    console.log('\n  areas with more than one candidate boundary:');
    for (const [k, ids] of [...ambiguous].sort()) {
      const [species, area] = k.split(SEP);
      console.log(`    ${species} ${area} -> ${ids.join(', ')}`);
    }
  }

  // Non-zero only when a hunt cannot be mapped at all, so CI can flag it.
  process.exitCode = unmappable.length > 0 ? 3 : 0;
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exitCode = 1;
});
