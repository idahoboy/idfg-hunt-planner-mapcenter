import type { LocationResult } from './locationQuery';

/**
 * A link back to this exact answer.
 *
 * The map already round-trips X/Y/zoom, so the only new thing is a flag saying
 * "re-run the click here and open the detail". That keeps a shared link
 * composable with everything else in the URL — layer visibility, filters — so
 * the recipient sees what the sender saw rather than a bare coordinate.
 */
export function buildLocationLink(result: LocationResult, zoom?: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set('X', result.lon.toFixed(5));
  url.searchParams.set('Y', result.lat.toFixed(5));
  if (zoom !== undefined) url.searchParams.set('zoom', String(Math.round(zoom)));
  url.searchParams.set('at', '1');
  return url.toString();
}

/** Plain text, because that is what survives being pasted into a text message. */
export function formatLocationText(
  result: LocationResult,
  opts: { huntDetailUrl?: string; rulesUrl?: string; link?: string } = {},
): string {
  const L: string[] = [];
  const place = result.place.map((p) => `${p.label} ${p.value}`).join(' · ');

  L.push(place || 'Location');
  L.push(`${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`);
  L.push('');

  if (result.access.length > 0) {
    L.push('PUBLIC ACCESS');
    for (const a of result.access) {
      const where = a.onSite ? 'here' : `${a.miles.toFixed(1)} mi`;
      L.push(
        `  [${where}] ${a.label}${a.name && a.name !== a.label ? ` — ${a.name}` : ''}` +
          `${a.notifyRequired ? ' (landowner notification required)' : ''}`,
      );
    }
    L.push('');
  }

  if (result.ownership) {
    L.push(
      `LAND UNDER THIS POINT: ${result.ownership.label}` +
        `${result.ownership.name ? ` — ${result.ownership.name}` : ''}`,
    );
    if (result.ownership.source) L.push(`  Source: ${result.ownership.source}`);
    L.push('');
  }

  if (result.hunts.length > 0) {
    L.push(`HUNTS (${result.hunts.length})`);
    for (const m of result.hunts) {
      const h = m.hunt;
      L.push(`  ${h.tag}`);
      L.push(
        `    ${h.open}–${h.close} · ${h.method}` +
          `${h.ornament ? ` · ${h.ornament}` : ''}` +
          ` · ${h.unlimited ? 'unlimited tags' : `${h.permits ?? '—'} tags`}`,
      );
      L.push(`    Area: ${h.area}`);
      if (m.qualified) {
        L.push('    NOTE: covers only part of the area shown — the hunt text governs.');
      }
      if (opts.huntDetailUrl) {
        L.push(`    ${opts.huntDetailUrl.replace('{id}', String(h.id))}`);
      }
    }
    L.push('');
  }

  if (result.accessCaveat) {
    L.push(`NOTE: ${result.accessCaveat.replace(/\s+/g, ' ').trim()}`);
    L.push('');
  }
  if (opts.rulesUrl) L.push(`Seasons and rules: ${opts.rulesUrl} — the brochure governs.`);
  if (opts.link) L.push(`This view: ${opts.link}`);

  return L.join('\n');
}

/**
 * Clipboard with a fallback. `navigator.clipboard` needs a secure context and
 * is refused in some embedded browsers, and a copy button that silently does
 * nothing is worse than one that is absent.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
