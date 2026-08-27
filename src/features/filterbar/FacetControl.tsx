import { useId, useMemo, useState } from 'react';
import type { AppConfig, FacetConfig } from '@/config/schema';
import { useAppStore, EMPTY_VALUES } from '@/state/store';

const EMPTY_OPTIONS: Array<{ value: string; label: string; count: number }> = [];
import { Icon } from '@/components/Icon';
import { Popover } from '@/components/Popover';

interface FacetControlProps {
  facet: FacetConfig;
  /** Kept for call-site symmetry; options now come from the store. */
  config?: AppConfig;
  /**
   * `pill` is the filter-bar form: a compact trigger that opens a popover.
   * `block` is the sheet form: a labelled, full-width control with its options
   * expanded inline, because a popover inside a full-screen sheet on a phone is
   * a dropdown inside a dropdown.
   */
  variant?: 'pill' | 'block';
}

export function FacetControl({
  facet,
  variant = 'pill',
}: FacetControlProps): React.ReactElement {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const selected = useAppStore((s) => s.filters[facet.id] ?? EMPTY_VALUES);
  const setFilter = useAppStore((s) => s.setFilter);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const clearFilter = useAppStore((s) => s.clearFilter);
  const keyword = useAppStore((s) => s.keyword);
  const setKeyword = useAppStore((s) => s.setKeyword);

  // Options come from the same in-memory query that produces the results, so
  // each carries the count it would yield — and costs nothing to compute.
  const options = useAppStore((s) => s.facetOptions[facet.id]) ?? EMPTY_OPTIONS;
  const loading = false;
  const error: string | null = null;

  const visibleOptions = useMemo(() => {
    if (!filterText.trim()) return options;
    const needle = filterText.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, filterText]);

  // ---- free-text search facet ----
  if (facet.type === 'search') {
    return (
      <div className={`hp-facet hp-facet--search${variant === 'block' ? ' hp-facet--block' : ''}`}>
        <Icon name={facet.icon ?? 'search'} size={16} className="hp-facet__leading-icon" />
        <label className="hp-visually-hidden" htmlFor={triggerId}>{facet.label}</label>
        <input
          id={triggerId}
          type="search"
          className="hp-facet__input"
          placeholder={facet.placeholder ?? facet.label}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          autoComplete="off"
        />
        {keyword ? (
          <button type="button" className="hp-facet__clear" onClick={() => setKeyword('')} aria-label="Clear search">
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>
    );
  }

  // ---- segmented toggle group ----
  if (facet.type === 'toggleGroup') {
    return (
      <div
        className={`hp-facet hp-facet--toggles${variant === 'block' ? ' hp-facet--block' : ''}`}
        role="group"
        aria-label={facet.label}
      >
        {variant === 'block' ? (
          <span className="hp-facet__blocklabel">{facet.label}</span>
        ) : null}
        {(facet.options ?? []).map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`hp-toggle${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => toggleFilterValue(facet.id, option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ---- select / multiselect ----
  const isMulti = facet.type === 'multiselect';
  const summary =
    selected.length === 0
      ? facet.placeholder ?? `Any ${facet.label.toLowerCase()}`
      : selected.length === 1
        ? selected[0]!
        : `${selected.length} selected`;

  const optionList = (
    <ul className="hp-option-list" role={isMulti ? 'group' : 'radiogroup'}>
      {visibleOptions.map((option) => {
        const active = selected.includes(option.value);
        return (
          <li key={option.value}>
            <button
              type="button"
              className={`hp-option${active ? ' is-active' : ''}`}
              role={isMulti ? 'checkbox' : 'radio'}
              aria-checked={active}
              onClick={() => {
                if (isMulti) toggleFilterValue(facet.id, option.value);
                else {
                  setFilter(facet.id, active ? [] : [option.value]);
                  setOpen(false);
                }
              }}
            >
              <span className="hp-option__box" aria-hidden="true">
                {active ? <Icon name="check" size={12} /> : null}
              </span>
              <span className="hp-option__label">{option.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const status = (
    <>
      {loading ? <p className="hp-popover__status">Loading options…</p> : null}
      {error ? <p className="hp-popover__status hp-popover__status--error">{error}</p> : null}
      {!loading && !error && visibleOptions.length === 0 ? (
        <p className="hp-popover__status">No options.</p>
      ) : null}
    </>
  );

  // A popover trigger inside a full-screen sheet is a dropdown inside a
  // dropdown, so the sheet expands its options inline instead.
  if (variant === 'block') {
    return (
      <div className="hp-facet hp-facet--select hp-facet--block">
        <div className="hp-facet__blockhead">
          <span className="hp-facet__blocklabel">
            {facet.icon ? <Icon name={facet.icon} size={15} /> : null}
            {facet.label}
          </span>
          {selected.length ? (
            <button type="button" className="hp-link" onClick={() => clearFilter(facet.id)}>
              Clear ({selected.length})
            </button>
          ) : null}
        </div>

        {options.length > 8 ? (
          <input
            type="search"
            className="hp-popover__filter"
            placeholder={`Filter ${facet.label.toLowerCase()}…`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-label={`Filter ${facet.label} options`}
          />
        ) : null}

        {status}
        <div className="hp-facet__blockoptions">{optionList}</div>
      </div>
    );
  }

  return (
    <div className="hp-facet hp-facet--select">
      <button
        id={triggerId}
        type="button"
        className={`hp-facet__trigger${selected.length ? ' is-filled' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {facet.icon ? <Icon name={facet.icon} size={16} /> : null}
        <span className="hp-facet__labels">
          <span className="hp-facet__label">{facet.label}</span>
          <span className="hp-facet__summary">{summary}</span>
        </span>
        <Icon name="chevronDown" size={14} className="hp-facet__caret" />
      </button>

      {selected.length > 0 ? (
        <button
          type="button"
          className="hp-facet__badge"
          onClick={() => clearFilter(facet.id)}
          aria-label={`Clear ${facet.label} filter`}
        >
          {selected.length}
          <Icon name="close" size={11} />
        </button>
      ) : null}

      <Popover open={open} onClose={() => setOpen(false)} labelledBy={triggerId}>
        <div className="hp-popover__header">
          <span className="hp-popover__title">{facet.label}</span>
          {selected.length ? (
            <button type="button" className="hp-link" onClick={() => clearFilter(facet.id)}>
              Clear
            </button>
          ) : null}
        </div>

        {options.length > 8 ? (
          <input
            type="search"
            className="hp-popover__filter"
            placeholder={`Filter ${facet.label.toLowerCase()}…`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            aria-label={`Filter ${facet.label} options`}
          />
        ) : null}

        {status}
        {optionList}
      </Popover>
    </div>
  );
}
