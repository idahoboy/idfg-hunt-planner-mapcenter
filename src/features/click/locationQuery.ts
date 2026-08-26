import Point from '@arcgis/core/geometry/Point';
import type MapView from '@arcgis/core/views/MapView';
import { queryFeatures } from '@/lib/arcgisQuery';
import { loadInventory, type Hunt, type IndexedInventory } from '@/lib/inventory';
import type { AppConfig } from '@/config/schema';

export type Granularity = 'statewide' | 'regional' | 'local';

export interface PlaceFact {
  id: string;
  label: string;
  value: string;
}

export interface HuntMatch {
  hunt: Hunt;
  /** Why this hunt is being shown — a unit reference, or a resolved polygon. */
  via: 'unit' | 'huntArea';
  /** The GMU boundary overstates where this hunt is legal. */
  qualified: boolean;
  /** The polygon this resolved through has more than one candidate boundary. */
  uncertainBoundary: boolean;
}

export interface LocationResult {
  lon: number;
  lat: number;
  scale: number;
  granularity: Granularity;
  place: PlaceFact[];
  unit: string | null;
  ownership: { code: string; label: string; name: string | null } | null;
  hunts: HuntMatch[];
  /** Hunts hidden because the user's own filters exclude them. */
  hiddenByFilters: number;
  warnings: string[];
  /** Raw hits from whatever operational layers are switched on. */
  layerHits: Array<{ layerId: string; title: string; count: number; sample: string }>;
  inventoryMissing: boolean;
}

type ContextCfg = {
  id: string;
  label: string;
  url: string;
  fields: string[];
  display: string;
  multiple?: boolean;
};

function granularityFor(scale: number, cfg: AppConfig['clickQuery']): Granularity {
  if (scale <= cfg.granularity.localBelowScale) return 'local';
  if (scale <= cfg.granularity.regionalBelowScale) return 'regional';
  return 'statewide';
}

/** Screen-pixel tolerance as a map distance, so a fingertip resolves. */
function toleranceMeters(view: MapView, px: number): number {
  const res = view.resolution || 1;
  return Math.max(res * px, 1);
}

async function pointQuery(
  url: string,
  point: Point,
  outFields: string[],
  distance: number,
): Promise<Array<Record<string, unknown>>> {
  try {
    const fs = await queryFeatures({
      url,
      where: '1=1',
      outFields,
      geometry: point,
      returnGeometry: false,
      distance,
      units: 'meters',
      num: 60,
    });
    return fs.features.map((f) => (f.attributes ?? {}) as Record<string, unknown>);
  } catch {
    // One unreachable context layer must not take the whole answer down.
    return [];
  }
}

/**
 * Applies the filters the user already set, so clicking answers *their*
 * question. Someone narrowed to archery elk should not get all 47 tags that
 * touch the unit.
 */
function matchesActiveFilters(hunt: Hunt, filters: Record<string, string[]>): boolean {
  const species = filters['species'] ?? [];
  if (species.length && !species.some((s) => hunt.species === s || hunt.game === s)) {
    return false;
  }
  const huntType = filters['huntType'] ?? [];
  if (huntType.length) {
    const wantsControlled = huntType.includes('controlled');
    const wantsGeneral = huntType.includes('unit') || huntType.includes('general');
    if (wantsControlled !== wantsGeneral) {
      if (wantsControlled && hunt.type !== 'controlled') return false;
      if (wantsGeneral && hunt.type !== 'general') return false;
    }
  }
  return true;
}

function sortHunts(a: HuntMatch, b: HuntMatch): number {
  // General tags first — far more people hold one — then by species, then tag.
  if (a.hunt.type !== b.hunt.type) return a.hunt.type === 'general' ? -1 : 1;
  if (a.hunt.species !== b.hunt.species) return a.hunt.species.localeCompare(b.hunt.species);
  return a.hunt.tag.localeCompare(b.hunt.tag);
}

/**
 * Turns a clicked point into an answer.
 *
 * Order of work matters for perceived speed: context and ownership are network
 * queries and run together; hunts come from the in-memory snapshot and cost
 * nothing once it is loaded.
 */
