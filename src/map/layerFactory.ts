import type Layer from '@arcgis/core/layers/Layer';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
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

/**
 * Layer classes are imported on demand.
 *
 * Importing all seven statically pulled every layer implementation into the
 * initial chunk graph, including the five this configuration never uses — the
 * catalogue is 42 feature layers and 3 map-image layers and nothing else.
 */
const LAYER_MODULES: Record<LayerConfig['type'], () => Promise<{ default: new (p: never) => Layer }>> = {
  feature: () => import('@arcgis/core/layers/FeatureLayer') as never,
  'map-image': () => import('@arcgis/core/layers/MapImageLayer') as never,
  tile: () => import('@arcgis/core/layers/TileLayer') as never,
  imagery: () => import('@arcgis/core/layers/ImageryLayer') as never,
  geojson: () => import('@arcgis/core/layers/GeoJSONLayer') as never,
  csv: () => import('@arcgis/core/layers/CSVLayer') as never,
  'vector-tile': () => import('@arcgis/core/layers/VectorTileLayer') as never,
};

function applyCommon(layer: Layer, cfg: LayerConfig): void {
  layer.id = cfg.id;
  layer.title = cfg.title;
  layer.visible = cfg.visible;
  layer.opacity = cfg.opacity;
  if (cfg.minScale !== undefined) (layer as unknown as { minScale: number }).minScale = cfg.minScale;
  if (cfg.maxScale !== undefined) (layer as unknown as { maxScale: number }).maxScale = cfg.maxScale;
}

async function construct(cfg: LayerConfig, url: string): Promise<Layer> {
  const mod = await LAYER_MODULES[cfg.type]();
  const Ctor = mod.default;

  if (cfg.type === 'feature') {
    const layer = new Ctor({
      url,
      outFields: cfg.outFields ?? ['*'],
      ...(cfg.definitionExpression ? { definitionExpression: cfg.definitionExpression } : {}),
      ...(cfg.refreshIntervalMinutes ? { refreshInterval: cfg.refreshIntervalMinutes } : {}),
    } as never) as Layer & {
      popupTemplate?: unknown;
      renderer?: unknown;
      labelingInfo?: unknown;
      labelsVisible?: boolean;
    };
    if (cfg.popup) layer.popupTemplate = buildPopupTemplate(cfg.popup, cfg.title);
    if (cfg.renderer) layer.renderer = buildRenderer(cfg.renderer);
    if (cfg.labels) {
      layer.labelingInfo = [buildLabelClass(cfg.labels)];
      layer.labelsVisible = true;
    }
    return layer;
  }

  if (cfg.type === 'map-image') {
    const layer = new Ctor({
      url,
      ...(cfg.refreshIntervalMinutes ? { refreshInterval: cfg.refreshIntervalMinutes } : {}),
    } as never) as Layer & { allSublayers?: { forEach: (f: (s: never) => void) => void } };

    if (cfg.sublayers?.length || cfg.sublayerDefinitions) {
      // Sublayer ids are only known once the service metadata has loaded.
      void layer.when(() => {
        const visible = new Set(cfg.sublayers ?? []);
        layer.allSublayers?.forEach((sub: never) => {
          const s = sub as unknown as { id: number; visible: boolean; definitionExpression?: string };
          if (cfg.sublayers?.length) s.visible = visible.has(s.id);
          const def = cfg.sublayerDefinitions?.[String(s.id)];
          if (def) s.definitionExpression = def;
        });
      });
    }
    return layer;
  }

  return new Ctor({ url } as never);
}

/**
 * Loads a layer, falling back to `fallbackUrl` if the primary fails.
 *
 * Separated from construction because most layers are never loaded at boot:
 * see `buildLayers`.
 */
async function loadWithFallback(
  built: Layer,
  cfg: LayerConfig,
  onProblem: (p: LayerLoadProblem) => void,
): Promise<Layer | null> {
  try {
    await built.load();
    return built;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!cfg.fallbackUrl) {
      onProblem({ layerId: cfg.id, title: cfg.title, url: cfg.url, message, usedFallback: false });
      return null;
    }
    try {
      const alt = await construct(cfg, cfg.fallbackUrl);
      applyCommon(alt, cfg);
      await alt.load();
      onProblem({
        layerId: cfg.id,
        title: cfg.title,
        url: cfg.url,
        message: 'primary service unavailable; loaded fallback',
        usedFallback: true,
      });
      return alt;
    } catch (err2) {
      onProblem({
        layerId: cfg.id,
        title: cfg.title,
        url: cfg.fallbackUrl,
        message: err2 instanceof Error ? err2.message : String(err2),
        usedFallback: false,
      });
      return null;
    }
  }
}

/**
 * Builds every configured layer, but only *loads* the ones that start visible.
 *
 * Loading a layer costs a metadata round-trip to its service. This catalogue is
 * 45 layers across ten hosts and exactly one of them is visible at boot, so
 * eagerly loading all of them spent 44 requests — and several seconds — on
 * layers nobody had asked to see. The rest now load the first time they are
 * switched on, which is also the first moment their metadata is needed.
 *
 * A layer that fails on first reveal still reports through `onProblem`, so the
 * service-health panel stays accurate; it simply reports later than it used to.
 */
export async function buildLayers(
  configs: LayerConfig[],
  onProblem: (problem: LayerLoadProblem) => void,
): Promise<BuiltLayer[]> {
  const built = await Promise.all(
    configs.map(async (cfg) => {
      let layer: Layer;
      try {
        layer = await construct(cfg, cfg.url);
      } catch (err) {
        onProblem({
          layerId: cfg.id,
          title: cfg.title,
          url: cfg.url,
          message: err instanceof Error ? err.message : String(err),
          usedFallback: false,
        });
        return null;
      }
      applyCommon(layer, cfg);
      return { layer, config: cfg } satisfies BuiltLayer;
    }),
  );

  const ok = built.filter((b): b is BuiltLayer => b !== null);

  await Promise.all(
    ok.map(async (b) => {
      if (b.config.visible) {
        const loaded = await loadWithFallback(b.layer, b.config, onProblem);
        if (loaded && loaded !== b.layer) b.layer = loaded;
        return;
      }
      // Deferred: load on first reveal, once.
      const handle = reactiveUtils.when(
        () => b.layer.visible,
        () => {
          handle.remove();
          void loadWithFallback(b.layer, b.config, onProblem);
        },
      );
    }),
  );

  return ok;
}
