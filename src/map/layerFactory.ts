import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer';
import TileLayer from '@arcgis/core/layers/TileLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import CSVLayer from '@arcgis/core/layers/CSVLayer';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer';
import type Layer from '@arcgis/core/layers/Layer';
import type { LayerConfig } from '@/config/schema';
import { buildPopupTemplate } from './popup';
import { buildLabelClass, buildRenderer } from './symbols';

export interface BuiltLayer {
  layer: Layer;
  config: LayerConfig;
}

export interface LayerLoadProblem {
  layerId: string;
  title: string;
  url: string;
  message: string;
  usedFallback: boolean;
}

function applyCommon(layer: Layer, cfg: LayerConfig): void {
  layer.id = cfg.id;
  layer.title = cfg.title;
  layer.visible = cfg.visible;
  layer.opacity = cfg.opacity;
  if (cfg.minScale !== undefined) (layer as unknown as { minScale: number }).minScale = cfg.minScale;
  if (cfg.maxScale !== undefined) (layer as unknown as { maxScale: number }).maxScale = cfg.maxScale;
}

function buildFeatureLayer(cfg: LayerConfig, url: string): FeatureLayer {
  const layer = new FeatureLayer({
    url,
    outFields: cfg.outFields ?? ['*'],
    ...(cfg.definitionExpression ? { definitionExpression: cfg.definitionExpression } : {}),
    ...(cfg.refreshIntervalMinutes ? { refreshInterval: cfg.refreshIntervalMinutes } : {}),
  });
  if (cfg.popup) layer.popupTemplate = buildPopupTemplate(cfg.popup, cfg.title);
  if (cfg.renderer) layer.renderer = buildRenderer(cfg.renderer);
  if (cfg.labels) {
    layer.labelingInfo = [buildLabelClass(cfg.labels)];
    layer.labelsVisible = true;
  }
  return layer;
}

function buildMapImageLayer(cfg: LayerConfig, url: string): MapImageLayer {
  const layer = new MapImageLayer({
    url,
    ...(cfg.refreshIntervalMinutes ? { refreshInterval: cfg.refreshIntervalMinutes } : {}),
  });
  if (cfg.sublayers?.length || cfg.sublayerDefinitions) {
    // MapImageLayer sublayers must be configured after the service metadata
    // loads, otherwise the ids are not yet known.
    void layer.when(() => {
      const visible = new Set(cfg.sublayers ?? []);
      layer.allSublayers.forEach((sub) => {
        if (cfg.sublayers?.length) sub.visible = visible.has(sub.id);
        const def = cfg.sublayerDefinitions?.[String(sub.id)];
        if (def) sub.definitionExpression = def;
      });
    });
  }
  return layer;
}

/**
 * Builds one layer from config, falling back to `fallbackUrl` when the primary
 * service fails to load. The legacy app had no fallback: a dead endpoint threw
 * inside the AMD callback and took the rest of the module with it.
 */
export async function buildLayer(
  cfg: LayerConfig,
  onProblem: (problem: LayerLoadProblem) => void,
): Promise<BuiltLayer | null> {
  const urls = [cfg.url, ...(cfg.fallbackUrl ? [cfg.fallbackUrl] : [])];

  for (const [index, url] of urls.entries()) {
    const effective = cfg;


    let layer: Layer;
    switch (cfg.type) {
      case 'feature':      layer = buildFeatureLayer(effective, url); break;
      case 'map-image':    layer = buildMapImageLayer(effective, url); break;
      case 'tile':         layer = new TileLayer({ url }); break;
      case 'imagery':      layer = new ImageryLayer({ url }); break;
      case 'geojson':      layer = new GeoJSONLayer({ url }); break;
      case 'csv':          layer = new CSVLayer({ url }); break;
      case 'vector-tile':  layer = new VectorTileLayer({ url }); break;
      default:
        onProblem({
          layerId: cfg.id, title: cfg.title, url,
          message: `unsupported layer type "${cfg.type}"`, usedFallback: false,
        });
        return null;
    }

    applyCommon(layer, effective);

    try {
      await layer.load();
      if (index > 0) {
        onProblem({
          layerId: cfg.id, title: cfg.title, url: cfg.url,
          message: 'primary service unavailable; loaded fallback',
          usedFallback: true,
        });
      }
      return { layer, config: effective };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLast = index === urls.length - 1;
      if (isLast) {
        onProblem({ layerId: cfg.id, title: cfg.title, url, message, usedFallback: false });
        return null;
      }
    }
  }
  return null;
}

/**
 * Builds every layer concurrently. One failure never blocks the others — the
 * whole point of the rewrite. Layers are returned in config order so the map
 * draw order stays deterministic.
 */
export async function buildLayers(
  configs: LayerConfig[],
  onProblem: (problem: LayerLoadProblem) => void,
): Promise<BuiltLayer[]> {
  const results = await Promise.all(configs.map((cfg) => buildLayer(cfg, onProblem)));
  return results.filter((r): r is BuiltLayer => r !== null);
}
