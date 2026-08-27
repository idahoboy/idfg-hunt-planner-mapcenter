import { useMemo } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ResultRecord } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { Icon } from '@/components/Icon';
import { downloadCsv } from '@/lib/csv';
import { zoomToBbox } from '@/lib/zoomTo';
import { StartPanel } from './StartPanel';

const GRADE_LABEL: Record<string, string> = {
  open: 'Open access',
  limited: 'Limited access',
  permission: 'Permission required',
  rule: 'Special rule',
};

function ResultCard({
  record,
  huntUrl,
  tagUrl,
}: {
  record: ResultRecord;
  huntUrl?: string;
  tagUrl?: string;
}): React.ReactElement {
  const selectedKey = useAppStore((s) => s.selectedResultKey);
  const setSelected = useAppStore((s) => s.setSelectedResultKey);
  const setHovered = useAppStore((s) => s.setHoveredResultKey);
  const { view } = useMap();

  const isSelected = selectedKey === record.key;

  return (
    <li>
      <div className={`hp-card${isSelected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="hp-card__main"
          onMouseEnter={() => setHovered(record.key)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(record.key)}
          onBlur={() => setHovered(null)}
          onClick={() => setSelected(isSelected ? null : record.key)}
          aria-pressed={isSelected}
        >
          <span className="hp-card__head">
            <span className="hp-card__title">{record.title}</span>
            <span className={`hp-grade hp-grade--${record.accessGrade}`}>
              {GRADE_LABEL[record.accessGrade] ?? record.accessGrade}
            </span>
          </span>

          <dl className="hp-card__facts">
            <div>
              <dt>Dates</dt>
              <dd>
                {record.open} – {record.close}
              </dd>
            </div>
            <div>
              <dt>Weapon</dt>
              <dd>{record.method}</dd>
            </div>
            {record.ornament ? (
              <div>
                <dt>Sex / antler</dt>
                <dd>{record.ornament}</dd>
              </div>
            ) : null}
            <div>
              <dt>Tags</dt>
              <dd>{record.unlimited ? 'Unlimited' : (record.permits?.toLocaleString() ?? '—')}</dd>
            </div>
          </dl>

          <span className="hp-card__area">{record.area}</span>

          {/* The drawn boundary is wider than where this hunt is legal. */}
          {record.areaQualified ? (
            <span className="hp-card__warn">
              <Icon name="alert" size={12} />
              Covers only part of the area shown — the hunt text governs.
            </span>
          ) : null}
        </button>

        <div className="hp-card__links">
          {record.bbox && view ? (
            <button
              type="button"
              className="hp-card__link"
              onClick={() => void zoomToBbox(view, record.bbox!)}
            >
              <Icon name="crosshair" size={13} />
              Zoom to
            </button>
          ) : null}
          {huntUrl ? (
            <a
              className="hp-card__link"
              href={huntUrl.replace('{id}', String(record.huntId))}
              target="_blank"
              rel="noopener noreferrer"
            >
              This hunt
            </a>
          ) : null}
          {tagUrl ? (
            <a
              className="hp-card__link"
              href={tagUrl.replace('{tagId}', String(record.tagId))}
              target="_blank"
              rel="noopener noreferrer"
            >
              This tag
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ResultsRail(): React.ReactElement | null {
  const config = useConfig();
  const results = useAppStore((s) => s.results);
  const resultCount = useAppStore((s) => s.resultCount);
  const loading = useAppStore((s) => s.resultsLoading);
  const error = useAppStore((s) => s.resultsError);
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const browseAll = useAppStore((s) => s.browseAll);
  const setBrowseAll = useAppStore((s) => s.setBrowseAll);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const clearAllFilters = useAppStore((s) => s.clearAllFilters);
  const loadMore = useAppStore((s) => s.loadMore);

  const hasCriteria =
    Object.values(filters).some((v) => v.length > 0) || keyword.trim().length > 0;

  // Grouped by species: the axis people think in, and the one that makes a
  // long list scannable.
  const grouped = useMemo(() => {
    const map = new Map<string, ResultRecord[]>();
    for (const r of results) {
      const list = map.get(r.species);
      if (list) list.push(r);
      else map.set(r.species, [r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [results]);

  if (!config.huntFinder.enabled) return null;

  const huntUrl = config.clickQuery.huntDetailUrl;
  const tagUrl = config.clickQuery.tagDetailUrl;

  return (
    <aside className="hp-results" aria-label="Hunt results">
      <header className="hp-results__header">
        <h2 className="hp-results__heading">
          {loading ? 'Loading…' : `${resultCount.toLocaleString()} hunts`}
        </h2>
        {results.length > 0 ? (
          <button
            type="button"
            className="hp-btn hp-btn--ghost hp-btn--sm"
            onClick={() => downloadCsv(results, 'idfg-hunts.csv')}
          >
            <Icon name="table" size={14} />
            CSV
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="hp-alert hp-alert--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {!hasCriteria && !browseAll && !error ? (
        <StartPanel
          total={resultCount}
          loading={loading}
          config={config}
          onPick={(facetId, value) => toggleFilterValue(facetId, value)}
          onBrowseAll={() => setBrowseAll(true)}
        />
      ) : null}

      {(hasCriteria || browseAll) && !loading && !error && results.length === 0 ? (
        <div className="hp-results__empty">
          <p>{config.huntFinder.results.emptyMessage}</p>
          <button type="button" className="hp-btn hp-btn--ghost hp-btn--sm" onClick={clearAllFilters}>
            Clear all filters
          </button>
        </div>
      ) : null}

      <div className="hp-results__scroll">
        {results.length > 0 && config.huntFinder.results.caveat ? (
          <p className="hp-results__caveat">
            <Icon name="alert" size={13} />
            <span>{config.huntFinder.results.caveat}</span>
          </p>
        ) : null}

        {grouped.map(([species, records]) => (
          <section key={species} className="hp-results__group">
            <h3 className="hp-results__group-title">
              {species} <span className="hp-results__group-count">{records.length}</span>
            </h3>
            <ul className="hp-results__list">
              {records.map((r) => (
                <ResultCard
                  key={r.key}
                  record={r}
                  {...(huntUrl ? { huntUrl } : {})}
                  {...(tagUrl ? { tagUrl } : {})}
                />
              ))}
            </ul>
          </section>
        ))}

        {results.length > 0 && resultCount > results.length ? (
          <div className="hp-results__more">
            <button type="button" className="hp-btn hp-btn--ghost" onClick={loadMore}>
              Load {Math.min(50, resultCount - results.length).toLocaleString()} more
            </button>
            <span className="hp-results__more-note">
              {results.length.toLocaleString()} of {resultCount.toLocaleString()} shown
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
