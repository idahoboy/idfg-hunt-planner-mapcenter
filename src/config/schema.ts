import { z } from 'zod';

/** Colour: hex, rgb(), or rgba(). Kept loose — ArcGIS accepts all three. */
const Color = z.string().min(3);

const SymbolSchema = z.object({
  type: z.enum(['fill', 'line', 'marker']),
  color: Color.optional(),
  width: z.number().optional(),
  size: z.number().optional(),
  style: z.string().optional(),
  outline: z
    .object({ color: Color, width: z.number().default(1), style: z.string().optional() })
    .optional(),
});

const RendererSchema = z.object({
  type: z.literal('simple'),
  symbol: SymbolSchema,
});

const LabelsSchema = z.object({
  field: z.string(),
  minScale: z.number().optional(),
  maxScale: z.number().optional(),
  color: Color.default('#000000'),
  haloColor: Color.default('#ffffff'),
  haloSize: z.number().default(1),
  size: z.number().default(10),
  weight: z.enum(['normal', 'bold']).default('normal'),
});

const PopupFieldSchema = z.object({
  label: z.string(),
  field: z.string(),
  format: z.enum(['number', 'date', 'text']).optional(),
  suffix: z.string().optional(),
  note: z.string().optional(),
});

const PopupLinkSchema = z
  .object({
    label: z.string(),
    /** Either a static url or a field on the feature containing one. */
    field: z.string().optional(),
    url: z.string().optional(),
  })
  .refine((v) => Boolean(v.field || v.url), { message: 'link needs field or url' });

const PopupSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  fields: z.array(PopupFieldSchema).optional(),
  links: z.array(PopupLinkSchema).optional(),
  /** Yes/No style attributes rendered as chips. */
  badges: z.array(z.object({ label: z.string(), field: z.string() })).optional(),
  /** Yes/No style attributes rendered as warnings when truthy. */
  warnings: z.array(z.object({ label: z.string(), field: z.string() })).optional(),
});

const ScaleGateSchema = z.object({
  enableBelow: z.number(),
  message: z.string().default('zoom in to activate'),
});

const DisclaimerSchema = z.object({
  text: z.string(),
  url: z.string().url().optional(),
});

export const LayerSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Set false to take a layer out of service without deleting its config. */
  enabled: z.boolean().default(true),
  group: z.string(),
  type: z.enum(['feature', 'map-image', 'tile', 'imagery', 'geojson', 'csv', 'vector-tile']),
  url: z.string(),
  fallbackUrl: z.string().optional(),
  legacyBit: z.number().int().positive().optional(),
  visible: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  minScale: z.number().optional(),
  maxScale: z.number().optional(),
  outFields: z.array(z.string()).optional(),
  definitionExpression: z.string().optional(),
  sublayers: z.array(z.number()).optional(),
  sublayerDefinitions: z.record(z.string(), z.string()).optional(),
  refreshIntervalMinutes: z.number().positive().optional(),
  popup: PopupSchema.optional(),
  labels: LabelsSchema.optional(),
  renderer: RendererSchema.optional(),
  scaleGate: ScaleGateSchema.optional(),
  disclaimer: DisclaimerSchema.optional(),
  health: z.enum(['verified', 'replaced', 'unverified', 'deprecated']).default('unverified'),
});

const BasemapSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['tiled', 'vector-tile', 'map-image']),
  url: z.string(),
  referenceUrl: z.string().optional(),
  thumbnail: z.string().optional(),
  printable: z.boolean().default(true),
});

const FacetSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['multiselect', 'select', 'search', 'toggleGroup', 'extent']),
  icon: z.string().optional(),
  placeholder: z.string().optional(),
  primary: z.boolean().default(false),
  source: z.enum(['live', 'static']).default('static'),
  from: z.string().optional(),
  field: z.string().optional(),
  sortBy: z.enum(['label', 'natural', 'value', 'valueDesc']).default('label'),
  applyAliases: z.boolean().default(false),
  spatial: z.boolean().default(false),
  appliesTo: z.array(z.string()).optional(),
  searchFields: z.record(z.string(), z.array(z.string())).optional(),
  lookup: z.object({ url: z.string(), field: z.string() }).optional(),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
        sources: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['controlled', 'unit', 'zone', 'waterfowl', 'access', 'distribution']),
  url: z.string(),
  idField: z.string(),
  titleTemplate: z.string(),
  subtitleTemplate: z.string().optional(),
  outFields: z.array(z.string()).default(['*']),
  orderBy: z.array(z.string()).optional(),
  baseWhere: z.string().optional(),
  /**
   * Identity field(s) to collapse duplicate rows on. Some services store several
   * rows per real-world feature; querying DISTINCT over these fields returns one
   * card per area instead of one per stored row. Accepts a single field name or
   * a list for a composite identity.
   */
  dedupeBy: z.union([z.string(), z.array(z.string())]).optional(),
  speciesScope: z.array(z.string()).optional(),
  kmlTemplate: z.string().optional(),
  /** Shown above this source's results. Use for known data caveats. */
  caveat: z.string().optional(),
  /**
   * How an expanded result card renders. Without one, the card falls back to
   * listing whatever `outFields` returned, which for a source selecting "*"
   * means raw database columns.
   */
  detail: PopupSchema.optional(),
  /** Borrow the popup already written for this layer id, instead of repeating it. */
  detailFromLayer: z.string().optional(),
  speciesAliases: z.record(z.string(), z.string()).optional(),
  facetFields: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
});

