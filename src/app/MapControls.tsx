import { useEffect, useRef } from 'react';
import Locate from '@arcgis/core/widgets/Locate';
import ScaleBar from '@arcgis/core/widgets/ScaleBar';
import Zoom from '@arcgis/core/widgets/Zoom';
import Home from '@arcgis/core/widgets/Home';
import Compass from '@arcgis/core/widgets/Compass';
import Fullscreen from '@arcgis/core/widgets/Fullscreen';
import Expand from '@arcgis/core/widgets/Expand';
import BasemapToggle from '@arcgis/core/widgets/BasemapToggle';
import { useMap } from '@/map/MapProvider';
import { useConfig } from '@/config/ConfigContext';

/** Map-anchored Esri widgets, added through the view UI so they participate in
 *  the SDK's own responsive/keyboard behaviour. */
export function MapControls(): null {
  const config = useConfig();
  const { view, ready } = useMap();
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !view || added.current) return;
    added.current = true;

    const widgets: __esri.Widget[] = [];

    const zoom = new Zoom({ view });
    const home = new Home({ view });
    const locate = new Locate({
      view,
      scale: Number((config.tools['locate'] as { scale?: number })?.scale ?? 36112),
    });
    const compass = new Compass({ view });
    const fullscreen = new Fullscreen({ view });
    const scaleBar = new ScaleBar({ view, unit: 'dual', style: 'ruler' });

    const imageryBasemap = config.basemaps.items.find((b) => b.id.includes('imagery'));
    const toggle = imageryBasemap
      ? new BasemapToggle({ view, nextBasemap: imageryBasemap.id })
      : null;

    view.ui.add([zoom, home, locate, compass, fullscreen], 'top-left');
    view.ui.add(scaleBar, 'bottom-left');
    if (toggle) view.ui.add(new Expand({ view, content: toggle, expandIcon: 'basemap' }), 'top-right');

    widgets.push(zoom, home, locate, compass, fullscreen, scaleBar);
    if (toggle) widgets.push(toggle);

    return () => {
      widgets.forEach((w) => w.destroy());
      added.current = false;
    };
  }, [ready, view, config]);

  return null;
}
