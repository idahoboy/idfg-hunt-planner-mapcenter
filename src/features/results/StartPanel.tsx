import type { AppConfig } from '@/config/schema';
import { Icon } from '@/components/Icon';

/**
 * What the results rail shows before anything is applied.
 *
 * Statewide the finder matches thousands of areas, and handing someone the
 * first fifty of those is not information — it is a list that looks complete
 * and is not. Rather than showing nothing at all, this states the total, offers
 * the narrowing anyone actually wants first, and leaves browsing available for
 * people who really do want to scroll.
 */
export function StartPanel({
  total,
  loading,
  config,
  onPick,
  onBrowseAll,
}: {
  total: number;
  loading: boolean;
  config: AppConfig;
  onPick: (facetId: string, value: string) => void;
  onBrowseAll: () => void;
}): React.ReactElement {
  const huntType = config.huntFinder.facets.find((f) => f.id === 'huntType');

  return (
    <div className="hp-start">
      <Icon name="filter" size={26} className="hp-start__icon" />
      <h3 className="hp-start__title">
        {loading ? 'Counting…' : `${total.toLocaleString()} hunt areas statewide`}
      </h3>
      <p className="hp-start__lede">
        Pick what you are looking for, or search by name. You can also narrow to
        the part of the map you are viewing.
      </p>

      {huntType?.options?.length ? (
        <div className="hp-start__grid">
          {huntType.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="hp-start__chip"
              onClick={() => onPick('huntType', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <button type="button" className="hp-link hp-start__browse" onClick={onBrowseAll}>
        Browse all {total.toLocaleString()} anyway
      </button>
    </div>
  );
}
