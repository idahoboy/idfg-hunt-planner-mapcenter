import { useEffect, useRef, useState } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ResultRecord } from '@/state/store';
import { loadInventory, type Hunt, type IndexedInventory } from '@/lib/inventory';
import { appUrl } from '@/lib/appUrl';
import { runHuntQuery } from '@/features/filterbar/huntQuery';

const DEBOUNCE_MS = 120;

function toRecord(hunt: Hunt, indexed: IndexedInventory): ResultRecord {
  const areaBox = hunt.areaIds?.map((id) => indexed.areaExtents[String(id)]).find(Boolean);
  const unitBox = hunt.unitsReferenced?.map((u) => indexed.unitExtents[u]).find(Boolean);
  const bbox = areaBox ?? unitBox;

  return {
    key: String(hunt.id),
    huntId: hunt.id,
    tagId: hunt.tagId,
    title: hunt.tag,
    subtitle: hunt.area,
    species: hunt.species,
    type: hunt.type,
    open: hunt.open,
    close: hunt.close,
    method: hunt.method,
    ornament: hunt.ornament,
    permits: hunt.permits,
    unlimited: hunt.unlimited,
    area: hunt.area,
    areaQualified: hunt.areaQualified,
    accessGrade: hunt.accessGrade,
    areaIds: hunt.areaIds,
    unitsReferenced: hunt.unitsReferenced ?? [],
    ...(bbox ? { bbox } : {}),
  };
}

/**
 * Drives the results rail from the snapshot.
 *
 * This replaces five parallel ArcGIS queries per keystroke with an array
 * filter. Counts are exact rather than estimated, facet options carry their
 * own counts, and the debounce exists only to avoid re-rendering on every
 * character — not to spare a server.
 */
export function useHuntSearch(): void {
  const config = useConfig();
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const resultLimit = useAppStore((s) => s.resultLimit);
  const browseAll = useAppStore((s) => s.browseAll);
  const setResults = useAppStore((s) => s.setResults);
  const setFacetOptions = useAppStore((s) => s.setFacetOptions);
  const setResultsLoading = useAppStore((s) => s.setResultsLoading);
  const setResultsError = useAppStore((s) => s.setResultsError);

  const [indexed, setIndexed] = useState<IndexedInventory | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!config.huntFinder.enabled || loadedRef.current) return;
    loadedRef.current = true;
    setResultsLoading(true);
    void (async () => {
      const inv = await loadInventory(appUrl(config.huntFinder.inventory.url));
      setIndexed(inv);
      if (!inv) {
        setResultsError(
          'The hunt inventory has not been built for this deployment. Run "npm run build:inventory".',
        );
      }
      setResultsLoading(false);
    })();
  }, [config, setResultsLoading, setResultsError]);

  useEffect(() => {
    if (!indexed || !config.huntFinder.enabled) return;

    const timer = window.setTimeout(() => {
      const out = runHuntQuery(indexed, config, filters, keyword);
      setFacetOptions(out.options);

      const hasCriteria =
        Object.values(filters).some((v) => v.length > 0) || keyword.trim().length > 0;

      // With nothing applied the rail shows a starting panel, so there is no
      // point materialising records — but the total is still worth knowing.
      const records =
        hasCriteria || browseAll
          ? out.hunts.slice(0, resultLimit).map((h) => toRecord(h, indexed))
          : [];

      setResults(records, out.total);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    indexed, config, filters, keyword, resultLimit, browseAll,
    setResults, setFacetOptions,
  ]);
}
