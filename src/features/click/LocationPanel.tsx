import { useMemo } from 'react';
import { useAppStore } from '@/state/store';
import { useConfig } from '@/config/ConfigContext';
import { Icon } from '@/components/Icon';
import type { HuntMatch, LocationResult } from './locationQuery';

const GRADE_LABEL: Record<string, string> = {
  open: 'Open access',
  limited: 'Limited access',
  permission: 'Permission required',
  rule: 'Special rule',
};

function formatCoord(lon: number, lat: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function HuntRow({ match }: { match: HuntMatch }): React.ReactElement {
  const { hunt } = match;
  return (
    <li className="hp-loc-hunt">
      <div className="hp-loc-hunt__head">
        <span className="hp-loc-hunt__tag">{hunt.tag}</span>
        <span
          className={`hp-grade hp-grade--${hunt.accessGrade}`}
          title={GRADE_LABEL[hunt.accessGrade]}
        >
          {GRADE_LABEL[hunt.accessGrade]}
        </span>
      </div>

      <dl className="hp-loc-hunt__facts">
        <div>
          <dt>Dates</dt>
          <dd>
            {hunt.open} – {hunt.close}
          </dd>
        </div>
        <div>
          <dt>Weapon</dt>
          <dd>{hunt.method}</dd>
        </div>
        {hunt.ornament ? (
          <div>
            <dt>Restriction</dt>
            <dd>{hunt.ornament}</dd>
          </div>
        ) : null}
        <div>
          <dt>Tags</dt>
          <dd>{hunt.unlimited ? 'Unlimited' : (hunt.permits?.toLocaleString() ?? '—')}</dd>
        </div>
      </dl>

      <p className="hp-loc-hunt__area">
        <span className="hp-loc-hunt__areatext">{hunt.area}</span>
        {match.via === 'unit' ? (
          <span className="hp-loc-hunt__via"> · matched by unit reference</span>
        ) : null}
      </p>

      {/* The single most important line in this panel: the drawn boundary is
          wider than where the hunt is actually legal. */}
      {match.qualified ? (
        <p className="hp-loc-hunt__warn">
          <Icon name="alert" size={13} />
          This hunt covers only part of the area shown. The hunt text governs, not the boundary.
        </p>
      ) : null}
      {match.uncertainBoundary ? (
        <p className="hp-loc-hunt__warn">
          <Icon name="alert" size={13} />
          More than one boundary is on file for this hunt area; the current one is unconfirmed.
        </p>
      ) : null}
    </li>
  );
}

export function LocationPanel(): React.ReactElement | null {
  const config = useConfig();
  const result = useAppStore((s) => s.clickResult) as LocationResult | null;
  const loading = useAppStore((s) => s.clickLoading);
  const clear = useAppStore((s) => s.clearClickResult);
  const detailOpen = useAppStore((s) => s.clickDetailOpen);
  const setDetailOpen = useAppStore((s) => s.setClickDetailOpen);

  const grouped = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, HuntMatch[]>();
    for (const m of result.hunts) {
      const key = m.hunt.species;
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    return [...map.entries()];
  }, [result]);

  if (!config.clickQuery.enabled) return null;
  if (!detailOpen || !result) return null;

  const placeLine = result?.place.map((p) => `${p.label} ${p.value}`).join(' · ');

  return (
    <aside className="hp-loc" aria-label="Location details">
      <header className="hp-loc__header">
        <button
          type="button"
          className="hp-loc__back"
          onClick={() => setDetailOpen(false)}
          aria-label="Back to summary"
        >
          <Icon name="chevronRight" size={16} />
        </button>
        <div>
          <h2 className="hp-loc__title">
            {loading ? 'Checking this spot…' : (placeLine || 'This location')}
          </h2>
          {result ? (
            <p className="hp-loc__coord">{formatCoord(result.lon, result.lat)}</p>
          ) : null}
        </div>
        <button type="button" className="hp-iconbtn" onClick={clear} aria-label="Close location details">
          <Icon name="close" size={16} />
        </button>
      </header>

      {loading || !result ? (
        <p className="hp-loc__loading">Looking up units, ownership and hunts…</p>
      ) : (
        <div className="hp-loc__body">
          {result.agreements.length > 0 ? (
            <section className="hp-loc__section">
              <h3 className="hp-loc__label">Access agreement</h3>
              {result.agreements.map((a) => (
                <p key={`${a.id}-${a.name}`} className="hp-loc__agreement">
                  <strong>{a.label}</strong> — {a.name}
                  {a.notifyRequired ? (
                    <span className="hp-loc__agreement-note">
                      {' '}
                      · landowner notification required
                    </span>
                  ) : null}
                </p>
              ))}
            </section>
          ) : null}

          {result.ownership ? (
            <section className="hp-loc__section">
              <h3 className="hp-loc__label">Land under this point</h3>
              <p className="hp-loc__owner">
                <strong>{result.ownership.label}</strong>
                {result.ownership.name ? ` — ${result.ownership.name}` : ''}
              </p>
              {/* Say where this came from and how far to trust it. It is a
                  generalized national layer, not a title record. */}
              {result.ownership.source ? (
                <p className="hp-loc__provenance">
                  Source: {result.ownership.source}
                  {result.ownership.caveat ? ` — ${result.ownership.caveat}` : ''}
                </p>
              ) : null}
            </section>
          ) : null}

          {result.warnings.length > 0 ? (
            <ul className="hp-loc__warnings">
              {result.warnings.map((w) => (
                <li key={w}>
                  <Icon name="alert" size={14} />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <section className="hp-loc__section">
            <h3 className="hp-loc__label">
              {result.hunts.length > 0
                ? `${result.hunts.length} hunt${result.hunts.length === 1 ? '' : 's'} here`
                : 'Hunts here'}
              {result.hiddenByFilters > 0 ? (
                <span className="hp-loc__hidden">
                  {' '}
                  · {result.hiddenByFilters} hidden by your filters
                </span>
              ) : null}
            </h3>

            {result.inventoryMissing ? (
              <p className="hp-loc__empty">
                The hunt inventory has not been built for this deployment, so only
                place and ownership are shown. Run <code>npm run build:inventory</code>.
              </p>
            ) : result.hunts.length === 0 ? (
              <p className="hp-loc__empty">
                No hunts in the snapshot reference this location.
                {result.granularity !== 'local' ? ' Try zooming in.' : ''}
              </p>
            ) : (
              grouped.map(([species, matches]) => (
                <div key={species} className="hp-loc__group">
                  <h4 className="hp-loc__species">{species}</h4>
                  <ul className="hp-loc__hunts">
                    {matches.map((m) => (
                      <HuntRow key={m.hunt.id} match={m} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <p className="hp-loc__footnote">
            Seasons and rules are published at{' '}
            <a href="https://idfg.idaho.gov/rules" target="_blank" rel="noopener noreferrer">
              idfg.idaho.gov/rules
            </a>
            . The brochure governs.
          </p>
        </div>
      )}
    </aside>
  );
}
