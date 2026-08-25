import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { Icon } from '@/components/Icon';

/** Config thumbnails are written site-absolute; rebase them so they resolve
 *  under a sub-path deployment too. */
function asset(path: string): string {
  return path.startsWith('/') ? `${import.meta.env.BASE_URL}${path.slice(1)}` : path;
}

export function BasemapPanel(): React.ReactElement {
  const config = useConfig();
  const { map } = useMap();
  const basemapId = useAppStore((s) => s.basemapId);
  const setBasemapId = useAppStore((s) => s.setBasemapId);

  function select(id: string): void {
    if (!map) return;
    const registry = (map as unknown as { __basemaps?: Map<string, __esri.Basemap> }).__basemaps;
    const basemap = registry?.get(id);
    if (!basemap) return;
    map.basemap = basemap;
    setBasemapId(id);
  }

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Every basemap here is free to use and needs no API key, so the map keeps
        working regardless of Esri credit balance.
      </p>
      <ul className="hp-basemaps" role="radiogroup" aria-label="Basemap">
        {config.basemaps.items.map((item) => {
          const active = item.id === basemapId;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className={`hp-basemap${active ? ' is-active' : ''}`}
                onClick={() => select(item.id)}
              >
                {item.thumbnail ? (
                  <img src={asset(item.thumbnail)} alt="" className="hp-basemap__thumb" loading="lazy" />
                ) : (
                  <span className="hp-basemap__thumb hp-basemap__thumb--empty" aria-hidden="true">
                    <Icon name="globe" size={22} />
                  </span>
                )}
                <span className="hp-basemap__title">{item.title}</span>
                {active ? <Icon name="check" size={16} className="hp-basemap__check" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
