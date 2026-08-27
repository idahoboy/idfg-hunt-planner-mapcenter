import { useState } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';
import { FacetControl } from './FacetControl';
import { useMediaQuery } from '@/lib/useMediaQuery';

/**
 * VRBO-style top filter bar: primary facets always visible, everything else
 * behind "More filters", an active-filter chip row underneath, and a live
 * result count on the right.
 */
export function FilterBar(): React.ReactElement | null {
  const config = useConfig();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobile = useMediaQuery(
    `(max-width: ${config.ui.layout['mobileBreakpoint'] ?? 768}px)`,
  );
  const setFilterSheetOpen = useAppStore((s) => s.setFilterSheetOpen);

  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const clearAllFilters = useAppStore((s) => s.clearAllFilters);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const setKeyword = useAppStore((s) => s.setKeyword);
  const resultCount = useAppStore((s) => s.resultCount);
  const resultsLoading = useAppStore((s) => s.resultsLoading);
  const syncToExtent = useAppStore((s) => s.syncToExtent);
  const setSyncToExtent = useAppStore((s) => s.setSyncToExtent);

  if (!config.huntFinder.enabled) return null;

  const facets = config.huntFinder.facets;
  const primary = facets.filter((f) => f.primary);
  const secondary = facets.filter((f) => !f.primary);

  const activeChips = [
    ...Object.entries(filters).flatMap(([facetId, values]) =>
      values.map((value) => {
        const facet = facets.find((f) => f.id === facetId);
        // A coded value (month 10, accessGrade "rule") must show its label,
        // not its code.
        const label =
          facet?.labels?.[value] ??
          facet?.options?.find((o) => o.value === value)?.label ??
          value;
        return { facetId, value, facetLabel: facet?.label ?? facetId, label };
      }),
    ),
    ...(keyword ? [{ facetId: '__keyword', value: keyword, facetLabel: 'Search', label: keyword }] : []),
  ];

  const activeCount =
    Object.values(filters).reduce((n, v) => n + v.length, 0) + (keyword ? 1 : 0);

  /*
   * Mobile: a single horizontally scrolling row, never more than one line tall.
   * The leading button opens the full-screen sheet holding every facet; the
   * primary facets stay inline as pills so the common narrowing (species, unit,
   * region) is one tap rather than two. The result count is not here — it lives
   * on the Map/List pill and in the results header, where there is room for it.
   */
  if (isMobile) {
    return (
      <div className="hp-filterbar hp-filterbar--mobile">
        <div className="hp-filterbar__scroller">
          <button
            type="button"
            className={`hp-filterbtn${activeCount ? ' is-filled' : ''}`}
            onClick={() => setFilterSheetOpen(true)}
            aria-label={
              activeCount ? `Filters, ${activeCount} active` : 'Filters'
            }
          >
            <Icon name="sliders" size={17} />
            {activeCount > 0 ? (
              <span className="hp-filterbtn__count">{activeCount}</span>
            ) : null}
            <Icon name="chevronDown" size={13} />
          </button>

          {primary.map((facet) => (
            <FacetControl key={facet.id} facet={facet} config={config} />
          ))}

          {activeCount > 0 ? (
            <button type="button" className="hp-clearall hp-clearall--pill" onClick={clearAllFilters}>
              <Icon name="close" size={13} />
              Clear all
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="hp-filterbar">
      <div className="hp-filterbar__row">
        {primary.map((facet) => (
          <FacetControl key={facet.id} facet={facet} config={config} />
        ))}

        {secondary.length > 0 ? (
          <button
            type="button"
            className={`hp-filterbar__more${moreOpen ? ' is-open' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <Icon name="filter" size={16} />
            More filters
            <Icon name={moreOpen ? 'chevronDown' : 'chevronRight'} size={14} />
          </button>
        ) : null}

        {activeCount > 0 ? (
          <button type="button" className="hp-clearall" onClick={clearAllFilters}>
            <Icon name="close" size={14} />
            Clear all
            <span className="hp-clearall__count">{activeCount}</span>
          </button>
        ) : null}

        <div className="hp-filterbar__spacer" />

        <label className="hp-switch" title="Re-run the search whenever the map moves">
          <input
            type="checkbox"
            checked={syncToExtent}
            onChange={(e) => setSyncToExtent(e.target.checked)}
          />
          <span className="hp-switch__track" aria-hidden="true"><span className="hp-switch__thumb" /></span>
          <span className="hp-switch__label">Search as I move the map</span>
        </label>

        <output className="hp-filterbar__count" aria-live="polite">
          {resultsLoading ? 'Searching…' : `${resultCount.toLocaleString()} areas`}
        </output>
      </div>

      {moreOpen && secondary.length > 0 ? (
        <div className="hp-filterbar__row hp-filterbar__row--secondary">
          {secondary.map((facet) => (
            <FacetControl key={facet.id} facet={facet} config={config} />
          ))}
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="hp-filterbar__chips" role="list" aria-label="Active filters">
          {activeChips.map((chip) => (
            <button
              key={`${chip.facetId}:${chip.value}`}
              type="button"
              role="listitem"
              className="hp-chip hp-chip--removable"
              onClick={() => {
                if (chip.facetId === '__keyword') setKeyword('');
                else toggleFilterValue(chip.facetId, chip.value);
              }}
            >
              <span className="hp-chip__facet">{chip.facetLabel}:</span>
              {chip.label}
              <Icon name="close" size={12} />
            </button>
          ))}
          <button type="button" className="hp-link hp-link--clear-all" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
