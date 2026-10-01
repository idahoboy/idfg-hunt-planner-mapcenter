/**
 * Comparison logic for two archived captures.
 *
 * Kept pure and separate from the CLI so the rules below are the only place
 * that decides what counts as a change, and so the same rules produce the
 * terminal summary and the report page.
 *
 * ONE RULE GOVERNS EVERYTHING HERE: compare a capture against a capture, never
 * against a live service or against `public/inventory.json`. An earlier attempt
 * compared a capture against the raw API and reported 358 permit changes; every
 * one was an artefact of the snapshot storing an unlimited hunt as `null` where
 * the API answers `999999`. Both sides must have been through the same
 * normalisation or the diff measures the normalisation, not the data.
 */

/** A removal rate above this is a season rollover, not hundreds of withdrawals. */
const ROLLOVER_FRACTION = 0.25;

/**
 * Fields watched on a hunt, and whether a change to one is news.
 *
 * `months` is absent deliberately: it is derived from the open and close dates,
 * so reporting it would say the same thing twice.
 */
const HUNT_FIELDS = {
  species:       { label: 'Species',          major: true },
  type:          { label: 'Hunt type',        major: true },
  method:        { label: 'Weapon',           major: true },
  ornament:      { label: 'Ornamentation',    major: true },
  openIso:       { label: 'Opens',            major: true },
  closeIso:      { label: 'Closes',           major: true },
  permits:       { label: 'Permits',          major: true },
  unlimited:     { label: 'Unlimited tags',   major: true },
  area:          { label: 'Hunt area',        major: true },
  areaIds:       { label: 'Boundary (AreaID)',major: true },
  unitsReferenced: { label: 'Units referenced', major: true },
  areaQualified: { label: 'Area has caveats', major: true },
  restrictions:  { label: 'Restrictions',     major: true },
  accessGrade:   { label: 'Access',           major: true },
  tag:           { label: 'Tag name',         major: false },
  season:        { label: 'Season name',      major: false },
  number:        { label: 'Hunt number',      major: false },
  game:          { label: 'Game (API wording)', major: false },
  tagArea:       { label: 'Tag area code',    major: false },
};

const VOCABULARIES = ['species', 'games', 'methods', 'ornaments', 'seasons'];

/** `null`, `undefined` and `''` all mean "not stated"; an array's order never does. */
function normalise(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v))).sort().join('|');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

const same = (a, b) => normalise(a) === normalise(b);

