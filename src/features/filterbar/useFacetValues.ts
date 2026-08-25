import { useEffect, useState } from 'react';
import type { AppConfig, FacetConfig } from '@/config/schema';
import { queryDistinctValues } from '@/lib/arcgisQuery';

export interface FacetOption {
  value: string;
  label: string;
}

interface CacheEntry {
  expires: number;
  options: FacetOption[];
}

const cache = new Map<string, CacheEntry>();

/** Idaho unit names sort 1, 2, 4A, 4B, 10, 10A — never lexicographically. */
function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const ax = a.match(re) ?? [];
  const bx = b.match(re) ?? [];
  for (let i = 0; i < Math.max(ax.length, bx.length); i += 1) {
    const an = ax[i];
    const bn = bx[i];
    if (an === undefined) return -1;
    if (bn === undefined) return 1;
    const anNum = Number(an);
    const bnNum = Number(bn);
    if (Number.isFinite(anNum) && Number.isFinite(bnNum)) {
      if (anNum !== bnNum) return anNum - bnNum;
    } else if (an !== bn) {
      return an.localeCompare(bn);
    }
  }
  return 0;
}

function sortOptions(options: FacetOption[], sortBy: FacetConfig['sortBy']): FacetOption[] {
  const copy = [...options];
  switch (sortBy) {
    case 'natural':   copy.sort((a, b) => naturalCompare(a.label, b.label)); break;
    case 'value':     copy.sort((a, b) => Number(a.value) - Number(b.value)); break;
    case 'valueDesc': copy.sort((a, b) => Number(b.value) - Number(a.value)); break;
    case 'label':
    default:          copy.sort((a, b) => a.label.localeCompare(b.label));
  }
  return copy;
}

async function resolveOptions(facet: FacetConfig, config: AppConfig): Promise<FacetOption[]> {
  if (facet.source === 'static') {
    return (facet.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  }

  const url =
    facet.lookup?.url ??
    config.huntFinder.sources.find((s) => s.id === facet.from)?.url;
  const field = facet.lookup?.field ?? facet.field;
  if (!url || !field) return [];

  const source = config.huntFinder.sources.find((s) => s.id === facet.from);
  const where = source?.baseWhere ?? '1=1';
  const values = await queryDistinctValues(url, field, where);

  // Fold service values into their display aliases (Rocky Mtn Sheep +
  // California Sheep both present as "Bighorn Sheep", exactly as the legacy
  // pick lists did — but read from the service instead of hard-coded).
  const aliases = facet.applyAliases ? source?.speciesAliases ?? {} : {};
  const seen = new Map<string, FacetOption>();
  for (const value of values) {
    const label = aliases[value] ?? value;
    if (!seen.has(label)) seen.set(label, { value: label, label });
  }
  return [...seen.values()];
}

export function useFacetValues(
  facet: FacetConfig,
  config: AppConfig,
): { options: FacetOption[]; loading: boolean; error: string | null } {
  const [options, setOptions] = useState<FacetOption[]>(() => {
    const hit = cache.get(facet.id);
    return hit && hit.expires > Date.now() ? hit.options : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hit = cache.get(facet.id);
    if (hit && hit.expires > Date.now()) {
      setOptions(hit.options);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const resolved = sortOptions(await resolveOptions(facet, config), facet.sortBy);
        if (cancelled) return;
        cache.set(facet.id, {
          options: resolved,
          expires: Date.now() + config.huntFinder.cacheTtlMinutes * 60_000,
        });
        setOptions(resolved);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [facet, config]);

  return { options, loading, error };
}
