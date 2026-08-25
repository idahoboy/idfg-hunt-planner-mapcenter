import { useEffect } from 'react';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { syncUrl } from '@/state/urlState';

/** Keeps the address bar in step with the map so a copied URL always reopens
 *  what the user is looking at, and Back is never hijacked. */
export function useUrlSync(): void {
  const config = useConfig();
  const { view, ready } = useMap();
  const layerVisibility = useAppStore((s) => s.layerVisibility);
  const basemapId = useAppStore((s) => s.basemapId);
  const filters = useAppStore((s) => s.filters);
  const keyword = useAppStore((s) => s.keyword);

  useEffect(() => {
    if (!ready || !view) return;

    function write(): void {
      if (!view) return;
      syncUrl({
        config,
        layerVisibility,
        basemapId,
        center: [view.center?.longitude ?? 0, view.center?.latitude ?? 0],
        zoom: view.zoom ?? config.map.zoom,
        filters,
        keyword,
      });
    }

    write();
    const handle = reactiveUtils.when(() => view.stationary, write);
    return () => handle.remove();
  }, [ready, view, config, layerVisibility, basemapId, filters, keyword]);
}