export const AppConfigSchema = z.object({
  version: z.number(),
  app: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    logo: z.string().optional(),
    huntYear: z.union([z.literal('auto'), z.number()]).default('auto'),
    helpUrl: z.string().optional(),
    contactUrl: z.string().optional(),
    rulesUrl: z.string().optional(),
    termsUrl: z.string().optional(),
    huntPlannerUrl: z.string().optional(),
  }),
  roots: z.record(z.string(), z.string()),
  network: z.object({
    trustedServers: z.array(z.string()).default([]),
    proxyUrl: z.string().nullable().default(null),
    requestTimeoutMs: z.number().default(30000),
  }),
  map: z.object({
    center: z.tuple([z.number(), z.number()]),
    zoom: z.number(),
    minZoom: z.number().default(4),
    maxZoom: z.number().default(20),
    extent: z.object({
      xmin: z.number(), ymin: z.number(), xmax: z.number(), ymax: z.number(),
      wkid: z.number().default(4326),
    }),
    popup: z
      .object({
        dockEnabled: z.boolean().default(true),
        dockPosition: z.string().default('bottom-right'),
        breakpoint: z.boolean().default(true),
      })
      .default({}),
  }),
  basemaps: z.object({ default: z.string(), items: z.array(BasemapSchema).min(1) }),
  groups: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      urlParam: z.string(),
      icon: z.string().optional(),
      defaultOpen: z.boolean().default(false),
    }),
  ),
  layers: z.array(LayerSchema),
  huntFinder: z.object({
    enabled: z.boolean().default(true),
    cacheTtlMinutes: z.number().default(60),
    pageSize: z.number().default(50),
    results: z.object({
      hoverHighlights: z.boolean().default(true),
      clickZooms: z.boolean().default(true),
      syncToExtent: z.boolean().default(true),
      syncDefault: z.boolean().default(false),
      emptyMessage: z.string().default('No results.'),
    }),
    sources: z.array(SourceSchema),
    facets: z.array(FacetSchema),
  }),
  highlight: z.object({
    symbol: z.object({ fill: Color, outline: Color, width: z.number().default(2) }),
    hatchedSymbol: z.object({ style: z.string(), color: Color, width: z.number() }).optional(),
    labelSymbol: z
      .object({
        color: Color, haloColor: Color, size: z.number(), weight: z.string(),
      })
      .optional(),
    zoomPadding: z.number().default(60),
    queryLayers: z.record(
      z.string(),
      z.object({ url: z.string(), idField: z.string(), label: z.string() }),
    ),
  }),
  tools: z.record(z.string(), z.record(z.string(), z.unknown())),
  ui: z.object({
    theme: z.record(z.string(), z.string()),
    themeDark: z.record(z.string(), z.string()).optional(),
    layout: z.record(z.string(), z.number()),
    darkMode: z.enum(['auto', 'light', 'dark']).default('auto'),
    reduceMotionRespected: z.boolean().default(true),
    a11y: z.record(z.string(), z.boolean()).default({}),
    shortcuts: z.record(z.string(), z.string()).default({}),
  }),
  diagnostics: z.object({
    healthPanel: z.boolean().default(true),
    probeOnBoot: z.boolean().default(false),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
    showLayerLoadErrors: z.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type LayerConfig = z.infer<typeof LayerSchema>;
export type BasemapConfig = z.infer<typeof BasemapSchema>;
export type FacetConfig = z.infer<typeof FacetSchema>;
export type SourceConfig = z.infer<typeof SourceSchema>;
export type PopupConfig = z.infer<typeof PopupSchema>;
export type GroupConfig = AppConfig['groups'][number];
