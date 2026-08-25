import { useEffect, useRef, useState } from 'react';
import DistanceMeasurement2D from '@arcgis/core/widgets/DistanceMeasurement2D';
import AreaMeasurement2D from '@arcgis/core/widgets/AreaMeasurement2D';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { Icon } from '@/components/Icon';
import { useWidgetContainer } from '@/map/useWidgetContainer';

type Mode = 'distance' | 'area' | null;

interface MeasureToolConfig {
  defaultLengthUnit?: string;
  defaultAreaUnit?: string;
  lengthUnits?: string[];
  areaUnits?: string[];
}

export function MeasurePanel(): React.ReactElement {
  const config = useConfig();
  const { view, ready } = useMap();
  const [mode, setMode] = useState<Mode>(null);
  const [hostRef, makeContainer] = useWidgetContainer();
  const widgetRef = useRef<DistanceMeasurement2D | AreaMeasurement2D | null>(null);

  const tool = (config.tools['measure'] ?? {}) as MeasureToolConfig;

  useEffect(() => {
    if (!ready || !view || !hostRef.current) return;

    widgetRef.current?.destroy();
    widgetRef.current = null;

    if (mode === null) {
      hostRef.current.replaceChildren();
      // Restore popups when no measurement is active — the legacy app left
      // them disabled whenever the panel was closed mid-measurement.
      view.popupEnabled = true;
      return;
    }

    const container = makeContainer();
    if (!container) return;

    view.popupEnabled = false;

    const widget =
      mode === 'distance'
        ? new DistanceMeasurement2D({
            view,
            container,
            unit: (tool.defaultLengthUnit ?? 'miles') as __esri.DistanceMeasurement2D['unit'],
          })
        : new AreaMeasurement2D({
            view,
            container,
            unit: (tool.defaultAreaUnit ?? 'acres') as __esri.AreaMeasurement2D['unit'],
          });

    widget.viewModel.start();
    widgetRef.current = widget;

    return () => {
      widget.destroy();
      widgetRef.current = null;
      if (view) view.popupEnabled = true;
    };
  }, [mode, view, ready, makeContainer, hostRef, tool.defaultLengthUnit, tool.defaultAreaUnit]);

  return (
    <div className="hp-panel">
      <p className="hp-panel__intro">
        Measure a distance or an area. Click to place each vertex, then double-click
        to finish. Map popups pause while a measurement is active.
      </p>

      <div className="hp-segmented" role="group" aria-label="Measurement type">
        <button
          type="button"
          className={`hp-segmented__btn${mode === 'distance' ? ' is-active' : ''}`}
          aria-pressed={mode === 'distance'}
          onClick={() => setMode(mode === 'distance' ? null : 'distance')}
        >
          <Icon name="ruler" size={15} /> Distance
        </button>
        <button
          type="button"
          className={`hp-segmented__btn${mode === 'area' ? ' is-active' : ''}`}
          aria-pressed={mode === 'area'}
          onClick={() => setMode(mode === 'area' ? null : 'area')}
        >
          <Icon name="boundary" size={15} /> Area
        </button>
      </div>

      <div ref={hostRef} className="hp-esri-widget" />

      {mode ? (
        <button type="button" className="hp-btn hp-btn--ghost" onClick={() => setMode(null)}>
          Stop measuring
        </button>
      ) : null}
    </div>
  );
}
