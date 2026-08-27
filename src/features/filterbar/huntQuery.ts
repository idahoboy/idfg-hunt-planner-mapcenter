import type { AppConfig } from '@/config/schema';
import type { Hunt, IndexedInventory } from '@/lib/inventory';

export interface FacetOption {
  value: string;
  label: string;
  /** How many hunts carry this value under the *other* active filters. */
  count: number;
}

export interface HuntQueryResult {
  hunts: Hunt[];
  total: number;
  /** Options for every facet, counted against the current selection. */
  options: Record<string, FacetOption[]>;
}

type Filters = Record<string, string[]>;

/** Idaho units read 1, 2, 4A, 10, 10A — never lexicographically. */
function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const ax = a.match(re) ?? [];
  const bx = b.match(re) ?? [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i += 1) {
    const an = ax[i];
    const bn = bx[i];
    if (an === undefined) return -1;
    if (bn === undefined) return 1;
    const na = Number(an);
    const nb = Number(bn);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb;
    } else if (an !== bn) {
      return an.localeCompare(bn);
    }
  }
  return 0;
}

/** The values a hunt carries for one facet. Arrays (units) yield several. */
function valuesFor(hunt: Hunt, facet: AppConfig['huntFinder']['facets'][number]): string[] {
  if (!facet.field) return [];
  const raw = (hunt as unknown as Record<string, unknown>)[facet.field];
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String);
  return [String(raw)];
}

function matchesKeyword(hunt: Hunt, fields: string[], term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => {
    const v = (hunt as unknown as Record<string, unknown>)[f];
    return typeof v === 'string' && v.toLowerCase().includes(needle);
  });
}

function passes(
  hunt: Hunt,
  facets: AppConfig['huntFinder']['facets'],
  filters: Filters,
  keyword: string,
  skipFacetId?: string,
): boolean {
  for (const facet of facets) {
    if (facet.id === skipFacetId) continue;

    if (facet.type === 'search') {
      if (!matchesKeyword(hunt, facet.searchFields ?? [], keyword)) return false;
      continue;
    }

    const selected = filters[facet.id];
    if (!selected?.length) continue;

    const values = valuesFor(hunt, facet);
    if (!values.some((v) => selected.includes(v))) return false;
  }
  return true;
}

/**
 * Filters the snapshot in memory.
 *
 * This replaces a query engine that translated facets into SQL against five
 * ArcGIS services. Everything it did, an array filter does — with exact
 * counts, no round trip, and no dedupe gymnastics, because the snapshot was
 * already deduped when it was built. It also makes weapon, sex/antler, season
 * and tag filterable at all: those live on the inventory, not the map layers.
 *
 * Option counts are computed per facet with that facet's own selection
 * excluded, so a facet always shows what *would* be available if you changed
 * only it — the behaviour people expect from faceted search, and impossible to
 * afford when every count is a network call.
 */
export function runHuntQuery(
  indexed: IndexedInventory,
  config: AppConfig,
  filters: Filters,
  keyword: string,
): HuntQueryResult {
  const facets = config.huntFinder.facets;
  const all = indexed.inventory.hunts;

  const hunts = all.filter((h) => passes(h, facets, filters, keyword));

  const options: Record<string, FacetOption[]> = {};
  for (const facet of facets) {
    if (facet.type === 'search' || !facet.field) continue;

    const counts = new Map<string, number>();
    for (const hunt of all) {
      if (!passes(hunt, facets, filters, keyword, facet.id)) continue;
      for (const v of valuesFor(hunt, facet)) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }

    const labels = (facet.labels ?? {}) as Record<string, string>;
    const staticLabels = new Map(
      (facet.options ?? []).map((o) => [o.value, o.label] as const),
    );

    const list = [...counts.entries()].map(([value, count]) => ({
      value,
      label: labels[value] ?? staticLabels.get(value) ?? value,
      count,
    }));

    list.sort((a, b) => {
      if (facet.sortBy === 'natural') return naturalCompare(a.label, b.label);
      // Months must sort 8, 9, 10 — by value, never by name.
      if (facet.sortBy === 'value') return Number(a.value) - Number(b.value);
      return a.label.localeCompare(b.label);
    });
    options[facet.id] = list;
  }

  return { hunts, total: hunts.length, options };
}
