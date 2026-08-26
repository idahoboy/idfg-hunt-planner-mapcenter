import { useMemo } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore, type ResultRecord } from '@/state/store';
import { Icon } from '@/components/Icon';
import { downloadCsv } from '@/lib/csv';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { ResultDetail } from './ResultDetail';
import { StartPanel } from './StartPanel';

function ResultCard({ record }: { record: ResultRecord }): React.ReactElement {
  const config = useConfig();
  const hoveredKey = useAppStore((s) => s.hoveredResultKey);
  const selectedKey = useAppStore((s) => s.selectedResultKey);
  const setHovered = useAppStore((s) => s.setHoveredResultKey);
  const setSelected = useAppStore((s) => s.setSelectedResultKey);
  const setMobileView = useAppStore((s) => s.setMobileView);
  const expandedKey = useAppStore((s) => s.expandedResultKey);
  const setExpanded = useAppStore((s) => s.setExpandedResultKey);
  const isMobile = useMediaQuery(
    `(max-width: ${config.ui.layout['mobileBreakpoint'] ?? 768}px)`,
  );

  const isHovered = hoveredKey === record.key;
  const isSelected = selectedKey === record.key;
  const isExpanded = isMobile && expandedKey === record.key;

  return (
    <li>
      <button
        type="button"
        className={`hp-card${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
        onMouseEnter={() => setHovered(record.key)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(record.key)}
        onBlur={() => setHovered(null)}
        onClick={() => {
          // Desktop shows list and map side by side, so a tap can just select
          // and fly there. On a phone the list covers the map, so a tap opens
          // the detail in place and the detail carries the map action —
          // otherwise the zoom happens somewhere the user cannot see.
          if (isMobile) {
            setExpanded(isExpanded ? null : record.key);
            return;
          }
          setSelected(isSelected ? null : record.key);
        }}
        aria-pressed={isMobile ? isExpanded : isSelected}
        aria-expanded={isMobile ? isExpanded : undefined}
      >
        <span className="hp-card__body">
          <span className="hp-card__title">{record.title}</span>
          <span className="hp-card__subtitle">{record.subtitle}</span>
        </span>
        <span className="hp-card__source">{record.sourceTitle}</span>
        {isMobile ? (
          <Icon
            name={isExpanded ? 'chevronDown' : 'chevronRight'}
            size={16}
            className="hp-card__caret"
          />
        ) : null}
      </button>

      {isExpanded ? (
        <div className="hp-card__detail">
          <ResultDetail
            record={record}
            source={config.huntFinder.sources.find((s) => s.id === record.sourceId)}
            config={config}
          />
          <button
            type="button"
            className="hp-btn hp-btn--primary hp-card__mapbtn"
            onClick={() => {
              setSelected(record.key);
              setMobileView('map');
            }}
          >
            <Icon name="map" size={16} />
            Show on map
          </button>
        </div>
      ) : null}
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
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const browseAll = useAppStore((s) => s.browseAll);
  const setBrowseAll = useAppStore((s) => s.setBrowseAll);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const loadMore = useAppStore((s) => s.loadMore);
  const resultLimit = useAppStore((s) => s.resultLimit);

  const hasCriteria =
    Object.values(filters).some((v) => v.length > 0) || keyword.trim().length > 0;

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

      {hasCriteria || browseAll ? (
        resultCount > results.length && results.length > 0 ? (
          <p className="hp-results__note">
            Showing {results.length.toLocaleString()} of {resultCount.toLocaleString()}.
          </p>
        ) : null
      ) : null}

      {error ? (
        <div className="hp-alert hp-alert--error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {!hasCriteria && !browseAll ? (
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

        {(hasCriteria || browseAll) && results.length > 0 && resultCount > results.length ? (
          <div className="hp-results__more">
            <button
              type="button"
              className="hp-btn hp-btn--ghost"
              onClick={loadMore}
              disabled={loading}
            >
              {loading
                ? 'Loading…'
                : `Load ${Math.min(50, resultCount - results.length).toLocaleString()} more`}
            </button>
            <span className="hp-results__more-note">
              {results.length.toLocaleString()} of {resultCount.toLocaleString()} shown
              {resultLimit >= 200 ? ' — narrowing the filters will be quicker than paging' : ''}
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
