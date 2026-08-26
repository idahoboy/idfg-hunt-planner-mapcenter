/**
 * The hunt inventory snapshot, loaded once and indexed for lookup by place.
 *
 * Built by `scripts/build-inventory.mjs`. Because it is a static file, asking
 * "what can I hunt here" is an array filter rather than a network round trip —
 * which is what makes answering it on every map click reasonable at all.
 */

export interface Hunt {
  id: number;
  tagId: number;
  tag: string;
  season: string;
  type: 'general' | 'controlled';
  number: string | null;
  game: string;
  species: string;
  method: string;
  ornament: string | null;
  open: string;
  close: string;
  permits: number | null;
  unlimited: boolean;
  area: string;
  areaIsCode: boolean;
  /** GMUs the area text mentions. A reference, not an identity. */
  unitsReferenced: string[];
  /** The area text carries a qualifier — "portion of", "except", "private". */
  areaQualified: boolean;
  tagArea: string | null;
  restrictions: number[];
  accessGrade: 'open' | 'limited' | 'permission' | 'rule';
  areaIds: number[] | null;
}

export interface RestrictionInfo {
  code: number;
  label: string;
  access?: 'limited' | 'permission' | 'rule';
}

export interface Inventory {
  generated: string;
  counts: Record<string, unknown>;
  vocabulary: { restrictions: RestrictionInfo[] } & Record<string, unknown>;
  dataQuality: {
    ambiguousAreas: Array<{ species: string; area: string; candidates: number[] }>;
    unmappable: Array<{ species: string; area: string; tag: string }>;
  } & Record<string, unknown>;
  hunts: Hunt[];
}

export interface IndexedInventory {
  inventory: Inventory;
  /** unit name -> general hunts whose text references it */
  byUnit: Map<string, Hunt[]>;
  /** AreaID -> controlled hunts that resolve to it */
  byAreaId: Map<number, Hunt[]>;
  /** Every AreaID the current season actually references. */
  referencedAreaIds: Set<number>;
  restrictions: Map<number, RestrictionInfo>;
  /** `${species}${area}` for areas whose boundary is undecided. */
  ambiguous: Set<string>;
}

let pending: Promise<IndexedInventory | null> | null = null;

function index(inv: Inventory): IndexedInventory {
  const byUnit = new Map<string, Hunt[]>();
  const byAreaId = new Map<number, Hunt[]>();
  const referencedAreaIds = new Set<number>();

  for (const hunt of inv.hunts) {
    for (const unit of hunt.unitsReferenced ?? []) {
      const list = byUnit.get(unit);
      if (list) list.push(hunt);
      else byUnit.set(unit, [hunt]);
    }
    for (const areaId of hunt.areaIds ?? []) {
      referencedAreaIds.add(areaId);
      const list = byAreaId.get(areaId);
      if (list) list.push(hunt);
      else byAreaId.set(areaId, [hunt]);
    }
  }

  return {
    inventory: inv,
    byUnit,
    byAreaId,
    referencedAreaIds,
    restrictions: new Map((inv.vocabulary?.restrictions ?? []).map((r) => [r.code, r])),
    ambiguous: new Set(
      (inv.dataQuality?.ambiguousAreas ?? []).map((a) => `${a.species}${a.area}`),
    ),
  };
}

/**
 * Loads and indexes the snapshot once. Resolves to null when the file is
 * absent — the click result then degrades to place and access only, rather
 * than the whole feature disappearing. A deployment without a snapshot is a
 * missing build step, not a reason to break the map.
 */
export function loadInventory(url: string): Promise<IndexedInventory | null> {
  pending ??= (async () => {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return index((await res.json()) as Inventory);
    } catch (err) {
      console.warn(
        `[inventory] ${url} unavailable — click results will omit hunts. ` +
          `Run "npm run build:inventory". (${err instanceof Error ? err.message : err})`,
      );
      return null;
    }
  })();
  return pending;
}

/** Test seam: forget the cached load. */
export function resetInventory(): void {
  pending = null;
}
