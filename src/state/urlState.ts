import type { AppConfig } from '@/config/schema';

export interface UrlState {
  /** layerId -> visible */
  layerVisibility: Record<string, boolean>;
  basemapId: string | null;
  center: [number, number] | null;
  zoom: number | null;
  /** Legacy highlight deep link: ?val=&lyr=&lbl= */
  highlight: { ids: string; layerIndex: string; label: string } | null;
  filters: Record<string, string[]>;
  keyword: string;
}

/**
 * Legacy URLs encode layer visibility as a bitmask per group:
 *   ?hunt=5&reference=256   -> hunt bits 1 and 4, reference bit 256
 * Every bookmark, every link out of the Hunt Planner search results, and every
 * printed QR code in the field uses this form, so it is decoded verbatim.
 */
export function decodeLegacyBitmasks(
  params: URLSearchParams,
  config: AppConfig,
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const group of config.groups) {
    const raw = params.get(group.urlParam);
    if (raw === null) continue;
    const mask = Number.parseInt(raw, 10);
    if (!Number.isFinite(mask)) continue;
    for (const layer of config.layers) {
      if (layer.group !== group.id || layer.legacyBit === undefined) continue;
      // eslint-disable-next-line no-bitwise
      visibility[layer.id] = (mask & layer.legacyBit) !== 0;
    }
  }
  return visibility;
}

export function encodeLegacyBitmasks(
  visibility: Record<string, boolean>,
  config: AppConfig,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of config.groups) {
    let mask = 0;
    let any = false;
    for (const layer of config.layers) {
      if (layer.group !== group.id || layer.legacyBit === undefined) continue;
      any = true;
      if (visibility[layer.id]) mask |= layer.legacyBit;
    }
    if (any && mask > 0) out[group.urlParam] = String(mask);
  }
  return out;
}

export function readUrlState(config: AppConfig, search = window.location.search): UrlState {
  const params = new URLSearchParams(search);

  const highlight =
    params.get('val') !== null
      ? {
          ids: params.get('val') ?? '',
          layerIndex: params.get('lyr') ?? '0',
          label: decodeURIComponent((params.get('lbl') ?? '').replace(/\+/g, ' ')),
        }
      : null;

  const centerX = Number.parseFloat(params.get('X') ?? '');
  const centerY = Number.parseFloat(params.get('Y') ?? '');
  const zoomRaw = Number.parseInt(params.get('zoom') ?? '', 10);

  const filters: Record<string, string[]> = {};
  for (const facet of config.huntFinder.facets) {
    if (facet.type === 'search') continue;
    const raw = params.get(`f.${facet.id}`);
    if (raw) filters[facet.id] = raw.split(',').filter(Boolean);
  }

  return {
    layerVisibility: decodeLegacyBitmasks(params, config),
    basemapId: params.get('basemap'),
    center:
      Number.isFinite(centerX) && Number.isFinite(centerY) ? [centerX, centerY] : null,
    zoom: Number.isFinite(zoomRaw) ? zoomRaw : null,
    highlight,
    filters,
    keyword: params.get('q') ?? '',
  };
}

export interface WriteUrlOptions {
  config: AppConfig;
  layerVisibility: Record<string, boolean>;
  basemapId: string;
  center: [number, number];
  zoom: number;
  filters: Record<string, string[]>;
  keyword: string;
}

export function buildShareUrl(opts: WriteUrlOptions, base = window.location.href): string {
  const url = new URL(base);
  url.search = '';
  const params = url.searchParams;

  for (const [key, value] of Object.entries(encodeLegacyBitmasks(opts.layerVisibility, opts.config))) {
    params.set(key, value);
  }
  params.set('basemap', opts.basemapId);
  params.set('X', opts.center[0].toFixed(5));
  params.set('Y', opts.center[1].toFixed(5));
  params.set('zoom', String(Math.round(opts.zoom)));

  for (const [facetId, values] of Object.entries(opts.filters)) {
    if (values.length) params.set(`f.${facetId}`, values.join(','));
  }
  if (opts.keyword) params.set('q', opts.keyword);

  return url.toString();
}

/** Replaces the URL without adding a history entry — keeps Back usable. */
export function syncUrl(opts: WriteUrlOptions): void {
  const next = buildShareUrl(opts);
  if (next !== window.location.href) {
    window.history.replaceState(null, '', next);
  }
}
