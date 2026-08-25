#!/usr/bin/env node
/**
 * Validates config/app.config.yml and, with --probe, checks that every ArcGIS
 * endpoint it references is actually alive.
 *
 *   node scripts/validate-config.mjs config/app.config.yml
 *   node scripts/validate-config.mjs config/app.config.yml --probe
 *
 * Exit codes: 0 ok, 1 structural problem, 2 one or more endpoints unreachable.
 */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const [, , fileArg, ...flags] = process.argv;
const file = fileArg ?? 'config/app.config.yml';
const probe = flags.includes('--probe');
const timeoutMs = 25_000;

const ESC = String.fromCharCode(27);
const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];
const paint = (code) => (useColor ? `${ESC}[${code}m` : '');
const C = {
  reset: paint(0),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  dim: paint(2),
  bold: paint(1),
};

let YAML;
try {
  const mod = await import('yaml');
  YAML = mod.default ?? mod;
} catch {
  console.error(`${C.red}The "yaml" package is required. Run: npm install${C.reset}`);
  process.exit(1);
}

const text = await readFile(file, 'utf8').catch((err) => {
  console.error(`${C.red}Cannot read ${file}: ${err.message}${C.reset}`);
  process.exit(1);
});

let config;
try {
  config = YAML.parse(text);
} catch (err) {
  console.error(`${C.red}YAML parse error in ${file}:${C.reset}\n${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- interpolate
const roots = config.roots ?? {};
function interpolate(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{roots\.([A-Za-z0-9_]+)\}/g, (m, key) => roots[key] ?? m);
  }
  if (Array.isArray(value)) return value.map(interpolate);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v)]));
  }
  return value;
}
const resolved = interpolate(config);

// ---------------------------------------------------------------- structure
const problems = [];
const warnings = [];
const requireThat = (condition, message) => {
  if (!condition) problems.push(message);
};

requireThat(Array.isArray(resolved.layers), 'layers must be an array');
requireThat(Array.isArray(resolved.groups), 'groups must be an array');
requireThat((resolved.basemaps?.items?.length ?? 0) > 0, 'basemaps.items must have at least one entry');

const groupIds = new Set((resolved.groups ?? []).map((g) => g.id));
const layerIds = new Set();

for (const layer of resolved.layers ?? []) {
  if (!layer.id) {
    problems.push('a layer is missing "id"');
    continue;
  }
  if (layerIds.has(layer.id)) problems.push(`duplicate layer id "${layer.id}"`);
  layerIds.add(layer.id);
  if (!layer.url) problems.push(`layer "${layer.id}" is missing "url"`);
  if (!groupIds.has(layer.group)) problems.push(`layer "${layer.id}" has unknown group "${layer.group}"`);
  if (layer.url?.includes('${roots.')) problems.push(`layer "${layer.id}" has an unresolved roots reference`);
  if (layer.health === 'unverified') warnings.push(`layer "${layer.id}" is marked unverified`);
  if (layer.enabled === false) warnings.push(`layer "${layer.id}" is disabled (enabled: false)`);
}

// legacyBit collisions inside a group would make old deep links ambiguous
for (const group of resolved.groups ?? []) {
  const seen = new Map();
  for (const layer of (resolved.layers ?? []).filter((l) => l.group === group.id)) {
    if (layer.legacyBit === undefined) continue;
    if (seen.has(layer.legacyBit)) {
      problems.push(
        `legacyBit ${layer.legacyBit} is used by both "${seen.get(layer.legacyBit)}" and "${layer.id}" in group "${group.id}"`,
      );
    }
    seen.set(layer.legacyBit, layer.id);
  }
}

const basemapIds = new Set((resolved.basemaps?.items ?? []).map((b) => b.id));
if (resolved.basemaps?.default && !basemapIds.has(resolved.basemaps.default)) {
  problems.push(`basemaps.default "${resolved.basemaps.default}" is not in basemaps.items`);
}

for (const source of resolved.huntFinder?.sources ?? []) {
  if (source.dedupeBy && !(source.orderBy ?? []).length) {
    problems.push(
      `source "${source.id}" sets dedupeBy without orderBy — the service rejects paged DISTINCT queries with no ORDER BY`,
    );
  }
  if (source.dedupeBy) {
    // A deduped source runs a paged DISTINCT query. The server requires that
    // ORDER BY reference only projected columns, and DISTINCT applies to the
    // projection — so identity, projection, and sort must line up.
    const fields = Array.isArray(source.dedupeBy) ? source.dedupeBy : [source.dedupeBy];
    const out = source.outFields ?? [];
    const order = source.orderBy ?? [];

    const notProjected = fields.filter((f) => !out.includes(f));
    if (notProjected.length) {
      problems.push(
        `source "${source.id}" dedupeBy names ${notProjected.join(', ')}, which are not in outFields`,
      );
    }
    const extraColumns = out.filter((f) => f !== '*' && !fields.includes(f));
    if (extraColumns.length) {
      problems.push(
        `source "${source.id}" is deduped but projects ${extraColumns.join(', ')} beyond dedupeBy — ` +
          'extra columns split rows that represent the same area back apart',
      );
    }
    if (!order.length) {
      problems.push(
        `source "${source.id}" sets dedupeBy without orderBy — the service rejects paged DISTINCT queries with no ORDER BY`,
      );
    }
    const unsortable = order.filter((f) => !fields.includes(f));
    if (unsortable.length) {
      problems.push(
        `source "${source.id}" orders by ${unsortable.join(', ')}, which is not projected under DISTINCT`,
      );
    }
  }
}

const sourceIds = new Set((resolved.huntFinder?.sources ?? []).map((s) => s.id));
for (const facet of resolved.huntFinder?.facets ?? []) {
  if (facet.source === 'live' && facet.from && !sourceIds.has(facet.from) && !facet.lookup) {
    problems.push(`facet "${facet.id}" reads from unknown source "${facet.from}"`);
  }
  for (const target of facet.appliesTo ?? []) {
    if (!sourceIds.has(target)) problems.push(`facet "${facet.id}" appliesTo unknown source "${target}"`);
  }
}

// ---------------------------------------------------------------- report
console.log(`${C.bold}Config: ${file}${C.reset}`);
console.log(
  `  ${resolved.layers?.length ?? 0} layers | ${resolved.groups?.length ?? 0} groups | ` +
    `${resolved.basemaps?.items?.length ?? 0} basemaps | ` +
    `${resolved.huntFinder?.sources?.length ?? 0} finder sources | ` +
    `${resolved.huntFinder?.facets?.length ?? 0} facets`,
);

for (const warning of warnings) console.log(`  ${C.yellow}warn${C.reset}  ${warning}`);
for (const problem of problems) console.log(`  ${C.red}error${C.reset} ${problem}`);

if (problems.length > 0) {
  console.log(`\n${C.red}${problems.length} structural problem(s).${C.reset}`);
  process.exit(1);
}
console.log(`  ${C.green}structure ok${C.reset}`);

if (!probe) process.exit(0);

// ---------------------------------------------------------------- probe
const targets = new Map();
function addTarget(label, url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
  const clean = url.split('?')[0];
  if (!targets.has(clean)) targets.set(clean, label);
}

for (const layer of resolved.layers ?? []) {
  if (layer.enabled === false) continue; // deliberately switched off
  addTarget(`layer:${layer.id}`, layer.url);
  addTarget(`layer:${layer.id} (fallback)`, layer.fallbackUrl);
}
for (const basemap of resolved.basemaps?.items ?? []) {
  addTarget(`basemap:${basemap.id}`, basemap.url);
  addTarget(`basemap:${basemap.id} (ref)`, basemap.referenceUrl);
}
for (const source of resolved.huntFinder?.sources ?? []) addTarget(`finder:${source.id}`, source.url);
for (const [key, entry] of Object.entries(resolved.highlight?.queryLayers ?? {})) {
  addTarget(`highlight:lyr=${key}`, entry.url);
}
addTarget('print service', resolved.tools?.print?.serviceUrl);

console.log(`\n${C.bold}Probing ${targets.size} endpoints...${C.reset}`);

async function probeUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}?f=json`, { signal: controller.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json();
    if (body?.error) return { ok: false, detail: body.error.message ?? 'service error' };
    return { ok: true, detail: body.name ?? body.mapName ?? 'ok' };
  } catch (err) {
    return { ok: false, detail: err.name === 'AbortError' ? 'timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const entries = [...targets.entries()];
const results = [];
const CONCURRENCY = 12;
for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const batch = entries.slice(i, i + CONCURRENCY);
  const settled = await Promise.all(
    batch.map(async ([url, label]) => ({ url, label, ...(await probeUrl(url)) })),
  );
  results.push(...settled);
}

// A failing fallbackUrl is expected when its primary is healthy: the fallback
// exists precisely because that service is unreliable. Report it, do not fail.
const isFallback = (label) => label.includes('(fallback)');
const failed = results.filter((r) => !r.ok && !isFallback(r.label));
const degraded = results.filter((r) => !r.ok && isFallback(r.label));

for (const result of results) {
  const mark = result.ok
    ? `${C.green}ok  ${C.reset}`
    : isFallback(result.label)
      ? `${C.yellow}warn${C.reset}`
      : `${C.red}FAIL${C.reset}`;
  console.log(`  ${mark} ${result.label.padEnd(38)} ${C.dim}${result.detail}${C.reset}`);
  if (!result.ok) console.log(`       ${C.dim}${result.url}${C.reset}`);
}

console.log(`\n${results.length - failed.length - degraded.length}/${results.length} endpoints responding.`);
if (degraded.length > 0) {
  console.log(`${C.yellow}${degraded.length} unused fallback endpoint(s) unreachable (primary is healthy).${C.reset}`);
}
if (failed.length > 0) {
  console.log(`${C.red}${failed.length} required endpoint(s) unreachable.${C.reset}`);
  process.exit(2);
}
console.log(`${C.green}All required endpoints responding.${C.reset}`);
