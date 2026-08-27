import { useEffect, useRef } from 'react';
import Graphic from '@arcgis/core/Graphic';
import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { useMap } from '@/map/MapProvider';
import { buildSymbol } from '@/map/symbols';
import { queryLocation } from './locationQuery';

/**
 * Turns a map click into a location answer.
 *
 * The SDK's own popup is switched off while this is enabled — two things
 * responding to the same click is worse than either alone, and the default
 * popup is the thing being replaced.
 */
export function useMapClick(): void {
  const config = useConfig();
  const { view, ready, searchLayer } = useMap();
  const filters = useAppStore((s) => s.filters);
  const layerVisibility = useAppStore((s) => s.layerVisibility);
  const setClickResult = useAppStore((s) => s.setClickResult);
  const setClickLoading = useAppStore((s) => s.setClickLoading);

  // Read live state inside the handler without re-binding the listener on
  // every filter keystroke.
  const latest = useRef({ filters, layerVisibility });
  latest.current = { filters, layerVisibility };

  const runId = useRef(0);

  useEffect(() => {
    if (!ready || !view || !config.clickQuery.enabled) return;

    view.popupEnabled = false;

    const marker = new Graphic({
      symbol: buildSymbol({
        type: 'marker',
        color: config.ui.theme['accent'] ?? '#E9B94B',
        size: 11,
        outline: { color: config.ui.theme['text'] ?? '#14202B', width: 2 },
      }),
    });

    const handle = view.on('click', (event) => {
      const point = event.mapPoint;
      if (!point) return;
      event.stopPropagation();

      const id = ++runId.current;
      setClickLoading(true);

      marker.geometry = point;
      searchLayer.remove(marker);
      searchLayer.add(marker);

      void (async () => {
        try {
          const visible = new Set(
            Object.entries(latest.current.layerVisibility)
              .filter(([, on]) => on)
              .map(([layerId]) => layerId),
          );
          const result = await queryLocation(
            view,
            point,
            config,
            latest.current.filters,
            visible,
          );
          if (id !== runId.current) return;   // a later click superseded this one
          setClickResult(result);
        } catch (err) {
          if (id !== runId.current) return;
          console.warn('[click] location query failed', err);
          setClickResult(null);
        } finally {
          if (id === runId.current) setClickLoading(false);
        }
      })();
    });

    // A shared link carries ?at=1 alongside the X/Y/zoom the map already
    // round-trips, so the recipient lands on the answer rather than on a bare
    // coordinate they have to click for themselves.
    const params = new URLSearchParams(window.location.search);
    if (params.get('at') === '1') {
      const center = view.center;
      if (center) {
        const id = ++runId.current;
        setClickLoading(true);
        marker.geometry = center;
        searchLayer.add(marker);
        void (async () => {
          try {
            const visible = new Set(
              Object.entries(latest.current.layerVisibility)
                .filter(([, on]) => on)
                .map(([layerId]) => layerId),
            );
            const result = await queryLocation(
              view,
              center,
              config,
              latest.current.filters,
              visible,
            );
            if (id !== runId.current) return;
            setClickResult(result);
            useAppStore.getState().setClickDetailOpen(true);
          } finally {
            if (id === runId.current) setClickLoading(false);
          }
        })();
      }
    }

    return () => {
      handle.remove();
      searchLayer.remove(marker);
      view.popupEnabled = true;
    };
  }, [ready, view, config, searchLayer, setClickResult, setClickLoading]);
}
