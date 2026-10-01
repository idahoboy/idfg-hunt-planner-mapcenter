import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const SNAPSHOT_DIR = 'snapshots';

/** Stable content hash, so an unchanged capture is recognisable as unchanged. */
export function hashOf(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}

/** 2026-10-01 — one capture per day is the resolution worth keeping. */
export function stamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Writes a capture into the archive and records it in the manifest.
 *
 * Gzipped, because the history is the point and an uncompressed inventory is
 * half a megabyte a go. Captures are committed: a change log that lives only
 * on one machine is not a change log.
 *
 * A capture whose hash matches the previous one for the same kind is still
 * recorded in the manifest but not written again — most weeks nothing moves,
 * and storing fifty identical files to prove it is waste.
 */
export async function archive(kind, payload) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const manifest = await readManifest();

  const json = JSON.stringify(payload);
  const hash = hashOf(json);
  const previous = [...manifest.captures].reverse().find((c) => c.kind === kind);

  // The hash is in the filename so two differing captures on the same day
  // cannot overwrite each other — and two identical ones resolve to the same
  // name, which is the dedupe we want rather than a collision.
  const file = `${stamp()}-${kind}-${hash}.json.gz`;
  const unchanged = previous?.hash === hash;

  if (!unchanged) {
    await writeFile(join(SNAPSHOT_DIR, file), gzipSync(json, { level: 9 }));
  }

  manifest.captures.push({
    kind,
    at: new Date().toISOString(),
    hash,
    // Points at the last file that actually differed, so a reader always has
    // something to open even on a day nothing changed.
    file: unchanged ? previous.file : file,
    unchanged,
    bytes: json.length,
  });

  await writeFile(
    join(SNAPSHOT_DIR, 'index.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return { file, hash, unchanged, previous: previous ?? null };
}

export async function readManifest() {
  try {
    return JSON.parse(await readFile(join(SNAPSHOT_DIR, 'index.json'), 'utf8'));
  } catch {
    return { version: 1, captures: [] };
  }
}

export async function listCaptures(kind) {
  const manifest = await readManifest();
  return manifest.captures.filter((c) => !kind || c.kind === kind);
}

/** Convenience for a differ: the archived files present on disk. */
export async function filesOnDisk() {
  try {
    return (await readdir(SNAPSHOT_DIR)).filter((f) => f.endsWith('.json.gz')).sort();
  } catch {
    return [];
  }
}

/** Reads one archived capture back. The only supported source for a diff. */
export async function readCapture(file) {
  const path = file.includes('/') ? file : join(SNAPSHOT_DIR, file);
  return JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
}

/**
 * The most recent captures of a kind that actually differ from each other,
 * newest first.
 *
 * Deduplicating by hash is what makes "compare the last two" mean something on
 * a corpus that mostly does not move: without it, a weekly capture of an
 * unchanged inventory would compare a file against itself and report nothing
 * changed between two dates that genuinely had no capture between them.
 */
export async function latestDistinct(kind, n = 2) {
  const manifest = await readManifest();
  const out = [];
  const seen = new Set();
  for (const c of [...manifest.captures].reverse()) {
    if (c.kind !== kind || seen.has(c.hash)) continue;
    seen.add(c.hash);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Resolves what a reader typed — a filename, or just a date — to one capture.
 * A date with several captures of that kind resolves to the last one that day.
 */
export async function resolveCapture(kind, token) {
  const manifest = await readManifest();
  const ofKind = manifest.captures.filter((c) => c.kind === kind);
  const exact = ofKind.find((c) => c.file === token || c.file === token.replace(`${SNAPSHOT_DIR}/`, ''));
  if (exact) return exact;
  const byDate = ofKind.filter((c) => c.at.startsWith(token) || c.file.startsWith(token));
  if (byDate.length) return byDate[byDate.length - 1];
  return null;
}
