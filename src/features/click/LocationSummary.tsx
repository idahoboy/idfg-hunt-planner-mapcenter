import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';
import type { LocationResult } from './locationQuery';

/**
 * The first thing a click produces: one card, no pagination, no scrolling.
 *
 * The default SDK popup pages through overlapping features one at a time,
 * which asks the reader to do the work of collation. This answers the question
 * at a glance — where you are, who owns it, how many hunts — and puts the
 * detail behind a single deliberate action rather than in front of it.
 */
export function LocationSummary(): React.ReactElement | null {
  const config = useConfig();
  const result = useAppStore((s) => s.clickResult) as LocationResult | null;
  const loading = useAppStore((s) => s.clickLoading);
  const detailOpen = useAppStore((s) => s.clickDetailOpen);
  const openDetail = useAppStore((s) => s.setClickDetailOpen);
  const clear = useAppStore((s) => s.clearClickResult);

  if (!config.clickQuery.enabled) return null;
  if (!loading && !result) return null;
  // While the flyout is open the summary would just be duplication.
  if (detailOpen) return null;

  const place = result?.place ?? [];
  const headline = place[0] ? `${place[0].label} ${place[0].value}` : 'This location';
  const secondary = place
    .slice(1)
    .map((p) => p.value)
    .join(' · ');

  const huntCount = result?.hunts.length ?? 0;
  const worstWarning = result?.warnings[0];

  return (
    <div className="hp-locsum" role="status" aria-live="polite">
      <button
        type="button"
        className="hp-locsum__close"
        onClick={clear}
        aria-label="Dismiss location summary"
      >
        <Icon name="close" size={14} />
      </button>

      {loading || !result ? (
        <p className="hp-locsum__loading">Checking this spot…</p>
      ) : (
        <>
          <div className="hp-locsum__head">
            <h2 className="hp-locsum__title">{headline}</h2>
            {secondary ? <p className="hp-locsum__sub">{secondary}</p> : null}
          </div>

          <div className="hp-locsum__facts">
            {/* An access agreement is the more useful and more accurate fact,
                so it displaces the raw ownership chip rather than sitting
                beside it and contradicting it. */}
            {result.access.some((a) => a.onSite) ? (
              <span className="hp-locsum__fact hp-locsum__fact--ok">
                <Icon name="check" size={13} />
                {result.access.find((a) => a.onSite)!.label}
              </span>
            ) : result.access.length > 0 ? (
              <span className="hp-locsum__fact hp-locsum__fact--ok">
                <Icon name="check" size={13} />
                Access {result.access[0]!.miles.toFixed(1)} mi
              </span>
            ) : result.ownership ? (
              <span
                className={`hp-locsum__fact${
                  result.ownership.code === 'PVT' ? ' hp-locsum__fact--warn' : ''
                }`}
              >
                <Icon name="boundary" size={13} />
                {result.ownership.label}
              </span>
            ) : null}
            <span className="hp-locsum__fact">
              <Icon name="deer" size={13} />
              {huntCount === 0 ? 'No hunts here' : `${huntCount} hunt${huntCount === 1 ? '' : 's'}`}
              {result.hiddenByFilters > 0 ? ` (+${result.hiddenByFilters} filtered)` : ''}
            </span>
          </div>

          {result.accessCaveat ? (
            <p className="hp-locsum__caveat">Access data is a guide, not a guarantee.</p>
          ) : null}

          {worstWarning ? (
            <p className="hp-locsum__warn">
              <Icon name="alert" size={13} />
              <span>{worstWarning}</span>
            </p>
          ) : null}

          {huntCount > 0 || result.ownership ? (
            <button
              type="button"
              className="hp-btn hp-btn--primary hp-locsum__more"
              onClick={() => openDetail(true)}
            >
              View details
              <Icon name="chevronRight" size={15} />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