export async function queryLocation(
  view: MapView,
  mapPoint: Point,
  config: AppConfig,
  filters: Record<string, string[]>,
  visibleLayerIds: Set<string>,
): Promise<LocationResult> {
  const cfg = config.clickQuery;
  const scale = view.scale;
  const granularity = granularityFor(scale, cfg);
  const distance = toleranceMeters(view, cfg.tolerancePx);

  const lonlat = { lon: mapPoint.longitude ?? 0, lat: mapPoint.latitude ?? 0 };

  const contexts = cfg.context as ContextCfg[];
  const [contextResults, ownershipRows, indexed] = await Promise.all([
    Promise.all(contexts.map((c) => pointQuery(c.url, mapPoint, c.fields, distance))),
    granularity === 'local' && cfg.ownership
      ? pointQuery(cfg.ownership.url, mapPoint, cfg.ownership.fields, distance)
      : Promise.resolve([]),
    loadInventory(cfg.inventory.url),
  ]);

  // ---- where am I -------------------------------------------------------
  const place: PlaceFact[] = [];
  let unit: string | null = null;
  const areaIdsHere = new Set<number>();

  contexts.forEach((c, i) => {
    const rows = contextResults[i] ?? [];
    if (rows.length === 0) return;

    if (c.multiple) {
      for (const row of rows) {
        const id = Number(row['AreaID']);
        if (Number.isFinite(id)) areaIdsHere.add(id);
      }
      return;
    }

    const value = String(rows[0]?.[c.display] ?? '').trim();
    if (!value) return;
    place.push({ id: c.id, label: c.label, value });
    if (c.id === 'unit') unit = value;
  });

  // ---- who owns the ground ----------------------------------------------
  let ownership: LocationResult['ownership'] = null;
  if (ownershipRows.length > 0 && cfg.ownership) {
    const row = ownershipRows[0]!;
    const code = String(row[cfg.ownership.agencyField] ?? '').trim() || 'UNK';
    ownership = {
      code,
      label: cfg.ownership.labels?.[code] ?? code,
      name: (row[cfg.ownership.nameField] as string | null) ?? null,
    };
  }

  // ---- what can I hunt --------------------------------------------------
  const matches = new Map<number, HuntMatch>();
  let hiddenByFilters = 0;

  const consider = (hunt: Hunt, via: HuntMatch['via'], uncertain: boolean) => {
    if (matches.has(hunt.id)) return;
    if (!matchesActiveFilters(hunt, filters)) {
      hiddenByFilters += 1;
      return;
    }
    matches.set(hunt.id, {
      hunt,
      via,
      qualified: hunt.areaQualified,
      uncertainBoundary: uncertain,
    });
  };

  if (indexed) {
    if (unit && cfg.inventory.matchGeneralByUnit) {
      for (const hunt of indexed.byUnit.get(unit) ?? []) consider(hunt, 'unit', false);
    }
    if (cfg.inventory.matchControlledByAreaId) {
      for (const areaId of areaIdsHere) {
        // Only areas the current season references mean anything; the rest are
        // historical boundaries that happen to still sit in the service.
        if (!indexed.referencedAreaIds.has(areaId)) continue;
        for (const hunt of indexed.byAreaId.get(areaId) ?? []) {
          consider(hunt, 'huntArea', isAmbiguous(indexed, hunt));
        }
      }
    }
  }

  const hunts = [...matches.values()].sort(sortHunts).slice(0, cfg.inventory.maxHunts);

  // ---- what should worry me ---------------------------------------------
  const warnings: string[] = [];
  if (hunts.some((h) => h.qualified)) {
    warnings.push(
      'Some hunts here are limited to part of the unit, or exclude private land. ' +
        'The boundary drawn is wider than where you may hunt — read the hunt text and the seasons brochure.',
    );
  }
  if (hunts.some((h) => h.uncertainBoundary)) {
    warnings.push(
      'A hunt area here has more than one boundary on file and the current one is unconfirmed.',
    );
  }
  if (ownership?.code === 'PVT') {
    warnings.push('The ground under this point is private. Permission is required.');
  }
  if (granularity !== 'local') {
    warnings.push('Zoom in for land ownership and access at a specific spot.');
  }

  // ---- what the user has switched on ------------------------------------
  const layerHits: LocationResult['layerHits'] = [];
  for (const layer of config.layers) {
    if (!visibleLayerIds.has(layer.id)) continue;
    layerHits.push({ layerId: layer.id, title: layer.title, count: 0, sample: '' });
  }

  return {
    ...lonlat,
    scale,
    granularity,
    place,
    unit,
    ownership,
    hunts,
    hiddenByFilters,
    warnings,
    layerHits,
    inventoryMissing: indexed === null,
  };
}

function isAmbiguous(indexed: IndexedInventory, hunt: Hunt): boolean {
  return indexed.ambiguous.has(`${hunt.species}${hunt.area}`);
}
