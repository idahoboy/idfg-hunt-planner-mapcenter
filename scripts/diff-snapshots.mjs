#!/usr/bin/env node
/**
 * Compare two archived captures and publish the result.
 *
 *   node scripts/diff-snapshots.mjs                    # last two of each kind
 *   node scripts/diff-snapshots.mjs --kind services
 *   node scripts/diff-snapshots.mjs --from 2026-08-27 --to 2026-10-01
 *   node scripts/diff-snapshots.mjs --out public/changes.json
 *   node scripts/diff-snapshots.mjs --quiet            # write only
 *
 * Reads only from `snapshots/`. It will not accept a live service or
 * `public/inventory.json` as one side of a comparison, and that restriction is
 * the feature: an earlier attempt compared a capture against the raw API and
 * produced 358 permit changes that were purely an artefact of the two sides
 * normalising `unlimited` differently. Both sides come out of the same writer
 * or there is nothing meaningful to measure.
 *
 * Writes `public/changes.json` for the report page at /changes.html, and prints
 * a summary that stands on its own without it.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { readCapture, latestDistinct, resolveCapture, readManifest } from './lib/archive.mjs';
import { diffInventory, diffServices } from './lib/diff.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const kinds = (() => {
  const k = flag('kind', 'all');
  return k === 'all' ? ['inventory', 'services'] : [k];
})();
const out = flag('out', 'public/changes.json');
const quiet = has('quiet');

const DIFFERS = { inventory: diffInventory, services: diffServices };

/** Picks the two captures to compare, and says why when it cannot. */
async function selectPair(kind) {
  const fromArg = flag('from');
  const toArg = flag('to');

  if (fromArg || toArg) {
    const from = fromArg ? await resolveCapture(kind, fromArg) : (await latestDistinct(kind, 1))[0];
    const to = toArg ? await resolveCapture(kind, toArg) : (await latestDistinct(kind, 1))[0];
    if (!from) return { error: `no ${kind} capture matching "${fromArg}"` };
    if (!to) return { error: `no ${kind} capture matching "${toArg}"` };
    if (from.hash === to.hash) return { error: `those two ${kind} captures are the same capture` };
    // Whichever is older is the "before", regardless of which flag named it.
    return from.at <= to.at ? { from, to } : { from: to, to: from };
  }

  const [newest, previous] = await latestDistinct(kind, 2);
  if (!newest) return { error: `no ${kind} captures in the archive yet` };
  if (!previous) return { baselineOnly: newest };
  return { from: previous, to: newest };
}

const report = {
  generated: new Date().toISOString(),
  archive: (await readManifest()).captures,
  comparisons: {},
};

const lines = [];
const say = (s = '') => {
  lines.push(s);
  if (!quiet) console.log(s);
};

for (const kind of kinds) {
  if (!DIFFERS[kind]) {
    console.error(`unknown kind "${kind}" (expected inventory, services, or all)`);
    process.exit(1);
  }

  const pair = await selectPair(kind);

  if (pair.error) {
    report.comparisons[kind] = { unavailable: pair.error };
    say(`${kind}: ${pair.error}`);
    say();
    continue;
  }

  if (pair.baselineOnly) {
    const note =
      `baseline only — one ${kind} capture (${pair.baselineOnly.at.slice(0, 10)}). ` +
      `The first comparison is available after the next capture that differs.`;
    report.comparisons[kind] = { unavailable: note, baseline: pair.baselineOnly };
    say(`${kind}: ${note}`);
    say();
    continue;
  }

  const [from, to] = [await readCapture(pair.from.file), await readCapture(pair.to.file)];
  const diff = DIFFERS[kind](from, to);

  report.comparisons[kind] = {
    ...diff,
    from: { file: pair.from.file, at: pair.from.at, hash: pair.from.hash },
    to: { file: pair.to.file, at: pair.to.at, hash: pair.to.hash },
    spanDays: Math.round(
      (Date.parse(pair.to.at) - Date.parse(pair.from.at)) / 86_400_000,
    ),
  };

  printSummary(kind, report.comparisons[kind], say);
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const written = Object.values(report.comparisons).filter((c) => !c.unavailable).length;
say(`wrote ${out} (${written} comparison${written === 1 ? '' : 's'}) — read it at /changes.html`);

// A diff that finds changes is doing its job, so changes are not a failure.
// A broken service is: that is the one outcome somebody must look at today.
const broke = report.comparisons.services?.totals?.broke ?? 0;
process.exitCode = broke > 0 ? 4 : 0;

// ---------------------------------------------------------------------------

function printSummary(kind, c, log) {
  const span = c.spanDays === 0 ? 'same day' : `${c.spanDays} day${c.spanDays === 1 ? '' : 's'}`;
  log(`${kind.toUpperCase()}  ${c.from.at.slice(0, 10)} -> ${c.to.at.slice(0, 10)}  (${span})`);
  log('-'.repeat(62));

  if (kind === 'inventory') {
    const t = c.totals;
    log(`  published        ${t.before} -> ${t.after}`);
    log(`  added            ${t.added}`);
    log(`  withdrawn        ${t.withdrawn}${t.withdrawn ? '   <- season still ahead of it' : ''}`);
    log(`  expired          ${t.expired}`);
    log(`  changed          ${t.changed} (${t.changedMajor} material)`);

    if (c.probableRollover) {
      log('');
      log('  NOTE: more than a quarter of the corpus is gone. That is a season');
      log('  rollover, not a list of withdrawals — read the removals as a set.');
    }
    for (const row of c.changed.filter((r) => r.major).slice(0, 12)) {
      log(`    ${row.tag} (${row.area ?? '—'})`);
      for (const f of row.fields.filter((x) => x.major)) {
        log(`      ${f.label}: ${f.before} -> ${f.after}`);
      }
    }
    if (c.totals.changedMajor > 12) log(`    ... and ${c.totals.changedMajor - 12} more`);

    for (const [name, d] of Object.entries(c.vocabulary)) {
      if (d.added.length) log(`  new ${name}: ${d.added.join(', ')}`);
      if (d.removed.length) log(`  gone ${name}: ${d.removed.join(', ')}`);
    }
    const dq = c.dataQuality;
    log(`  unmappable       ${dq.unmappable.before} -> ${dq.unmappable.after}`);
    log(`  ambiguous areas  ${dq.ambiguous.before} -> ${dq.ambiguous.after}`);
    log('');
    return;
  }

  const t = c.totals;
  log(`  endpoints        ${t.before} -> ${t.after}`);
  log(`  gained           ${t.gained}`);
  log(`  lost             ${t.lost}`);
  log(`  broke            ${t.broke}`);
  log(`  recovered        ${t.recovered}`);
  log(`  reshaped         ${t.reshaped}`);
  log(`  unreachable now  ${t.unreachableNow}`);

  for (const s of c.broke) log(`    BROKE     ${s.label}: ${s.detail}`);
  for (const s of c.recovered) log(`    recovered ${s.label}`);
  for (const s of c.reshaped) {
    log(`    reshaped  ${s.label}${s.major ? '  <- fields the app reads may be gone' : ''}`);
    for (const ch of s.changes) log(`      ${ch.what}: ${ch.before} -> ${ch.after}`);
    if (s.fieldsRemoved.length) log(`      fields removed: ${s.fieldsRemoved.join(', ')}`);
    if (s.fieldsAdded.length) log(`      fields added: ${s.fieldsAdded.join(', ')}`);
  }
  for (const s of c.gained) log(`    gained    ${s.label}`);
  for (const s of c.lost) log(`    lost      ${s.label}`);
  log('');
}
