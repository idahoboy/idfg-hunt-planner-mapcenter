import { useEffect, useRef } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { Icon } from '@/components/Icon';
import { FacetControl } from './FacetControl';

/**
 * Full-screen filter sheet — the mobile counterpart to the desktop filter bar.
 *
 * On a phone the bar itself can only afford one scrolling row, so every facet,
 * the active-filter chips, and the extent toggle live here instead. The footer
 * doubles as the result count, which is why the sheet can be dismissed by
 * "showing" the results rather than needing a separate Apply step: filters are
 * applied live as they are changed.
 */
export function FilterSheet(): React.ReactElement | null {
  const config = useConfig();
  const open = useAppStore((s) => s.filterSheetOpen);
  const setOpen = useAppStore((s) => s.setFilterSheetOpen);
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);
  const setKeyword = useAppStore((s) => s.setKeyword);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const clearAllFilters = useAppStore((s) => s.clearAllFilters);
  const resultCount = useAppStore((s) => s.resultCount);
  const loading = useAppStore((s) => s.resultsLoading);
  const syncToExtent = useAppStore((s) => s.syncToExtent);
  const setSyncToExtent = useAppStore((s) => s.setSyncToExtent);
  const setMobileView = useAppStore((s) => s.setMobileView);

  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Stop the map behind the sheet from scrolling with the sheet.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, setOpen]);

  if (!open || !config.huntFinder.enabled) return null;

  const facets = config.huntFinder.facets;
  const activeCount =
    Object.values(filters).reduce((n, v) => n + v.length, 0) + (keyword ? 1 : 0);

  const chips = [
    ...Object.entries(filters).flatMap(([facetId, values]) =>
      values.map((value) => {
        const facet = facets.find((f) => f.id === facetId);
        return {
          facetId,
          value,
          facetLabel: facet?.label ?? facetId,
          label:
            facet?.labels?.[value] ??
            facet?.options?.find((o) => o.value === value)?.label ??
            value,
        };
      }),
    ),
    ...(keyword
      ? [{ facetId: '__keyword', value: keyword, facetLabel: 'Search', label: keyword }]
      : []),
  ];

  return (
    <div className="hp-sheet hp-sheet--filters" role="dialog" aria-modal="true" aria-label="Filters">
      <header className="hp-sheet__header">
        <h2 className="hp-sheet__title">Filters</h2>
        <button
          ref={closeRef}
          type="button"
          className="hp-iconbtn"
          onClick={() => setOpen(false)}
          aria-label="Close filters"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="hp-sheet__body">
        {chips.length > 0 ? (
          <section className="hp-sheet__section">
            <h3 className="hp-sheet__label">Active filters</h3>
            <div className="hp-filterbar__chips">
              {chips.map((chip) => (
                <button
                  key={`${chip.facetId}:${chip.value}`}
                  type="button"
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
            </div>
          </section>
        ) : null}

        {facets.map((facet) => (
          <section className="hp-sheet__section" key={facet.id}>
            <FacetControl facet={facet} config={config} variant="block" />
          </section>
        ))}

        <section className="hp-sheet__section">
          <label className="hp-switch hp-switch--block">
            <input
              type="checkbox"
              checked={syncToExtent}
              onChange={(e) => setSyncToExtent(e.target.checked)}
            />
            <span className="hp-switch__track" aria-hidden="true">
              <span className="hp-switch__thumb" />
            </span>
            <span className="hp-switch__label">Search as I move the map</span>
          </label>
        </section>
      </div>

      <footer className="hp-sheet__footer">
        <button
          type="button"
          className="hp-link hp-link--clear-all"
          onClick={clearAllFilters}
          disabled={activeCount === 0}
        >
          Clear all
        </button>
        <button
          type="button"
          className="hp-btn hp-btn--primary"
          onClick={() => {
            setOpen(false);
            setMobileView('list');
          }}
        >
          {loading ? 'Searching…' : `Show ${resultCount.toLocaleString()} areas`}
        </button>
      </footer>
    </div>
  );
}
