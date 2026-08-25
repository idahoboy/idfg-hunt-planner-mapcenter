import { useState } from 'react';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { Icon } from '@/components/Icon';
import { LayerLegend } from './LayerLegend';

export function LayersPanel(): React.ReactElement {
  const config = useConfig();
  const { layers } = useMap();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(config.groups.map((g) => [g.id, g.defaultOpen])),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const visibility = useAppStore((s) => s.layerVisibility);
  const setLayerVisible = useAppStore((s) => s.setLayerVisible);
  const opacityMap = useAppStore((s) => s.layerOpacity);
  const setLayerOpacity = useAppStore((s) => s.setLayerOpacity);
  const gated = useAppStore((s) => s.gatedLayers);
  const health = useAppStore((s) => s.health);

  function toggleLayer(layerId: string, next: boolean): void {
    setLayerVisible(layerId, next);
    const built = layers.get(layerId);
    if (built) built.layer.visible = next;
    // Opening a layer reveals its legend, matching the legacy auto-expand.
    if (next) setExpanded((prev) => ({ ...prev, [layerId]: true }));
  }

  function changeOpacity(layerId: string, value: number): void {
    setLayerOpacity(layerId, value);
    const built = layers.get(layerId);
    if (built) built.layer.opacity = value;
  }

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Turn layers on and off. Layers marked <em>zoom in to activate</em> only draw
        at larger scales because the source services return too much data statewide.
      </p>

      {config.groups.map((group) => {
        const groupLayers = config.layers.filter((l) => l.group === group.id);
        if (groupLayers.length === 0) return null;
        const activeCount = groupLayers.filter((l) => visibility[l.id]).length;
        const isOpen = openGroups[group.id] ?? false;

        return (
          <section key={group.id} className="hp-layergroup">
            <h3 className="hp-layergroup__heading">
              <button
                type="button"
                className="hp-layergroup__toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenGroups((p) => ({ ...p, [group.id]: !isOpen }))}
              >
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} />
                {group.icon ? <Icon name={group.icon} size={16} /> : null}
                <span className="hp-layergroup__title">{group.title}</span>
                {activeCount > 0 ? <span className="hp-badge">{activeCount}</span> : null}
              </button>
            </h3>

            {isOpen ? (
              <ul className="hp-layerlist">
                {groupLayers.map((layer) => {
                  const isGated = gated[layer.id] ?? false;
                  const isVisible = visibility[layer.id] ?? false;
                  const entry = health.find((h) => h.layerId === layer.id);
                  const failed = entry?.status === 'failed';
                  const isExpanded = expanded[layer.id] ?? false;

                  return (
                    <li key={layer.id} className={`hp-layerrow${failed ? ' is-failed' : ''}`}>
                      <div className="hp-layerrow__main">
                        <label className={`hp-checkbox${isGated ? ' is-disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isVisible}
                            disabled={isGated || failed}
                            onChange={(e) => toggleLayer(layer.id, e.target.checked)}
                          />
                          <span className="hp-checkbox__box" aria-hidden="true">
                            {isVisible ? <Icon name="check" size={12} /> : null}
                          </span>
                          <span className="hp-checkbox__label">
                            {layer.title}
                            {isGated && layer.scaleGate ? (
                              <em className="hp-layerrow__gate"> ({layer.scaleGate.message})</em>
                            ) : null}
                          </span>
                        </label>

                        <button
                          type="button"
                          className="hp-layerrow__expand"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${layer.title}`}
                          onClick={() => setExpanded((p) => ({ ...p, [layer.id]: !isExpanded }))}
                        >
                          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={14} />
                        </button>
                      </div>

                      {failed ? (
                        <p className="hp-layerrow__error">
                          <Icon name="alert" size={13} /> This service is not responding right now.
                        </p>
                      ) : null}

                      {isExpanded ? (
                        <div className="hp-layerrow__detail">
                          <label className="hp-slider">
                            <span className="hp-slider__label">Transparency</span>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={opacityMap[layer.id] ?? layer.opacity}
                              onChange={(e) => changeOpacity(layer.id, Number(e.target.value))}
                              aria-label={`${layer.title} opacity`}
                            />
                          </label>

                          <LayerLegend layerId={layer.id} />

                          {layer.disclaimer ? (
                            <p className="hp-disclaimer">
                              {layer.disclaimer.text}
                              {layer.disclaimer.url ? (
                                <>
                                  {' '}
                                  <a href={layer.disclaimer.url} target="_blank" rel="noopener noreferrer">
                                    Learn more
                                  </a>
                                </>
                              ) : null}
                            </p>
                          ) : null}

                          {layer.health === 'replaced' ? (
                            <p className="hp-note">
                              <Icon name="info" size={13} /> Source updated — the original service was retired.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