/** What a reader should see, as opposed to what `normalise` compares. */
function display(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function setDiff(before, after) {
  const b = new Set(before ?? []);
  const a = new Set(after ?? []);
  return {
    added: [...a].filter((x) => !b.has(x)).sort(),
    removed: [...b].filter((x) => !a.has(x)).sort(),
  };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/**
 * A hunt that vanished because its season is over is ordinary; a hunt that
 * vanished while its season was still ahead of it is the thing worth knowing.
 * The reference date is the later capture's own date, not today's, so an old
 * comparison does not reclassify itself as the archive ages.
 */
function classifyRemoval(hunt, asOf) {
  if (hunt.closeIso && hunt.closeIso < asOf) return 'expired';
  return 'withdrawn';
}

export function diffInventory(from, to) {
  const asOf = (to.generated ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const before = new Map((from.hunts ?? []).map((h) => [String(h.id), h]));
  const after = new Map((to.hunts ?? []).map((h) => [String(h.id), h]));

  const added = [];
  const expired = [];
  const withdrawn = [];
  const changed = [];

  for (const [id, hunt] of after) {
    if (!before.has(id)) {
      added.push(summariseHunt(hunt));
      continue;
    }
    const was = before.get(id);
    const fields = [];
    for (const [key, meta] of Object.entries(HUNT_FIELDS)) {
      if (same(was[key], hunt[key])) continue;
      fields.push({
        field: key,
        label: meta.label,
        major: meta.major,
        before: display(was[key]),
        after: display(hunt[key]),
      });
    }
    if (fields.length) {
      changed.push({
        ...summariseHunt(hunt),
        fields: fields.sort((a, b) => Number(b.major) - Number(a.major)),
        major: fields.some((f) => f.major),
      });
    }
  }

  for (const [id, hunt] of before) {
    if (after.has(id)) continue;
    const row = summariseHunt(hunt);
    (classifyRemoval(hunt, asOf) === 'expired' ? expired : withdrawn).push(row);
  }

  const removedCount = expired.length + withdrawn.length;
  const probableRollover =
    before.size > 0 && removedCount / before.size > ROLLOVER_FRACTION;

  const vocabulary = {};
  for (const name of VOCABULARIES) {
    const d = setDiff(from.vocabulary?.[name], to.vocabulary?.[name]);
    if (d.added.length || d.removed.length) vocabulary[name] = d;
  }

  return {
    kind: 'inventory',
    asOf,
    totals: {
      before: before.size,
      after: after.size,
      added: added.length,
      expired: expired.length,
      withdrawn: withdrawn.length,
      changed: changed.length,
      changedMajor: changed.filter((c) => c.major).length,
    },
    probableRollover,
    added: sortHunts(added),
    withdrawn: sortHunts(withdrawn),
    expired: sortHunts(expired),
    changed: sortHunts(changed),
    vocabulary,
    counts: diffCounts(from.counts, to.counts),
    dataQuality: diffDataQuality(from.dataQuality, to.dataQuality),
  };
}

function summariseHunt(h) {
  return {
    id: h.id,
    tagId: h.tagId ?? null,
    tag: h.tag ?? `Hunt ${h.id}`,
    species: h.species ?? null,
    type: h.type ?? null,
    area: h.area ?? null,
    method: h.method ?? null,
    open: h.openIso ?? h.open ?? null,
    close: h.closeIso ?? h.close ?? null,
  };
}

const sortHunts = (rows) =>
  rows.sort(
    (a, b) =>
      String(a.species).localeCompare(String(b.species)) ||
      String(a.tag).localeCompare(String(b.tag)),
  );

function diffCounts(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const rows = [];
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (b && typeof b === 'object') {
      // byAccessGrade and friends: one row per nested key.
      const sub = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].sort();
      for (const s of sub) {
        if (b?.[s] === a?.[s]) continue;
        rows.push({ metric: `${key}.${s}`, before: b?.[s] ?? 0, after: a?.[s] ?? 0 });
      }
      continue;
    }
    if (b === a) continue;
    rows.push({ metric: key, before: b ?? 0, after: a ?? 0 });
  }
  return rows;
}

function diffDataQuality(before = {}, after = {}) {
  const keyOf = (u) => `${u.species ?? ''} ${u.area ?? ''}`.trim();
  const unmappable = setDiff(
    (before.unmappable ?? []).map(keyOf),
    (after.unmappable ?? []).map(keyOf),
  );
  const ambiguous = setDiff(
    (before.ambiguousAreas ?? []).map(keyOf),
    (after.ambiguousAreas ?? []).map(keyOf),
  );
  return {
    unmappable: {
      ...unmappable,
      before: (before.unmappable ?? []).length,
      after: (after.unmappable ?? []).length,
    },
    ambiguous: {
      ...ambiguous,
      before: (before.ambiguousAreas ?? []).length,
      after: (after.ambiguousAreas ?? []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * Five categories, each meaning exactly one thing:
 *
 *   gained / lost  — the configuration now watches more, or fewer, endpoints
 *   broke / recovered — reachability changed; the endpoint set did not
 *   reshaped       — the service answered both times but answers differently
 *
 * Response time is deliberately not a change. It varies by tens of
 * milliseconds between runs and would bury everything above in noise.
 */
export function diffServices(from, to) {
  const before = new Map((from.services ?? []).map((s) => [s.url, s]));
  const after = new Map((to.services ?? []).map((s) => [s.url, s]));

  const gained = [];
  const lost = [];
  const broke = [];
  const recovered = [];
  const reshaped = [];

  for (const [url, svc] of after) {
    if (!before.has(url)) {
      gained.push(summariseService(svc));
      continue;
    }
    const was = before.get(url);

    if (was.reachable && !svc.reachable) {
      broke.push({ ...summariseService(svc), detail: svc.detail ?? 'unreachable' });
      continue;
    }
    if (!was.reachable && svc.reachable) {
      recovered.push({ ...summariseService(svc), detail: was.detail ?? 'was unreachable' });
      continue;
    }
    if (!was.reachable && !svc.reachable) {
      // Still down. Worth a row only if the reason changed.
      if (was.detail !== svc.detail) {
        broke.push({
          ...summariseService(svc),
          detail: `still unreachable, new reason: ${svc.detail ?? '—'} (was: ${was.detail ?? '—'})`,
          stillDown: true,
        });
      }
      continue;
    }

    if (was.shapeHash === svc.shapeHash) continue;

    const fields = setDiff(was.fields, svc.fields);
    const changes = [];
    if (!same(was.name, svc.name)) {
      changes.push({ what: 'Layer name', before: display(was.name), after: display(svc.name) });
    }
    if (!same(was.geometryType, svc.geometryType)) {
      changes.push({ what: 'Geometry', before: display(was.geometryType), after: display(svc.geometryType) });
    }
    if (!same(was.type, svc.type)) {
      changes.push({ what: 'Service type', before: display(was.type), after: display(svc.type) });
    }
    if (!same(was.maxRecordCount, svc.maxRecordCount)) {
      changes.push({ what: 'Max records per request', before: display(was.maxRecordCount), after: display(svc.maxRecordCount) });
    }
    if (!same(
      (was.sublayers ?? []).map((l) => `${l.id}:${l.name}`),
      (svc.sublayers ?? []).map((l) => `${l.id}:${l.name}`),
    )) {
      const sub = setDiff(
        (was.sublayers ?? []).map((l) => `${l.id}: ${l.name}`),
        (svc.sublayers ?? []).map((l) => `${l.id}: ${l.name}`),
      );
      changes.push({ what: 'Sublayers', before: sub.removed.join(', ') || '—', after: sub.added.join(', ') || '—' });
    }

    reshaped.push({
      ...summariseService(svc),
      fieldsAdded: fields.added,
      fieldsRemoved: fields.removed,
      changes,
      // A field the application reads disappearing is the failure mode that
      // breaks a popup silently, so it ranks above a cosmetic rename.
      major: fields.removed.length > 0 || changes.some((c) => c.what === 'Geometry'),
    });
  }

  for (const [url, svc] of before) {
    if (!after.has(url)) lost.push(summariseService(svc));
  }

  const stillDown = [...after.values()].filter((s) => !s.reachable);

  return {
    kind: 'services',
    totals: {
      before: before.size,
      after: after.size,
      gained: gained.length,
      lost: lost.length,
      broke: broke.length,
      recovered: recovered.length,
      reshaped: reshaped.length,
      unreachableNow: stillDown.length,
    },
    gained: sortServices(gained),
    lost: sortServices(lost),
    broke: sortServices(broke),
    recovered: sortServices(recovered),
    reshaped: sortServices(reshaped),
    unreachable: sortServices(stillDown.map((s) => ({ ...summariseService(s), detail: s.detail ?? 'unreachable' }))),
  };
}

function summariseService(s) {
  return {
    url: s.url,
    label: s.label,
    role: s.role,
    name: s.name ?? null,
    reachable: s.reachable ?? false,
  };
}

const sortServices = (rows) => rows.sort((a, b) => String(a.label).localeCompare(String(b.label)));
