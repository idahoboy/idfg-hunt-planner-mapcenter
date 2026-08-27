import { useEffect, useMemo, useState } from 'react';
import Graphic from '@arcgis/core/Graphic';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { zoomToGeometry } from '@/lib/zoomTo';
import { queryFeatures, sqlIdIn } from '@/lib/arcgisQuery';
import { buildSymbol } from '@/map/symbols';
import { Icon } from '@/components/Icon';

/**
 * The legacy "Highlight a Hunt Area" tool, rebuilt. Same four pick lists, same
 * purple highlight, same KML download — but the option lists come from the
 * live service (the legacy Turkey list was hard-coded and drifted years out of
 * date) and the queries are parameterised instead of string-concatenated.
 */
export function HighlightPanel(): React.ReactElement {
  const config = useConfig();
  const { highlightLayer, view, ready } = useMap();
  const setKmlLinks = useAppStore((s) => s.setKmlLinks);
  const kmlLinks = useAppStore((s) => s.kmlLinks);
  const showToast = useAppStore((s) => s.showToast);

  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);

  // One picker per hunt-area source that can produce a highlight.
  const pickers = useMemo(
    () =>
      config.huntFinder.sources
        .filter((s) => Boolean(s.kmlTemplate))
        .map((source) => ({ source })),
    [config],
  );

  async function runHighlight(): Promise<void> {
    if (!view) return;
    setBusy(true);
    highlightLayer.removeAll();
    const nextLabels: string[] = [];
    const nextKml: Array<{ label: string; url: string }> = [];

    try {
      const geometries: __esri.GeometryUnion[] = [];

      for (const { source } of pickers) {
        const ids = selection[source.id] ?? [];
        if (!ids.length) continue;

        const featureSet = await queryFeatures({
          url: source.url,
          where: sqlIdIn(source.idField, ids),
          outFields: source.outFields,
          returnGeometry: true,
        });

        for (const feature of featureSet.features) {
          if (!feature.geometry) continue;
          geometries.push(feature.geometry);
          highlightLayer.add(
            new Graphic({
              geometry: feature.geometry,
              attributes: feature.attributes,
              symbol: buildSymbol({
                type: feature.geometry.type === 'polyline' ? 'line' : 'fill',
                color: config.highlight.symbol.fill,
                width: config.highlight.symbol.width,
                outline: {
                  color: config.highlight.symbol.outline,
                  width: config.highlight.symbol.width,
                },
              }),
            }),
          );
        }

        nextLabels.push(`${source.title}: ${ids.length} selected`);
        if (source.kmlTemplate) {
          nextKml.push({
            label: `${source.title} (KML)`,
            url: source.kmlTemplate.replace('{ids}', ids.map(encodeURIComponent).join(',')),
          });
        }
      }

      setLabels(nextLabels);
      setKmlLinks(nextKml);

      if (geometries.length === 0) {
        showToast('Nothing selected to highlight.', 'info');
      } else if (geometries.length === 1 && geometries[0]) {
        // One feature follows the shared rule: extent for a shape, a legible
        // fixed zoom for a point.
        await zoomToGeometry(view, geometries[0], { duration: 600 });
      } else {
        await view.goTo(
          { target: geometries, padding: { top: 40, bottom: 40, left: 40, right: 40 } },
          { duration: 600 },
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Highlight failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  function clearHighlight(): void {
    highlightLayer.removeAll();
    setSelection({});
    setLabels([]);
    setKmlLinks([]);
  }

  // Legacy deep link: ?val=1234&lyr=5&lbl=Some+Area
  useEffect(() => {
    if (!ready || !view) return;
    const params = new URLSearchParams(window.location.search);
    const val = params.get('val');
    const lyr = params.get('lyr') ?? '0';
    if (!val) return;

    const target = config.highlight.queryLayers[lyr];
    if (!target) return;

    void (async () => {
      const ids = val.split(',').map((v) => v.trim()).filter(Boolean);
      const featureSet = await queryFeatures({
        url: target.url,
        where: sqlIdIn(target.idField, ids),
        outFields: ['*'],
        returnGeometry: true,
      });
      const geometries: __esri.GeometryUnion[] = [];
      for (const feature of featureSet.features) {
        if (!feature.geometry) continue;
        geometries.push(feature.geometry);
        highlightLayer.add(
          new Graphic({
            geometry: feature.geometry,
            attributes: feature.attributes,
            symbol: buildSymbol({
              type: 'fill',
              color: config.highlight.symbol.fill,
              outline: {
                color: config.highlight.symbol.outline,
                width: config.highlight.symbol.width,
              },
            }),
          }),
        );
      }
      const label = decodeURIComponent((params.get('lbl') ?? target.label).replace(/\+/g, ' '));
      setLabels([label]);
      if (geometries.length) {
        await view.goTo({ target: geometries, padding: { top: 40, bottom: 40, left: 40, right: 40 } });
      }
    })();
  }, [ready, view, config, highlightLayer]);

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Pick one or more hunt areas to outline on the map, then download them as a
        KML for Google Earth or a handheld GPS.
      </p>

      {pickers.map(({ source }) => (
        <HighlightPicker
          key={source.id}
          sourceId={source.id}
          title={source.title}
          selected={selection[source.id] ?? []}
          onChange={(ids) => setSelection((prev) => ({ ...prev, [source.id]: ids }))}
        />
      ))}

      <div className="hp-panel__actions">
        <button type="button" className="hp-btn hp-btn--primary" onClick={() => void runHighlight()} disabled={busy}>
          {busy ? 'Highlighting…' : 'Highlight areas'}
        </button>
        <button type="button" className="hp-btn hp-btn--ghost" onClick={clearHighlight}>
          Clear
        </button>
      </div>

      {labels.length > 0 ? (
        <ul className="hp-highlight__labels">
          {labels.map((label) => (
            <li key={label}>
              <span className="hp-swatch" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      {kmlLinks.length > 0 ? (
        <div className="hp-highlight__kml">
          <h4>Download</h4>
          <ul>
            {kmlLinks.map((link) => (
              <li key={link.url}>
                <a href={link.url} className="hp-btn hp-btn--ghost hp-btn--sm">
                  <Icon name="download" size={14} />
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function HighlightPicker({
  sourceId, title, selected, onChange,
}: {
  sourceId: string;
  title: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}): React.ReactElement {
  const config = useConfig();
  const source = config.huntFinder.sources.find((s) => s.id === sourceId)!;

  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const featureSet = await queryFeatures({
          url: source.url,
          where: source.baseWhere ?? '1=1',
          outFields: source.outFields,
          ...(source.orderBy ? { orderByFields: source.orderBy } : {}),
          returnGeometry: false,
          num: 2000,
        });
        if (cancelled) return;
        const seen = new Set<string>();
        const next: Array<{ value: string; label: string }> = [];
        for (const feature of featureSet.features) {
          const attrs = (feature.attributes ?? {}) as Record<string, unknown>;
          const value = String(attrs[source.idField] ?? '');
          if (!value || seen.has(value)) continue;
          seen.add(value);
          const label = source.titleTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, k: string) =>
            String(attrs[k] ?? ''),
          ).replace(/\s+/g, ' ').trim();
          next.push({ value, label: label || value });
        }
        setOptions(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const selectId = `highlight-${sourceId}`;

  return (
    <div className="hp-field">
      <label className="hp-field__label" htmlFor={selectId}>
        {title} {loading ? <span className="hp-field__hint">loading…</span> : null}
      </label>
      <select
        id={selectId}
        className="hp-select"
        multiple
        size={Math.min(8, Math.max(3, options.length))}
        value={selected}
        onChange={(e) =>
          onChange([...e.target.selectedOptions].map((o) => o.value))
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {selected.length ? (
        <button type="button" className="hp-link" onClick={() => onChange([])}>
          Clear {title}
        </button>
      ) : null}
    </div>
  );
}
