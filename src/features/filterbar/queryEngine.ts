import type { AppConfig, FacetConfig, SourceConfig } from '@/config/schema';
import type { ResultRecord } from '@/state/store';
import {
  queryCount, queryDistinctCount, queryFeatures, sqlInClause, sqlLike, sqlNumericIn,
} from '@/lib/arcgisQuery';
type Geometry = __esri.GeometryUnion;

export interface SearchInput {
  config: AppConfig;
  filters: Record<string, string[]>;
  keyword: string;
  /** Set when "search as I move the map" is on. */
  extent?: Geometry | null;
  /** Region facet resolves to geometry; supplied by the caller. */
  regionGeometry?: Geometry | null;
  pageSize: number;
}

export interface SearchOutput {
  results: ResultRecord[];
  total: number;
  perSource: Array<{ sourceId: string; title: string; count: number }>;
}

/** Reverses `speciesAliases` so a UI value ("Bighorn Sheep") maps back to every
 *  underlying service value ("Rocky Mtn Sheep", "California Sheep"). */
function expandAliases(source: SourceConfig, values: string[]): string[] {
  if (!source.speciesAliases) return values;
  const reverse = new Map<string, string[]>();
  for (const [raw, display] of Object.entries(source.speciesAliases)) {
    reverse.set(display, [...(reverse.get(display) ?? []), raw]);
  }
  const out = new Set<string>();
  for (const value of values) {
    const expanded = reverse.get(value);
    if (expanded) expanded.forEach((v) => out.add(v));
    else out.add(value);
  }
  return [...out];
}

/**
 * Decides whether a source participates in the current search. A source drops
 * out when the user has picked a hunt type that excludes it, or when they have
 * picked a species the source cannot represent (Elk Zones cannot answer "Deer").
 */
export function selectSources(config: AppConfig, filters: Record<string, string[]>): SourceConfig[] {
  const huntTypeFacet = config.huntFinder.facets.find((f) => f.id === 'huntType');
  const selectedTypes = filters['huntType'] ?? [];
  const speciesSelected = filters['species'] ?? [];

  let sources = config.huntFinder.sources;

  if (selectedTypes.length && huntTypeFacet?.options) {
    const allowed = new Set<string>();
    for (const type of selectedTypes) {
      const option = huntTypeFacet.options.find((o) => o.value === type);
      option?.sources?.forEach((s) => allowed.add(s));
    }
    if (allowed.size) sources = sources.filter((s) => allowed.has(s.id));
  }

  if (speciesSelected.length) {
    sources = sources.filter((s) => {
      if (!s.speciesScope) return true;
      return s.speciesScope.some((scoped) =>
        speciesSelected.some((sel) => sel.toLowerCase().includes(scoped.toLowerCase())),
      );
    });
  }

  return sources;
}

/** Builds the SQL `where` for one source from the active facet values. */
export function buildWhere(
  source: SourceConfig,
  facets: FacetConfig[],
  filters: Record<string, string[]>,
  keyword: string,
): string {
  const clauses: string[] = [];
  if (source.baseWhere) clauses.push(`(${source.baseWhere})`);

  for (const facet of facets) {
    const values = filters[facet.id];
    if (!values?.length) continue;
    if (facet.appliesTo && !facet.appliesTo.includes(source.id)) continue;
    if (facet.id === 'huntType') continue;      // handled by selectSources
    if (facet.spatial) continue;                // handled by geometry

    const mapping = source.facetFields?.[facet.id];
    if (!mapping) continue;

    if (typeof mapping === 'string') {
      const expanded = facet.applyAliases ? expandAliases(source, values) : values;
      // Year is numeric on every service that exposes it.
      clauses.push(
        facet.id === 'year'
          ? `(${sqlNumericIn(mapping, expanded)})`
          : `(${sqlInClause(mapping, expanded)})`,
      );
    } else {
      // Value -> boolean field mapping, e.g. Access Yes! opportunity flags.
      const flags = values
        .map((v) => mapping[v])
        .filter((f): f is string => Boolean(f))
        .map((f) => `(UPPER(${f}) IN ('Y','YES','TRUE','T','1'))`);
      if (flags.length) clauses.push(`(${flags.join(' OR ')})`);
    }
  }

  const keywordFacet = facets.find((f) => f.type === 'search');
  const searchFields = keywordFacet?.searchFields?.[source.id];
  if (keyword.trim() && searchFields?.length) {
    clauses.push(sqlLike(searchFields, keyword.trim()));
  }

  return clauses.length ? clauses.join(' AND ') : '1=1';
}

/**
 * `{Field}` interpolates with thousands separators; `{Field:raw}` interpolates
 * verbatim. Years are the reason the `:raw` form exists — `{Year}` on its own
 * rendered the 2025 season as "2,025".
 */
