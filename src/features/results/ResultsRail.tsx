import { useMemo } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ResultRecord } from '@/state/store';
import { Icon } from '@/components/Icon';
import { downloadCsv } from '@/lib/csv';

function ResultCard({ record }: { record: ResultRecord }): React.ReactElement {
  const hoveredKey = useAppStore((s) => s.hoveredResultKey);
  const selectedKey = useAppStore((s) => s.selectedResultKey);
  const setHovered = useAppStore((s) => s.setHoveredResultKey);
  const setSelected = useAppStore((s) => s.setSelectedResultKey);

  const isHovered = hoveredKey === record.key;
  const isSelected = selectedKey === record.key;

  return (
    <li>
      <button
        type="button"
        className={`hp-card${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
        onMouseEnter={() => setHovered(record.key)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(record.key)}
        onBlur={() => setHovered(null)}
        onClick={() => setSelected(isSelected ? null : record.key)}
        aria-pressed={isSelected}
      >
        <span className="hp-card__body">
          <span className="hp-card__title">{record.title}</span>
          <span className="hp-card__subtitle">{record.subtitle}</span>
        </span>
        <span className="hp-card__source">{record.sourceTitle}</span>
      </button>
    </li>
  );
}

export function ResultsRail(): React.ReactElement | null {
  const config = useConfig();
  const results = useAppStore((s) => s.results);
  const resultCount = useAppStore((s) => s.resultCount);
  const loading = useAppStore((s) => s.resultsLoading);
  const error = useAppStore((s) => s.resultsError);
  const clearAllFilters = useAppStore((s) => s.clearAllFilters);

  const grouped = useMemo(() => {
    const map = new Map<string, ResultRecord[]>();
    for (const record of results) {
      map.set(record.sourceId, [...(map.get(record.sourceId) ?? []), record]);
    }
    return [...map.entries()];
  }, [results]);

  if (!config.huntFinder.enabled) return null;

  return (
    <aside className="hp-results" aria-label="Hunt area results">
      <header className="hp-results__header">
        <h2 className="hp-results__heading">
          {loading ? 'Searching…' : `${resultCount.toLocaleString()} hunt areas`}
        </h2>
        {results.length > 0 ? (
          <button
            type="button"
            className="hp-btn hp-btn--ghost hp-btn--sm"
            onClick={() => downloadCsv(results, 'idfg-hunt-areas.csv')}
          >
            <Icon name="table" size={14} />
            CSV
          </button>
        ) : null}
      </header>

      {resultCount > results.length ? (
        <p className="hp-results__note">
          Showing the first {results.length.toLocaleString()}. Add a filter or zoom in to narrow the list.
        </p>
      ) : null}

      {error ? (
        <div className="hp-alert hp-alert--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && !error && results.length === 0 ? (
        <div className="hp-results__empty">
          <p>{config.huntFinder.results.emptyMessage}</p>
          <button type="button" className="hp-btn hp-btn--ghost hp-btn--sm" onClick={clearAllFilters}>
            Clear all filters
          </button>
        </div>
      ) : null}

      <div className="hp-results__scroll">
        {grouped.map(([sourceId, records]) => {
          const source = config.huntFinder.sources.find((s) => s.id === sourceId);
          return (
            <section key={sourceId} className="hp-results__group">
              <h3 className="hp-results__group-title">{source?.title ?? sourceId}</h3>
              {source?.caveat ? (
                <p className="hp-results__caveat">
                  <Icon name="alert" size={13} />
                  <span>{source.caveat}</span>
                </p>
              ) : null}
              <ul className="hp-results__list">
                {records.map((record) => (
                  <ResultCard key={record.key} record={record} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
