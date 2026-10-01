#!/usr/bin/env node
/**
 * Record the current shape of every service the application depends on.
 *
 *   node scripts/snapshot-services.mjs [config/app.config.yml] [--counts]
 *
 * The inventory barely moves within a season — a five-week diff showed only
 * hunts ageing out. Services are the stream that actually decays, and every
 * defect this rebuild uncovered lived there: a fire service dead since 2020
 * and still wired in, a host that resolves but never completes a handshake,
 * season links that 404, a spec documenting the wrong object. None of it was
 * noticed because nothing was watching.
 *
 * This captures, per endpoint: reachability, the layer's name and geometry
 * type, its field names, sublayers, and a hash of that shape. Comparing two
 * captures then answers "what changed about our dependencies" in one pass.
 *
 * `--counts` additionally asks each feature layer how many records it holds.
 * That doubles the request count, so it is opt-in; record counts drift for
 * ordinary reasons and are more useful quarterly than weekly.
 */
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { archive, hashOf } from './lib/archive.mjs';

const [, , fileArg, ...flags] = process.argv;
const file = fileArg?.startsWith('--') ? 'config/app.config.yml' : (fileArg ?? 'config/app.config.yml');
const withCounts = flags.includes('--counts');

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;

let YAML;
try {
  const mod = await import('yaml');
  YAML = mod.default ?? mod;
} catch {
  console.error('The "yaml" package is required. Run: npm install');
  process.exit(1);
}

const raw = await readFile(file, 'utf8');
const config = YAML.parse(raw);
const roots = config.roots ?? {};

const resolve = (value) =>
  typeof value === 'string'
    ? value.replace(/\$\{roots\.([A-Za-z0-9_]+)\}/g, (m, k) => roots[k] ?? m)
    : value;

// ---------------------------------------------------------------------------
// Enumerate every endpoint the app can reach. Kept in one place so a new
// config section cannot quietly escape the watch.
// ---------------------------------------------------------------------------
const targets = new Map();
const add = (label, url, role) => {
  if (!url) return;
  const clean = resolve(String(url)).split('?')[0].replace(/\/$/, '');
  if (!/^https?:\/\//i.test(clean)) return;
  if (!targets.has(clean)) targets.set(clean, { label, role });
};

for (const layer of config.layers ?? []) {
  if (layer.enabled === false) continue;
  add(`layer:${layer.id}`, layer.url, 'layer');
  add(`layer:${layer.id} (fallback)`, layer.fallbackUrl, 'fallback');
}
for (const basemap of config.basemaps?.items ?? []) {
  add(`basemap:${basemap.id}`, basemap.url, 'basemap');
  add(`basemap:${basemap.id} (ref)`, basemap.referenceUrl, 'basemap');
}
for (const ctx of config.clickQuery?.context ?? []) add(`click:${ctx.id}`, ctx.url, 'click');
add('click:ownership', config.clickQuery?.ownership?.url, 'click');
for (const src of config.clickQuery?.access?.sources ?? []) add(`access:${src.id}`, src.url, 'access');
for (const pick of config.highlight?.pickLists ?? []) add(`highlight:${pick.id}`, pick.url, 'highlight');
add('print service', config.tools?.print?.serviceUrl, 'tool');
add('geocoder', config.tools?.search?.geocoder?.url, 'tool');

console.log(`Service snapshot — ${targets.size} endpoints${withCounts ? ' (with record counts)' : ''}`);
console.log('-'.repeat(52));

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, ms, httpStatus: res.status, detail: `HTTP ${res.status}` };
    const body = await res.json();
    if (body?.error) {
      // ArcGIS often leaves `message` empty and puts the useful sentence in
      // `details` — a blank failure reason is worse than no capture at all.
      const detail =
        body.error.message?.trim() ||
        (Array.isArray(body.error.details) ? body.error.details.join('; ') : '') ||
        `service error ${body.error.code ?? ''}`.trim();
      return { ok: false, ms, httpStatus: res.status, detail };
    }
    return { ok: true, ms, httpStatus: res.status, body };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      httpStatus: null,
      // A blackholed host times out rather than refusing; worth distinguishing,
      // because a timeout is far more damaging to a page than an error.
      detail: err.name === 'AbortError' ? 'timed out' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function capture(url, meta) {
  const res = await getJson(`${url}?f=json`);
  const base = { url, label: meta.label, role: meta.role, ms: res.ms, httpStatus: res.httpStatus };

  if (!res.ok) return { ...base, reachable: false, detail: res.detail, shapeHash: null };

  const b = res.body;
  const fields = Array.isArray(b.fields) ? b.fields.map((f) => f.name).sort() : null;
  const sublayers = Array.isArray(b.layers)
    ? b.layers.map((l) => ({ id: l.id, name: l.name }))
    : null;

  const shape = {
    name: b.name ?? b.mapName ?? null,
    type: b.type ?? (sublayers ? 'MapServer' : null),
    geometryType: b.geometryType ?? null,
    fields,
    sublayers,
  };

  let recordCount = null;
  if (withCounts && b.type === 'Feature Layer') {
    const c = await getJson(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
    recordCount = c.ok ? (c.body?.count ?? null) : null;
  }

  return {
    ...base,
    reachable: true,
    ...shape,
    maxRecordCount: b.maxRecordCount ?? null,
    recordCount,
    // One value that changes if anything structural about the service changes.
    shapeHash: hashOf(shape),
  };
}

const entries = [...targets.entries()];
const services = [];
for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const batch = entries.slice(i, i + CONCURRENCY);
  const done = await Promise.all(batch.map(([url, meta]) => capture(url, meta)));
  services.push(...done);
  for (const s of done) {
    const mark = s.reachable ? 'ok  ' : 'FAIL';
    const detail = s.reachable
      ? `${s.name ?? '-'}${s.fields ? ` · ${s.fields.length} fields` : ''}${s.recordCount !== null ? ` · ${s.recordCount} rows` : ''}`
      : s.detail;
    console.log(`  ${mark} ${String(s.ms).padStart(5)}ms  ${s.label.padEnd(34)} ${detail}`);
  }
}

services.sort((a, b) => a.label.localeCompare(b.label));

const unreachable = services.filter((s) => !s.reachable);
const payload = {
  kind: 'services',
  generated: new Date().toISOString(),
  config: file,
  counts: {
    endpoints: services.length,
    reachable: services.length - unreachable.length,
    unreachable: unreachable.length,
  },
  services,
};

const { file: written, unchanged, previous } = await archive('services', payload);

console.log('-'.repeat(52));
console.log(`endpoints      ${services.length}`);
console.log(`reachable      ${services.length - unreachable.length}`);
console.log(`unreachable    ${unreachable.length}`);
for (const s of unreachable) console.log(`  - ${s.label}: ${s.detail}`);
console.log(`\narchived       snapshots/${written}${unchanged ? '  (identical to previous — not rewritten)' : ''}`);
if (previous && !unchanged) {
  console.log(`previous       ${previous.file} (${previous.at.slice(0, 10)})`);
}

// Unreachable endpoints are the thing this exists to notice, but they are not
// a build failure: a snapshot of a degraded system is still a valid snapshot.
process.exitCode = 0;