function interpolateTemplate(template: string, attrs: Record<string, unknown>): string {
  return template
    .replace(/\{([A-Za-z0-9_.]+)(:raw)?\}/g, (_m, key: string, raw?: string) => {
      const value = attrs[key];
      if (value === null || value === undefined || value === '') return '';
      if (typeof value === 'number' && !raw) return value.toLocaleString();
      return String(value);
    })
    .replace(/\s+/g, ' ')
    .replace(/\s*·\s*$/, '')
    .trim();
}


/**
 * Runs the search across every participating source in parallel and interleaves
 * the results. Counts are exact (`executeForCount`), so the filter bar can show
 * "1,284 hunt areas" without paging the whole set into the browser.
 */
export async function runSearch(input: SearchInput): Promise<SearchOutput> {
  const { config, filters, keyword, pageSize } = input;
  const sources = selectSources(config, filters);
  const facets = config.huntFinder.facets;

  const spatialFacetActive = facets.some(
    (f) => f.spatial && (filters[f.id]?.length ?? 0) > 0,
  );
  const geometry = spatialFacetActive
    ? input.regionGeometry ?? null
    : input.extent ?? null;

  const perSourceLimit = Math.max(5, Math.ceil(pageSize / Math.max(1, sources.length)));

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const where = buildWhere(source, facets, filters, keyword);
      // Sources that store several rows per real-world area (see `dedupeBy`)
      // are queried DISTINCT so both the count and the cards are per area.
      // A paged DISTINCT query is rejected by the server without an ORDER BY,
      // so a source declaring `dedupeBy` must also declare `orderBy`.
      const dedupeFields = source.dedupeBy
        ? (Array.isArray(source.dedupeBy) ? source.dedupeBy : [source.dedupeBy])
        : [];
      const distinct = dedupeFields.length > 0 && Boolean(source.orderBy?.length);
      if (dedupeFields.length > 0 && !source.orderBy?.length) {
        console.warn(
          `[huntFinder] source "${source.id}" sets dedupeBy without orderBy; ` +
            'the service rejects paged DISTINCT queries that have no ORDER BY.',
        );
      }

      const [count, featureSet] = await Promise.all([
        distinct
          ? queryDistinctCount(source.url, dedupeFields, where, geometry)
          : queryCount(source.url, where, geometry),
        queryFeatures({
          url: source.url,
          where,
          // For a deduped source `outFields` IS the identity (validated), so
          // DISTINCT over the projection is exactly one row per area.
          outFields: source.outFields,
          ...(source.orderBy ? { orderByFields: source.orderBy } : {}),
          geometry,
          returnGeometry: false,
          distinct,
          num: perSourceLimit,
        }),
      ]);

      const records: ResultRecord[] = featureSet.features.map((feature, index) => {
        const attrs = (feature.attributes ?? {}) as Record<string, unknown>;
        // A deduped source has no single-column id (the identity is composite),
        // so carry the identity values instead of the raw idField.
        const id = distinct
          ? dedupeFields.map((f) => String(attrs[f] ?? '')).join('\u001f')
          : String(attrs[source.idField] ?? '');
        // Deduped sources are unique on their identity fields; the rest may
        // repeat idField, so fall back to OBJECTID then row position.
        const rowId = distinct
          ? `:${dedupeFields.map((f) => String(attrs[f] ?? '')).join('|')}`
          : `:${String(attrs['OBJECTID'] ?? attrs['objectid'] ?? index)}`;
        return {
          key: `${source.id}:${id}${rowId}`,
          sourceId: source.id,
          sourceTitle: source.title,
          id,
          title: interpolateTemplate(source.titleTemplate, attrs) || source.title,
          subtitle: source.subtitleTemplate
            ? interpolateTemplate(source.subtitleTemplate, attrs)
            : source.title,
          attributes: attrs,
        };
      });

      return { sourceId: source.id, title: source.title, count, records };
    }),
  );

  const results: ResultRecord[] = [];
  const perSource: SearchOutput['perSource'] = [];
  let total = 0;

  for (const [index, outcome] of settled.entries()) {
    const source = sources[index]!;
    if (outcome.status === 'rejected') {
      console.warn(`[huntFinder] source "${source.id}" failed`, outcome.reason);
      perSource.push({ sourceId: source.id, title: source.title, count: 0 });
      continue;
    }
    results.push(...outcome.value.records);
    perSource.push({
      sourceId: outcome.value.sourceId,
      title: outcome.value.title,
      count: outcome.value.count,
    });
    total += outcome.value.count;
  }

  return { results, total, perSource };
}
