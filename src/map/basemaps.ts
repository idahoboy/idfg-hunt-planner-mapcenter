import Basemap from '@arcgis/core/Basemap';
import TileLayer from '@arcgis/core/layers/TileLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import type Layer from '@arcgis/core/layers/Layer';
import type { BasemapConfig } from '@/config/schema';

function makeLayer(url: string, type: BasemapConfig['type']): Layer {
  switch (type) {
    case 'vector-tile': return new VectorTileLayer({ url });
    case 'map-image':   return new MapImageLayer({ url });
    case 'tiled':
    default:            return new TileLayer({ url });
  }
}

/** All configured basemaps are keyless services, so no API key is ever needed. */
export function buildBasemap(cfg: BasemapConfig): Basemap {
  const base = makeLayer(cfg.url, cfg.type);
  const reference = cfg.referenceUrl ? makeLayer(cfg.referenceUrl, 'tiled') : null;
  return new Basemap({
    id: cfg.id,
    title: cfg.title,
    baseLayers: [base],
    referenceLayers: reference ? [reference] : [],
    ...(cfg.thumbnail ? { thumbnailUrl: cfg.thumbnail } : {}),
  });
}

export function buildBasemaps(items: BasemapConfig[]): Map<string, Basemap> {
  return new Map(items.map((item) => [item.id, buildBasemap(item)]));
}
