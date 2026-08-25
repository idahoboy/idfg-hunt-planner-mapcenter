import { useId, useMemo, useState } from 'react';
import type { AppConfig, FacetConfig } from '@/config/schema';
import { useAppStore, EMPTY_VALUES } from '@/state/store';
import { useFacetValues } from './useFacetValues';
import { Icon } from '@/components/Icon';
import { Popover } from '@/components/Popover';

interface FacetControlProps {
  facet: FacetConfig;
  config: AppConfig;
}

export function FacetControl({ facet, config }: FacetControlProps): React.ReactElement {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const selected = useAppStore((s) => s.filters[facet.id] ?? EMPTY_VALUES);
  const setFilter = useAppStore((s) => s.setFilter);
  const toggleFilterValue = useAppStore((s) => s.toggleFilterValue);
  const clearFilter = useAppStore((s) => s.clearFilter);
  const keyword = useAppStore((s) => s.keyword);
  const setKeyword = useAppStore((s) => s.setKeyword);

  const { options, loading, error } = useFacetValues(facet, config);

  const visibleOptions = useMemo(() => {
    if (!filterText.trim()) return options;
    const needle = filterText.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, filterText]);

  // ---- free-text search facet ----
  if (facet.type === 'search') {
    return (
      <div className="hp-facet hp-facet--search">
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
      <div className="hp-facet hp-facet--toggles" role="group" aria-label={facet.label}>
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

        {loading ? <p className="hp-popover__status">Loading options…</p> : null}
        {error ? <p className="hp-popover__status hp-popover__status--error">{error}</p> : null}
        {!loading && !error && visibleOptions.length === 0 ? (
          <p className="hp-popover__status">No options.</p>
        ) : null}

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
      </Popover>
    </div>
  );
}
