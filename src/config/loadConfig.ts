import { parse } from 'yaml';
import { AppConfigSchema, LayerSchema, type AppConfig, type LayerConfig } from './schema';

// Resolved against BASE_URL so the same bundle works at the site root (the
// container) and under a sub-path (GitHub Pages).
const CONFIG_URL =
  import.meta.env['VITE_CONFIG_URL'] ?? `${import.meta.env.BASE_URL}config/app.config.yml`;

/**
 * Resolve `${roots.name}` references. The legacy app pasted the same four
 * service hostnames into 40+ string concatenations; when one moved, every
 * occurrence had to be found by hand. One indirection removes that class of bug.
 */
function interpolate(value: unknown, roots: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{roots\.([A-Za-z0-9_]+)\}/g, (match, key: string) => {
      const root = roots[key];
      if (root === undefined) {
        console.warn(`[config] unknown root "${key}" in "${value}"`);
        return match;
      }
      return root;
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, roots));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(v, roots)]),
    );
  }
  return value;
}

export class ConfigError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface LoadedConfig {
  config: AppConfig;
  /** Layers that failed schema validation, so the health panel can show them. */
  rejectedLayers: Array<{ id: string; problems: string }>;
  /** Layers switched off in config (e.g. the service went private upstream). */
  disabledLayers: Array<{ id: string; title: string }>;
}

export async function loadConfig(url: string = CONFIG_URL): Promise<LoadedConfig> {
  let text: string;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new ConfigError(`config fetch failed: HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    throw new ConfigError(`Could not load ${url}`, err);
  }

  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new ConfigError('Config is not valid YAML', err);
  }

  const roots = (raw as { roots?: Record<string, string> }).roots ?? {};
  const resolved = interpolate(raw, roots) as Record<string, unknown>;

  // Validate layers individually so one bad entry degrades that layer only,
  // rather than blanking the whole map.
  const rejectedLayers: LoadedConfig['rejectedLayers'] = [];
  const rawLayers = Array.isArray(resolved['layers']) ? (resolved['layers'] as unknown[]) : [];
  const goodLayers: LayerConfig[] = [];
  for (const entry of rawLayers) {
    const parsed = LayerSchema.safeParse(entry);
    if (parsed.success) {
      goodLayers.push(parsed.data);
    } else {
      const id = (entry as { id?: string })?.id ?? '(missing id)';
      const problems = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      rejectedLayers.push({ id, problems });
      console.error(`[config] layer "${id}" rejected — ${problems}`);
    }
  }
  const disabledLayers = goodLayers
    .filter((l) => !l.enabled)
    .map((l) => ({ id: l.id, title: l.title }));
  resolved['layers'] = goodLayers.filter((l) => l.enabled);

  const parsed = AppConfigSchema.safeParse(resolved);
  if (!parsed.success) {
    throw new ConfigError(
      'Config failed validation',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  const config = parsed.data;

  // Cross-reference checks the schema cannot express.
  const groupIds = new Set(config.groups.map((g) => g.id));
  for (const layer of config.layers) {
    if (!groupIds.has(layer.group)) {
      console.warn(`[config] layer "${layer.id}" references unknown group "${layer.group}"`);
    }
  }
  if (!config.basemaps.items.some((b) => b.id === config.basemaps.default)) {
    console.warn(
      `[config] basemaps.default "${config.basemaps.default}" is not in basemaps.items; using the first entry`,
    );
  }

  return { config, rejectedLayers, disabledLayers };
}
