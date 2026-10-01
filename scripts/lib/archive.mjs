import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
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
