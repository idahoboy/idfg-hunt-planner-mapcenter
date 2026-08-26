import { useEffect, useRef } from 'react';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { runSearch } from '@/features/filterbar/queryEngine';
import { queryFeatures } from '@/lib/arcgisQuery';
type GeometryUnion = __esri.GeometryUnion;
import { sqlInClause } from '@/lib/arcgisQuery';

const DEBOUNCE_MS = 350;

/** Resolves the IDFG region facet to a union geometry for spatial filtering. */
async function resolveRegionGeometry(
  url: string,
  field: string,
  values: string[],
): Promise<GeometryUnion | null> {
  if (!values.length) return null;
  const featureSet = await queryFeatures({
    url,
    where: sqlInClause(field, values),
    outFields: [field],
    returnGeometry: true,
  });
  const geometries = featureSet.features
    .map((f) => f.geometry)
    .filter((g): g is GeometryUnion => Boolean(g));
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0]!;
  const { union } = await import('@arcgis/core/geometry/geometryEngineAsync');
  return union(geometries as __esri.Polygon[]);
}

/**
 * Drives the results rail. Re-runs on filter/keyword change (debounced) and, when
 * "search as I move the map" is on, on map extent change.
 */
export function useHuntSearch(): void {
  const config = useConfig();
  const { view, ready } = useMap();

  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const syncToExtent = useAppStore((s) => s.syncToExtent);
  const resultLimit = useAppStore((s) => s.resultLimit);
  const browseAll = useAppStore((s) => s.browseAll);
  const setResults = useAppStore((s) => s.setResults);
  const setResultsLoading = useAppStore((s) => s.setResultsLoading);
  const setResultsError = useAppStore((s) => s.setResultsError);

  const runIdRef = useRef(0);
  const extentVersionRef = useRef(0);

  // Bump a counter on extent change so the effect below re-runs.
  useEffect(() => {
    if (!view || !ready || !syncToExtent) return;
    const handle = reactiveUtils.when(
      () => view.stationary,
      () => { extentVersionRef.current += 1; },
    );
    return () => handle.remove();
  }, [view, ready, syncToExtent]);

  useEffect(() => {
    if (!config.huntFinder.enabled) return;

    const hasCriteria =
      Object.values(filters).some((v) => v.length > 0) || keyword.trim().length > 0;

    const runId = ++runIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setResultsLoading(true);
        try {
          const regionFacet = config.huntFinder.facets.find((f) => f.spatial);
          const regionValues = regionFacet ? filters[regionFacet.id] ?? [] : [];
          const regionGeometry =
            regionFacet?.lookup && regionValues.length
              ? await resolveRegionGeometry(
                  regionFacet.lookup.url,
                  regionFacet.lookup.field,
                  regionValues,
                )
              : null;

          const output = await runSearch({
            config,
            filters,
            keyword,
            extent: syncToExtent && view ? view.extent : null,
            regionGeometry,
            pageSize: resultLimit,
            // With nothing applied the rail shows a starting panel rather than
            // a truncated dump, so only the counts are worth fetching.
            countsOnly: !browseAll && !hasCriteria,
          });

          if (runId !== runIdRef.current) return;   // a newer search superseded this one
          setResults(output.results, output.total);
        } catch (err) {
          if (runId !== runIdRef.current) return;
          setResultsError(err instanceof Error ? err.message : 'Search failed');
        } finally {
          if (runId === runIdRef.current) setResultsLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    config, filters, keyword, syncToExtent, view, resultLimit, browseAll,
    setResults, setResultsLoading, setResultsError,
  ]);
}
