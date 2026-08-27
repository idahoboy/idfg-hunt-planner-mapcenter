import { useEffect } from 'react';
import Graphic from '@arcgis/core/Graphic';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ResultRecord } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { queryFeatures, sqlInClause, sqlNumericIn } from '@/lib/arcgisQuery';
import { buildSymbol } from '@/map/symbols';
import { zoomToBbox } from '@/lib/zoomTo';

const geometryCache = new Map<string, __esri.GeometryUnion[]>();

/**
 * Fetches the geometry behind a result.
 *
 * A controlled hunt resolves through its AreaIDs; a general hunt references
 * GMUs by name and is drawn as those units. Both are looked up only when a
 * card is hovered or selected — the list itself needs no geometry at all,
 * which is what keeps it instant.
 */
async function fetchGeometry(
  record: ResultRecord,
  urls: { huntAreas: string; units: string },
): Promise<__esri.GeometryUnion[]> {
  const cacheKey = record.key;
  const hit = geometryCache.get(cacheKey);
  if (hit) return hit;

  let geometries: __esri.GeometryUnion[] = [];
  try {
    if (record.areaIds?.length) {
      const fs = await queryFeatures({
        url: urls.huntAreas,
        where: sqlNumericIn('AreaID', record.areaIds),
        outFields: ['AreaID'],
        returnGeometry: true,
      });
      geometries = fs.features
        .map((f) => f.geometry)
        .filter((g): g is __esri.GeometryUnion => Boolean(g));
    } else if (record.unitsReferenced.length) {
      const fs = await queryFeatures({
        url: urls.units,
        where: sqlInClause('NAME', record.unitsReferenced),
        outFields: ['NAME'],
        returnGeometry: true,
      });
      geometries = fs.features
        .map((f) => f.geometry)
        .filter((g): g is __esri.GeometryUnion => Boolean(g));
    }
  } catch {
    geometries = [];
  }

  geometryCache.set(cacheKey, geometries);
  return geometries;
}

export function useResultInteraction(): void {
  const config = useConfig();
  const { hoverLayer, highlightLayer, view, ready } = useMap();
  const results = useAppStore((s) => s.results);
  const hoveredKey = useAppStore((s) => s.hoveredResultKey);
  const selectedKey = useAppStore((s) => s.selectedResultKey);

  const urls = {
    huntAreas: config.highlight.queryLayers['5']?.url ?? '',
    units: config.highlight.queryLayers['3']?.url ?? '',
  };

  // ---- hover: a light flash, no zoom ------------------------------------
  useEffect(() => {
    if (!ready || !config.huntFinder.results.hoverHighlights) return;
    hoverLayer.removeAll();
    if (!hoveredKey) return;

    const record = results.find((r) => r.key === hoveredKey);
    if (!record) return;

    let cancelled = false;
    void (async () => {
      const geometries = await fetchGeometry(record, urls);
      if (cancelled) return;
      hoverLayer.removeAll();
      for (const geometry of geometries) {
        hoverLayer.add(
          new Graphic({
            geometry,
            symbol: buildSymbol({
              type: 'fill',
              color: 'rgba(154, 32, 219, 0.10)',
              outline: { color: '#9a20db', width: 1.5 },
            }),
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
      hoverLayer.removeAll();
    };
  }, [hoveredKey, results, config, hoverLayer, ready, urls]);

  // ---- selection: draw it and frame it ----------------------------------
  useEffect(() => {
    if (!ready || !view) return;
    highlightLayer.removeAll();
    if (!selectedKey) return;

    const record = results.find((r) => r.key === selectedKey);
    if (!record) return;

    let cancelled = false;
    void (async () => {
      // The box is already in the snapshot, so the view can move before any
      // geometry arrives.
      if (record.bbox && config.huntFinder.results.clickZooms) {
        await zoomToBbox(view, record.bbox, { duration: 550 });
      }

      const geometries = await fetchGeometry(record, urls);
      if (cancelled) return;
      highlightLayer.removeAll();
      for (const geometry of geometries) {
        highlightLayer.add(
          new Graphic({
            geometry,
            symbol: buildSymbol({
              type: 'fill',
              color: config.highlight.symbol.fill,
              outline: {
                color: config.highlight.symbol.outline,
                width: config.highlight.symbol.width,
              },
            }),
          }),
        );
      }
    })();

    return () => { cancelled = true; };
  }, [selectedKey, results, config, highlightLayer, view, ready, urls]);
}
