import { useEffect, useRef } from 'react';
import Legend from '@arcgis/core/widgets/Legend';
import { useMap } from '@/map/MapProvider';
import { useWidgetContainer } from '@/map/useWidgetContainer';

/** Per-layer legend, rendered by the Esri Legend widget so symbology always
 *  matches what the service publishes rather than a hand-drawn swatch. */
export function LayerLegend({ layerId }: { layerId: string }): React.ReactElement | null {
  const { view, layers, ready } = useMap();
  const [hostRef, makeContainer] = useWidgetContainer();
  const widgetRef = useRef<Legend | null>(null);

  useEffect(() => {
    if (!ready || !view || !hostRef.current) return;
    const built = layers.get(layerId);
    if (!built) return;

    const container = makeContainer();
    if (!container) return;

    const legend = new Legend({
      view,
      container,
      layerInfos: [{ layer: built.layer as __esri.Layer }],
    });
    widgetRef.current = legend;

    return () => {
      legend.destroy();
      widgetRef.current = null;
    };
  }, [view, layers, layerId, ready, makeContainer, hostRef]);

  return <div className="hp-legend" ref={hostRef} />;
}
