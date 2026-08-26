import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Query from '@arcgis/core/rest/support/Query';
import * as query from '@arcgis/core/rest/query';
type Geometry = __esri.GeometryUnion;

const layerCache = new Map<string, FeatureLayer>();

export function getLayer(url: string): FeatureLayer {
  let layer = layerCache.get(url);
  if (!layer) {
    layer = new FeatureLayer({ url });
    layerCache.set(url, layer);
  }
  return layer;
}

/** SQL string literal escaping. The legacy app interpolated user-selected
 *  values straight into `where` clauses; a hunt area named O'Neil broke it. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlInClause(field: string, values: readonly string[]): string {
  if (values.length === 0) return '1=0';
  return `${field} IN (${values.map(sqlLiteral).join(',')})`;
}

/** Numeric IN clause — rejects anything that is not a finite number. */
export function sqlNumericIn(field: string, values: readonly (string | number)[]): string {
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return '1=0';
  return `${field} IN (${nums.join(',')})`;
}

export function sqlLike(fields: readonly string[], term: string): string {
  const escaped = term.replace(/'/g, "''").replace(/[%_]/g, (c) => `\\${c}`);
  if (!escaped) return '1=1';
  return `(${fields.map((f) => `UPPER(${f}) LIKE UPPER('%${escaped}%')`).join(' OR ')})`;
}

/**
 * ID fields differ per service: Hunting/MapServer/4.AreaID is an integer while
 * Access_Yes.id is a string. Quoting an integer field produces
 * "Unable to complete operation" from ArcGIS rather than an empty result, so
 * pick the right form from the values themselves.
 */
export function sqlIdIn(field: string, ids: readonly (string | number)[]): string {
  if (ids.length === 0) return '1=0';
  const allNumeric = ids.every((id) => id !== '' && Number.isFinite(Number(id)));
  return allNumeric ? sqlNumericIn(field, ids) : sqlInClause(field, ids.map(String));
}

/**
 * Exact number of distinct combinations of `fields`.
 *
 * `returnCountOnly` + `returnDistinctValues` is limited to a single outField by
 * the server, so a composite identity has to be counted by grouping instead.
 * One request either way; the group rows are counted, not returned to the UI.
 */
export async function queryDistinctCount(
  url: string,
  fields: string[],
  where = '1=1',
  geometry?: Geometry | null,
): Promise<number> {
  const q = new Query({
    where,
    returnGeometry: false,
    groupByFieldsForStatistics: fields,
    outStatistics: [
      {
        statisticType: 'count',
        onStatisticField: fields[0]!,
        outStatisticFieldName: 'group_count',
      } as __esri.StatisticDefinitionProperties,
    ],
  });
  if (geometry) {
    q.geometry = geometry;
    q.spatialRelationship = 'intersects';
  }
  const result = await query.executeQueryJSON(url, q);
  return result.features.length;
}

export async function queryDistinctValues(
  url: string,
  field: string,
  where = '1=1',
): Promise<string[]> {
  const q = new Query({
    where,
    outFields: [field],
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: [field],
  });
  const result = await query.executeQueryJSON(url, q);
  const values = new Set<string>();
  for (const feature of result.features) {
    const value = feature.attributes?.[field];
    if (value !== null && value !== undefined && value !== '') values.add(String(value));
  }
  return [...values];
}

export interface FeatureQueryOptions {
  url: string;
  where: string;
  outFields: string[];
  orderByFields?: string[];
  geometry?: Geometry | null;
  returnGeometry?: boolean;
  num?: number;
  start?: number;
  /** Collapse duplicate rows: DISTINCT over `outFields`. */
  distinct?: boolean;
  /** Buffer around `geometry`, so a click tolerance can be expressed in map units. */
  distance?: number;
  units?: __esri.QueryProperties['units'];
}

export async function queryFeatures(opts: FeatureQueryOptions): Promise<__esri.FeatureSet> {
  const q = new Query({
    where: opts.where,
    outFields: opts.outFields,
    returnGeometry: opts.returnGeometry ?? false,
    outSpatialReference: { wkid: 102100 },
  });
  if (opts.orderByFields?.length) q.orderByFields = opts.orderByFields;
  if (opts.geometry) {
    q.geometry = opts.geometry;
    q.spatialRelationship = 'intersects';
    if (opts.distance !== undefined) {
      q.distance = opts.distance;
      if (opts.units) q.units = opts.units;
    }
  }
  if (opts.distinct) q.returnDistinctValues = true;
  if (opts.num !== undefined) q.num = opts.num;
  if (opts.start !== undefined) q.start = opts.start;
  return query.executeQueryJSON(opts.url, q);
}

/**
 * Exact row count. Pass `distinctFields` to count unique combinations instead
 * of stored rows — the services report `supportsCountDistinct`, so this stays
 * a single request rather than paging everything into the browser.
 */
export async function queryCount(
  url: string,
  where: string,
  geometry?: Geometry | null,
  distinctFields?: string[],
): Promise<number> {
  const q = new Query({ where, returnGeometry: false });
  if (geometry) {
    q.geometry = geometry;
    q.spatialRelationship = 'intersects';
  }
  if (distinctFields?.length) {
    q.returnDistinctValues = true;
    q.outFields = distinctFields;
  }
  return query.executeForCount(url, q);
}
