import type { AppConfig, PopupConfig, SourceConfig } from '@/config/schema';
import type { ResultRecord } from '@/state/store';
import { formatAttr, isTruthy } from '@/map/popup';

/** Bookkeeping columns that mean nothing to a hunter. Only used by the
 *  fallback renderer, when a source declares no detail view. */
const HIDDEN =
  /^(objectid|globalid|shape|shape_|se_anno|created_|last_edited_|aud_|.*rank$|.*id$|.*status$|publish|bid)/i;
const URL_FIELD = /(url|link|website)/i;

function prettify(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Resolves the detail view: inline config, a borrowed layer popup, or none. */
export function detailConfigFor(
  source: SourceConfig,
  config: AppConfig,
): PopupConfig | null {
  if (source.detail) return source.detail;
  if (source.detailFromLayer) {
    const layer = config.layers.find((l) => l.id === source.detailFromLayer);
    if (layer?.popup) return layer.popup;
    console.warn(
      `[results] source "${source.id}" borrows detail from layer "${source.detailFromLayer}", which has no popup`,
    );
  }
  return null;
}

function CuratedDetail({
  cfg,
  attrs,
}: {
  cfg: PopupConfig;
  attrs: Record<string, unknown>;
}): React.ReactElement {
  const facts = (cfg.fields ?? [])
    .map((f) => ({ ...f, raw: attrs[f.field] }))
    .filter((f) => f.raw !== null && f.raw !== undefined && f.raw !== '');

  const badges = (cfg.badges ?? []).filter((b) => isTruthy(attrs[b.field]));
  const warnings = (cfg.warnings ?? []).filter((w) => isTruthy(attrs[w.field]));
  const links = (cfg.links ?? [])
    .map((l) => ({ label: l.label, href: l.url ?? String(attrs[l.field ?? ''] ?? '') }))
    .filter((l) => /^https?:\/\//i.test(l.href));

  return (
    <div className="hp-detail">
      {cfg.content ? <p className="hp-detail__intro">{cfg.content}</p> : null}

      {facts.length > 0 ? (
        <dl className="hp-detail__facts">
          {facts.map((f) => (
            <div key={f.field}>
              <dt>{f.label}</dt>
              <dd
                dangerouslySetInnerHTML={{
                  __html: formatAttr(f.raw, f.format, f.suffix),
                }}
              />
            </div>
          ))}
        </dl>
      ) : null}

      {badges.length > 0 ? (
        <div className="hp-detail__badges">
          <span className="hp-detail__badges-label">Allowed:</span>
          {badges.map((b) => (
            <span key={b.field} className="hp-chip hp-chip--ok">
              {b.label}
            </span>
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="hp-detail__warnings">
          {warnings.map((w) => (
            <li key={w.field}>{w.label}</li>
          ))}
        </ul>
      ) : null}

      {links.length > 0 ? (
        <div className="hp-detail__links">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GenericDetail({ attrs }: { attrs: Record<string, unknown> }): React.ReactElement {
  const entries = Object.entries(attrs)
    .filter(([field]) => !HIDDEN.test(field))
    .map(([field, value]) => {
      if (value === null || value === undefined || value === '') return null;
      const text = typeof value === 'number' ? formatAttr(value, 'number') : String(value).trim();
      return text && text !== 'null' ? { field, value: text } : null;
    })
    .filter((e): e is { field: string; value: string } => e !== null);

  const links = entries.filter((e) => URL_FIELD.test(e.field) && /^https?:\/\//i.test(e.value));
  const facts = entries.filter((e) => !URL_FIELD.test(e.field));

  return (
    <div className="hp-detail">
      {facts.length > 0 ? (
        <dl className="hp-detail__facts">
          {facts.map((e) => (
            <div key={e.field}>
              <dt>{prettify(e.field)}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="hp-detail__empty">No further attributes are published for this area.</p>
      )}
      {links.length > 0 ? (
        <div className="hp-detail__links">
          {links.map((e) => (
            <a key={e.field} href={e.value} target="_blank" rel="noopener noreferrer">
              {prettify(e.field)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Detail shown when a result card is expanded on mobile.
 *
 * Prefers the source's declared detail view — the same shape as a layer popup,
 * so a source can borrow the popup already written for its layer. Falls back to
 * listing the returned attributes, which is only reasonable for sources that
 * project a curated `outFields`; a source selecting "*" without a detail view
 * would otherwise show raw database columns.
 */
export function ResultDetail({
  record,
  source,
  config,
}: {
  record: ResultRecord;
  source: SourceConfig | undefined;
  config: AppConfig;
}): React.ReactElement {
  const attrs = record.attributes;
  const cfg = source ? detailConfigFor(source, config) : null;
  return cfg ? <CuratedDetail cfg={cfg} attrs={attrs} /> : <GenericDetail attrs={attrs} />;
}
