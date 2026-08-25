import { useEffect } from 'react';
import Graphic from '@arcgis/core/Graphic';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { queryFeatures, sqlIdIn, sqlLiteral } from '@/lib/arcgisQuery';
import type { SourceConfig } from '@/config/schema';
import { buildSymbol } from '@/map/symbols';

const geometryCache = new Map<string, __esri.GeometryUnion | null>();

/**
 * Rebuilds the WHERE for one result. A deduped source has a composite identity
 * (e.g. BigGame + HuntArea) rather than a single id column, and the record's
 * `id` carries those values joined by U+001F.
 */
function whereForRecord(source: SourceConfig, record: { id: string }): string {
  const dedupe = source.dedupeBy
    ? Array.isArray(source.dedupeBy) ? source.dedupeBy : [source.dedupeBy]
    : [];
  if (dedupe.length === 0) return sqlIdIn(source.idField, [record.id]);

  const values = record.id.split('\u001f');
  return dedupe
    .map((field, i) => {
      const value = values[i] ?? '';
      return Number.isFinite(Number(value)) && value !== ''
        ? `${field} = ${Number(value)}`
        : `${field} = ${sqlLiteral(value)}`;
    })
    .join(' AND ');
}

async function fetchGeometry(
  source: SourceConfig,
  record: { id: string },
): Promise<__esri.GeometryUnion | null> {
  const where = whereForRecord(source, record);
  const cacheKey = `${source.url}|${where}`;
  if (geometryCache.has(cacheKey)) return geometryCache.get(cacheKey) ?? null;

  const featureSet = await queryFeatures({
    url: source.url,
    where,
    outFields: [source.idField],
    returnGeometry: true,
  });
  const geometry = featureSet.features[0]?.geometry ?? null;
  geometryCache.set(cacheKey, geometry);
  return geometry;
}

/**
 * Hover a result card -> flash the geometry on the map.
 * Click a result card -> zoom to it and keep it highlighted.
 * This is the interaction the legacy app had no equivalent for; it only ever
 * drew a static purple polygon after pressing a Highlight button.
 */
export function useResultInteraction(): void {
  const config = useConfig();
  const { hoverLayer, highlightLayer, view, ready } = useMap();

  const results = useAppStore((s) => s.results);
  const hoveredKey = useAppStore((s) => s.hoveredResultKey);
  const selectedKey = useAppStore((s) => s.selectedResultKey);

  // ---- hover flash ----
  useEffect(() => {
    if (!ready) return;
    hoverLayer.removeAll();
    if (!hoveredKey) return;

    const record = results.find((r) => r.key === hoveredKey);
    const source = config.huntFinder.sources.find((s) => s.id === record?.sourceId);
    if (!record || !source) return;

    let cancelled = false;
    void (async () => {
      try {
        const geometry = await fetchGeometry(source, record);
        if (cancelled || !geometry) return;
        hoverLayer.add(
          new Graphic({
            geometry,
            symbol: buildSymbol({
              type: geometry.type === 'polyline' ? 'line' : 'fill',
              color: 'rgba(255, 114, 0, 0.22)',
              width: 3,
              outline: { color: '#ff7200', width: 2.5 },
            }),
          }),
        );
      } catch {
        /* hover preview is best-effort */
      }
    })();

    return () => { cancelled = true; hoverLayer.removeAll(); };
  }, [hoveredKey, results, config, hoverLayer, ready]);

  // ---- selection: highlight + zoom ----
  useEffect(() => {
    if (!ready || !view) return;
    if (!selectedKey) return;

    const record = results.find((r) => r.key === selectedKey);
    const source = config.huntFinder.sources.find((s) => s.id === record?.sourceId);
    if (!record || !source) return;

    let cancelled = false;
    void (async () => {
      try {
        const geometry = await fetchGeometry(source, record);
        if (cancelled || !geometry) return;

        highlightLayer.removeAll();
        highlightLayer.add(
          new Graphic({
            geometry,
            symbol: buildSymbol({
              type: geometry.type === 'polyline' ? 'line' : 'fill',
              color: config.highlight.symbol.fill,
              width: config.highlight.symbol.width,
              outline: {
                color: config.highlight.symbol.outline,
                width: config.highlight.symbol.width,
              },
            }),
            attributes: record.attributes,
            popupTemplate: {
              title: record.title,
              content: record.subtitle,
            } as unknown as __esri.PopupTemplate,
          }),
        );

        if (config.huntFinder.results.clickZooms) {
          await view.goTo(
            { target: geometry, padding: { top: 40, bottom: 40, left: 40, right: 40 } },
            { duration: 550 },
          );
        }
      } catch {
        /* selection zoom is best-effort */
      }
    })();

    return () => { cancelled = true; };
  }, [selectedKey, results, config, highlightLayer, view, ready]);
}
