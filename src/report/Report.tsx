import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { appUrl } from '@/lib/appUrl';
import {
  isUnavailable,
  type ChangeReport,
  type ChangedHunt,
  type HuntRow,
  type InventoryComparison,
  type ReshapedService,
  type ServiceRow,
  type ServicesComparison,
  type Unavailable,
} from './types';

const DEFAULT_ROWS = 25;

export function Report(): ReactNode {
  const [report, setReport] = useState<ChangeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(appUrl('changes.json'), { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReport((await res.json()) as ChangeReport);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  return (
    <>
      <a className="rp-skiplink" href="#report">Skip to the report</a>
      <header className="rp-header">
        <div className="rp-header__inner">
          <h1>Data changes</h1>
          <span className="rp-header__sub">Idaho Hunt Planner — Map Center</span>
          <span className="rp-header__spacer" />
          {report && (
            <span className="rp-header__sub">
              Report built {formatStamp(report.generated)}
            </span>
          )}
          <a href={appUrl('')}>Back to the map</a>
        </div>
      </header>

      <main className="rp-main" id="report">
        {error && <MissingReport error={error} />}
        {!error && !report && <p className="rp-muted">Loading the report…</p>}

        {report && (
          <>
            <button
              type="button"
              className="rp-more rp-expandall"
              onClick={() => {
                const all = document.querySelectorAll<HTMLDetailsElement>('details.rp-section');
                const anyClosed = [...all].some((d) => !d.open);
                all.forEach((d) => { d.open = anyClosed; });
              }}
            >
              Expand / collapse all sections
            </button>

            <InventoryCard comparison={report.comparisons.inventory} />
            <ServicesCard comparison={report.comparisons.services} />
            <ArchiveCard report={report} />
            <HowCard />
          </>
        )}
      </main>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function MissingReport({ error }: { error: string }): ReactNode {
  return (
    <div className="rp-card">
      <h2>No report has been built yet</h2>
      <p className="rp-muted">
        <code>changes.json</code> could not be read ({error}). It is produced from the
        committed capture archive, not from a live service, so building it needs no
        network access:
      </p>
      <p className="rp-footnote"><code>npm run snapshot</code> — take a capture</p>
      <p className="rp-footnote"><code>npm run diff</code> — compare the last two and write this report</p>
    </div>
  );
}

function Unbuilt({ title, reason }: { title: string; reason: Unavailable }): ReactNode {
  return (
    <section className="rp-card">
      <h2>{title}</h2>
      <div className="rp-notice">
        <p>{reason.unavailable}</p>
        {reason.baseline && (
          <p className="rp-footnote">
            Baseline on file: <code>{reason.baseline.file}</code>
          </p>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- inventory */

function InventoryCard({
  comparison,
}: {
  comparison: InventoryComparison | Unavailable | undefined;
}): ReactNode {
  if (!comparison) return null;
  if (isUnavailable(comparison)) return <Unbuilt title="Hunts" reason={comparison} />;

  const t = comparison.totals;
  const dq = comparison.dataQuality;
  const vocab = Object.entries(comparison.vocabulary);

  return (
    <section className="rp-card">
      <h2>Hunts</h2>
      <p className="rp-card__span">{spanLabel(comparison)}</p>

      <div className="rp-tiles">
        <Tile n={t.after} k="published now" was={`was ${t.before}`} />
        <Tile n={t.added} k="added" tone="note" />
        <Tile n={t.withdrawn} k="withdrawn" tone={t.withdrawn ? 'alert' : 'quiet'} />
        <Tile n={t.expired} k="expired" tone="quiet" />
        <Tile n={t.changedMajor} k="materially changed" was={`${t.changed} in total`} tone={t.changedMajor ? 'note' : 'quiet'} />
      </div>

      {comparison.probableRollover && (
        <div className="rp-notice">
          <p>
            <strong>More than a quarter of the corpus is gone between these two
            captures.</strong> That is a season rollover rather than a list of
            individual withdrawals — read the removals below as a set, not as
            decisions about particular hunts.
          </p>
        </div>
      )}

      {t.withdrawn > 0 && !comparison.probableRollover && (
        <div className="rp-notice rp-notice--alert">
          <p>
            {t.withdrawn === 1 ? 'One hunt' : `${t.withdrawn} hunts`} disappeared while
            still having a season ahead of {t.withdrawn === 1 ? 'it' : 'them'}. A hunt
            whose close date has passed is expired and listed separately; these are not
            that.
          </p>
        </div>
      )}

      <ChangedSection rows={comparison.changed} totals={t} />
      <HuntSection
        id="withdrawn"
        title="Withdrawn — season still ahead of it"
        rows={comparison.withdrawn}
      />
      <HuntSection id="added" title="Added" rows={comparison.added} />
      <HuntSection id="expired" title="Expired — close date had passed" rows={comparison.expired} />

      {vocab.length > 0 && (
        <Section title="New and retired vocabulary" count={vocab.length}>
          <p className="rp-footnote">
            A value appearing here that the application does not recognise — a new
            weapon, a new ornamentation class — is the kind of change that quietly
            empties a filter.
          </p>
          <div className="rp-tablewrap">
            <table className="rp-table">
              <caption>Distinct values published by the API, by category</caption>
              <thead>
                <tr><th scope="col">Category</th><th scope="col">New</th><th scope="col">No longer present</th></tr>
              </thead>
              <tbody>
                {vocab.map(([name, d]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{d.added.join(', ') || <span className="rp-muted">—</span>}</td>
                    <td>{d.removed.join(', ') || <span className="rp-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        title="Data quality"
        count={`${dq.unmappable.after} unmappable · ${dq.ambiguous.after} ambiguous`}
      >
        <p className="rp-footnote">
          Both numbers are counted by the capture itself. An unmappable hunt names an
          area with no boundary at all; an ambiguous one names an area that resolves
          to more than one candidate boundary. Neither is fixable from this
          repository — they are questions for whoever maintains the layers.
        </p>
        <div className="rp-tablewrap">
          <table className="rp-table">
            <caption>Join quality between the hunt API and the GIS boundaries</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th><th scope="col" className="rp-num">Before</th>
                <th scope="col" className="rp-num">After</th><th scope="col">Newly affected</th>
                <th scope="col">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {([['Hunts with no boundary', dq.unmappable], ['Areas with several candidate boundaries', dq.ambiguous]] as const).map(
                ([label, d]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td className="rp-num">{d.before}</td>
                    <td className="rp-num">{d.after}</td>
                    <td>{d.added.join('; ') || <span className="rp-muted">—</span>}</td>
                    <td>{d.removed.join('; ') || <span className="rp-muted">—</span>}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {comparison.counts.length > 0 && (
        <Section title="Headline counts" count={comparison.counts.length}>
          <div className="rp-tablewrap">
            <table className="rp-table">
              <caption>Totals the capture records about itself</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th><th scope="col" className="rp-num">Before</th>
                  <th scope="col" className="rp-num">After</th><th scope="col" className="rp-num">Change</th>
                </tr>
              </thead>
              <tbody>
                {comparison.counts.map((row) => (
                  <tr key={row.metric}>
                    <th scope="row" className="rp-mono">{row.metric}</th>
                    <td className="rp-num">{row.before}</td>
                    <td className="rp-num">{row.after}</td>
                    <td className="rp-num">{signed(row.after - row.before)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </section>
  );
}

function ChangedSection({
  rows,
  totals,
}: {
  rows: ChangedHunt[];
  totals: InventoryComparison['totals'];
}): ReactNode {
  const [majorOnly, setMajorOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!majorOnly || r.major) &&
        (!q || `${r.tag} ${r.area ?? ''} ${r.species ?? ''} ${r.fields.map((f) => f.label).join(' ')}`.toLowerCase().includes(q)),
    );
  }, [rows, majorOnly, query]);

  const shown = showAll ? filtered : filtered.slice(0, DEFAULT_ROWS);

  return (
    <Section title="Changed" count={`${totals.changedMajor} material of ${totals.changed}`}>
      <div className="rp-toolbar">
        <label>
          <input
            type="checkbox"
            checked={majorOnly}
            onChange={(e) => { setMajorOnly(e.target.checked); setShowAll(false); }}
          />
          Material changes only
        </label>
        <label>
          <span className="rp-muted">Filter</span>
          <input
            type="search"
            value={query}
            placeholder="tag, area, species, field…"
            onChange={(e) => { setQuery(e.target.value); setShowAll(false); }}
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rp-muted">Nothing matches.</p>
      ) : (
        <div className="rp-tablewrap">
          <table className="rp-table">
            <caption>
              A hunt appears once with every field that moved. &ldquo;Material&rdquo; excludes
              wording changes to names and codes, which change often and change nothing.
            </caption>
            <thead>
              <tr>
                <th scope="col">Hunt</th><th scope="col">Area</th><th scope="col">What changed</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <HuntLink row={row} />
                    {row.major && <> <span className="rp-chip rp-chip--note">material</span></>}
                  </th>
                  <td>{row.area ?? <span className="rp-muted">—</span>}</td>
                  <td>
                    {row.fields.map((f) => (
                      <div key={f.field} className="rp-delta">
                        {f.label}: <span className="rp-delta__from">{f.before}</span>{' → '}
                        <span className="rp-delta__to">{f.after}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More total={filtered.length} shown={shown.length} onShowAll={() => setShowAll(true)} />
    </Section>
  );
}

function HuntSection({ id, title, rows }: { id: string; title: string; rows: HuntRow[] }): ReactNode {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return <Section title={title} count={0}><p className="rp-muted">None.</p></Section>;
  const shown = showAll ? rows : rows.slice(0, DEFAULT_ROWS);

  return (
    <Section title={title} count={rows.length} id={id}>
      <div className="rp-tablewrap">
        <table className="rp-table">
          <caption>Each row links to the hunt on idfg.idaho.gov.</caption>
          <thead>
            <tr>
              <th scope="col">Hunt</th><th scope="col">Species</th>
              <th scope="col">Area</th><th scope="col">Weapon</th><th scope="col">Season</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <th scope="row"><HuntLink row={row} /></th>
                <td>{row.species ?? <span className="rp-muted">—</span>}</td>
                <td>{row.area ?? <span className="rp-muted">—</span>}</td>
                <td>{row.method ?? <span className="rp-muted">—</span>}</td>
                <td className="rp-mono">
                  {row.open && row.close ? `${row.open} → ${row.close}` : <span className="rp-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <More total={rows.length} shown={shown.length} onShowAll={() => setShowAll(true)} />
    </Section>
  );
}

/** The two link patterns are different things: an opportunity, and a tag everywhere. */
function HuntLink({ row }: { row: HuntRow }): ReactNode {
  return (
    <>
      <a href={`https://idfg.idaho.gov/ifwis/huntplanner/hunt/${row.id}`}>{row.tag}</a>
      {row.tagId !== null && (
        <>
          {' '}
          <a
            className="rp-footnote"
            href={`https://idfg.idaho.gov/ifwis/huntplanner/tag/${row.tagId}`}
            title="This tag everywhere it is offered"
          >
            (tag)
          </a>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- services */

function ServicesCard({
  comparison,
}: {
  comparison: ServicesComparison | Unavailable | undefined;
}): ReactNode {
  if (!comparison) return null;
  if (isUnavailable(comparison)) return <Unbuilt title="Services" reason={comparison} />;

  const t = comparison.totals;

  return (
    <section className="rp-card">
      <h2>Services</h2>
      <p className="rp-card__span">{spanLabel(comparison)}</p>

      <div className="rp-tiles">
        <Tile n={t.after} k="endpoints watched" was={`was ${t.before}`} />
        <Tile n={t.broke} k="broke" tone={t.broke ? 'alert' : 'quiet'} />
        <Tile n={t.unreachableNow} k="unreachable now" tone={t.unreachableNow ? 'alert' : 'quiet'} />
        <Tile n={t.reshaped} k="reshaped" tone={t.reshaped ? 'note' : 'quiet'} />
        <Tile n={t.recovered} k="recovered" tone="quiet" />
        <Tile n={t.gained} k="gained" tone="quiet" />
        <Tile n={t.lost} k="no longer watched" tone="quiet" />
      </div>

      {t.broke > 0 && (
        <div className="rp-notice rp-notice--alert">
          <p>
            <strong>{t.broke === 1 ? 'An endpoint' : `${t.broke} endpoints`} answered on the
            earlier capture and does not now.</strong> This is the failure the archive
            exists to catch: a layer wired into the map that silently returns nothing
            looks identical to a layer nobody switched on.
          </p>
        </div>
      )}

      <ServiceSection title="Broke" rows={comparison.broke} tone="alert" />
      <ReshapedSection rows={comparison.reshaped} />
      <ServiceSection title="Recovered" rows={comparison.recovered} />
      <ServiceSection title="Unreachable as of the later capture" rows={comparison.unreachable} tone="alert" />
      <ServiceSection title="Newly watched" rows={comparison.gained} />
      <ServiceSection title="No longer watched — removed from the configuration" rows={comparison.lost} />
    </section>
  );
}

function ServiceSection({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ServiceRow[];
  tone?: 'alert';
}): ReactNode {
  if (rows.length === 0) return <Section title={title} count={0}><p className="rp-muted">None.</p></Section>;
  return (
    <Section title={title} count={rows.length}>
      <div className="rp-tablewrap">
        <table className="rp-table">
          <caption>The label is the configuration key, so it is searchable in app.config.yml.</caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th><th scope="col">Role</th>
              <th scope="col">Layer</th><th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.url}>
                <th scope="row">
                  <span className="rp-mono">{row.label}</span>
                  {tone === 'alert' && <> <span className="rp-chip rp-chip--alert">down</span></>}
                  <div className="rp-mono rp-muted">{row.url}</div>
                </th>
                <td>{row.role}</td>
                <td>{row.name ?? <span className="rp-muted">—</span>}</td>
                <td>{row.detail ?? <span className="rp-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function ReshapedSection({ rows }: { rows: ReshapedService[] }): ReactNode {
  if (rows.length === 0) return <Section title="Reshaped" count={0}><p className="rp-muted">None.</p></Section>;
  return (
    <Section title="Reshaped" count={rows.length}>
      <p className="rp-footnote">
        The service answered both times and answered differently. A removed field is
        flagged because that is the change that empties a popup without raising an
        error anywhere.
      </p>
      <div className="rp-tablewrap">
        <table className="rp-table">
          <caption>Structural differences between the two captures</caption>
          <thead>
            <tr><th scope="col">Endpoint</th><th scope="col">What changed</th><th scope="col">Fields</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.url}>
                <th scope="row">
                  <span className="rp-mono">{row.label}</span>
                  {row.major && <> <span className="rp-chip rp-chip--alert">check the app</span></>}
                  <div className="rp-mono rp-muted">{row.url}</div>
                </th>
                <td>
                  {row.changes.length === 0 && <span className="rp-muted">fields only</span>}
                  {row.changes.map((c) => (
                    <div key={c.what} className="rp-delta">
                      {c.what}: <span className="rp-delta__from">{c.before}</span>{' → '}
                      <span className="rp-delta__to">{c.after}</span>
                    </div>
                  ))}
                </td>
                <td>
                  {row.fieldsRemoved.length > 0 && (
                    <div className="rp-delta">
                      removed: <span className="rp-delta__from">{row.fieldsRemoved.join(', ')}</span>
                    </div>
                  )}
                  {row.fieldsAdded.length > 0 && (
                    <div className="rp-delta">
                      added: <span className="rp-delta__to">{row.fieldsAdded.join(', ')}</span>
                    </div>
                  )}
                  {row.fieldsAdded.length === 0 && row.fieldsRemoved.length === 0 && (
                    <span className="rp-muted">unchanged</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- archive */

function ArchiveCard({ report }: { report: ChangeReport }): ReactNode {
  const captures = [...report.archive].reverse();
  return (
    <section className="rp-card">
      <h2>The archive</h2>
      <p className="rp-card__span">
        {report.archive.length} capture{report.archive.length === 1 ? '' : 's'} on file
      </p>
      <Section title="Every capture taken" count={captures.length}>
        <p className="rp-footnote">
          A run marked <em>unchanged</em> found the corpus byte-identical to the
          previous one and did not write a second copy. It is still listed, because
          knowing a thing was checked and found unchanged is also a fact.
        </p>
        <ul className="rp-timeline">
          {captures.map((c, i) => (
            <li key={`${c.hash}-${c.at}-${i}`}>
              <time dateTime={c.at}>{formatStamp(c.at)}</time>
              <span>{c.kind}</span>
              <span className="rp-mono rp-muted">{c.hash}</span>
              <span className="rp-muted">{kb(c.bytes)} uncompressed</span>
              {c.unchanged && <span className="rp-chip">unchanged</span>}
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}

function HowCard(): ReactNode {
  return (
    <section className="rp-card">
      <h2>How this is produced</h2>
      <p className="rp-footnote">
        <code>npm run snapshot</code> captures the hunt inventory and the shape of
        every service the map depends on, gzips each capture into{' '}
        <code>snapshots/</code> and commits it. <code>npm run diff</code> compares the
        two most recent captures that differ and writes this page&rsquo;s data. No part of
        this reads a live service, so the report is reproducible from the repository
        alone.
      </p>
      <p className="rp-footnote">
        One rule governs the comparison: <strong>a capture is only ever compared with
        another capture.</strong> An earlier attempt compared a capture against the live
        API and reported 358 changed permit counts; every one was an artefact of the
        two sides representing an unlimited tag differently. Both sides must have been
        through the same normalisation, or the diff measures the normalisation rather
        than the data.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- primitives */

function Section({
  title,
  count,
  children,
  id,
}: {
  title: string;
  count: number | string;
  children: ReactNode;
  id?: string;
}): ReactNode {
  const empty = count === 0;
  return (
    <details className="rp-section" {...(id ? { id } : {})} {...(empty ? {} : { open: true })}>
      <summary>
        {title} <span className="rp-section__count">{count}</span>
      </summary>
      <div className="rp-section__body">{children}</div>
    </details>
  );
}

function Tile({
  n,
  k,
  was,
  tone,
}: {
  n: number;
  k: string;
  was?: string;
  tone?: 'alert' | 'note' | 'quiet';
}): ReactNode {
  return (
    <div className={`rp-tile${tone ? ` rp-tile--${tone}` : ''}`}>
      <span className="rp-tile__n">{n}</span>
      <span className="rp-tile__k">{k}</span>
      {was && <span className="rp-tile__was">{was}</span>}
    </div>
  );
}

function More({
  total,
  shown,
  onShowAll,
}: {
  total: number;
  shown: number;
  onShowAll: () => void;
}): ReactNode {
  if (shown >= total) return null;
  return (
    <button type="button" className="rp-more" onClick={onShowAll}>
      Show the remaining {total - shown} of {total}
    </button>
  );
}

/* ------------------------------------------------------------------ format */

function spanLabel(c: { from: { at: string }; to: { at: string }; spanDays: number }): string {
  const span =
    c.spanDays === 0 ? 'same day' : `${c.spanDays} day${c.spanDays === 1 ? '' : 's'} apart`;
  return `${formatStamp(c.from.at)} → ${formatStamp(c.to.at)} · ${span}`;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));
const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;
