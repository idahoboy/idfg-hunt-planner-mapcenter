import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import EsriMap from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Extent from '@arcgis/core/geometry/Extent';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import type Layer from '@arcgis/core/layers/Layer';

import { useConfig } from '@/config/ConfigContext';
import { useAppStore } from '@/state/store';
import { buildLayers, type BuiltLayer } from './layerFactory';
import { buildBasemaps } from './basemaps';
import { readUrlState } from '@/state/urlState';

export interface MapContextValue {
  view: MapView | null;
  map: EsriMap | null;
  layers: Map<string, BuiltLayer>;
  /** Purple highlight geometry from the Highlight tool + result selection. */
  highlightLayer: GraphicsLayer;
  /** Transient hover flash from the results rail. */
  hoverLayer: GraphicsLayer;
  /** User drawings. */
  drawLayer: GraphicsLayer;
  drawTextLayer: GraphicsLayer;
  /** Uploaded GPX/KML/GeoJSON. */
  uploadLayer: GraphicsLayer;
  /** Place + coordinate search pins. */
  searchLayer: GraphicsLayer;
  ready: boolean;
  /** The element the SDK draws into. <MapCanvas> attaches it to the layout. */
  host: HTMLDivElement;
}

const MapContext = createContext<MapContextValue | null>(null);

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used inside <MapProvider>');
  return ctx;
}

export function MapProvider({ children }: { children: ReactNode }): React.ReactElement {
  const config = useConfig();
  // The host lives outside React's tree so the provider can wrap the whole app
  // (every tool panel calls useMap) while the map still renders inside <main>.
  // <MapCanvas> attaches this node wherever the layout wants it.
  const hostRef = useRef<HTMLDivElement | null>(null);
  if (hostRef.current === null) {
    const el = document.createElement('div');
    el.className = 'hp-map';
    el.setAttribute('role', 'application');
    el.setAttribute('aria-label', 'Idaho Hunt Planner map');
    hostRef.current = el;
  }
  const [ready, setReady] = useState(false);
  const viewRef = useRef<MapView | null>(null);
  const mapRef = useRef<EsriMap | null>(null);
  const layersRef = useRef(new Map<string, BuiltLayer>());

  const addHealthProblem = useAppStore((s) => s.addHealthProblem);
  const setHealthOk = useAppStore((s) => s.setHealthOk);
  const setLayerVisibilityBulk = useAppStore((s) => s.setLayerVisibilityBulk);
  const setBasemapId = useAppStore((s) => s.setBasemapId);
  const setGatedLayers = useAppStore((s) => s.setGatedLayers);

  // Overlay layers live outside the config-driven set so tools can always
  // reach them, and so they draw above every operational layer.
  const overlays = useMemo(
    () => ({
      highlightLayer: new GraphicsLayer({ id: '__highlight', title: 'Highlighted areas', listMode: 'hide' }),
      hoverLayer: new GraphicsLayer({ id: '__hover', title: 'Hover', listMode: 'hide' }),
      uploadLayer: new GraphicsLayer({ id: '__upload', title: 'Uploaded data', listMode: 'hide' }),
      drawLayer: new GraphicsLayer({ id: '__draw', title: 'Drawings', listMode: 'hide' }),
      drawTextLayer: new GraphicsLayer({ id: '__drawText', title: 'Map text', listMode: 'hide' }),
      searchLayer: new GraphicsLayer({ id: '__search', title: 'Search results', listMode: 'hide' }),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    // MapView.destroy() removes its container element from the DOM. If that
    // element is the one React rendered, React's next reconcile tries to
    // operate on a detached node and unmounts the whole tree (a blank page).
    // Giving the SDK its own child node that React never touches keeps the
    // two lifecycles independent — including under StrictMode's double-invoke.
    const container = document.createElement('div');
    container.className = 'hp-map__view';
    host.append(container);

    const basemaps = buildBasemaps(config.basemaps.items);
    const urlState = readUrlState(config);
    const initialBasemapId =
      (urlState.basemapId && basemaps.has(urlState.basemapId) ? urlState.basemapId : null) ??
      (basemaps.has(config.basemaps.default) ? config.basemaps.default : config.basemaps.items[0]!.id);

    const map = new EsriMap({ basemap: basemaps.get(initialBasemapId) });
    const view = new MapView({
      container,
      map,
      center: urlState.center ?? config.map.center,
      zoom: urlState.zoom ?? config.map.zoom,
      constraints: {
        minZoom: config.map.minZoom,
        maxZoom: config.map.maxZoom,
        rotationEnabled: false,
      },
      popup: {
        dockEnabled: config.map.popup.dockEnabled,
        dockOptions: {
          buttonEnabled: true,
          breakpoint: config.map.popup.breakpoint,
          position: config.map.popup.dockPosition as __esri.PopupDockOptions['position'],
        },
      },
      ui: { components: ['attribution'] },
    });

    mapRef.current = map;
    viewRef.current = view;
    setBasemapId(initialBasemapId);

    // Store basemaps on the map instance so the basemap picker can swap them
    // without rebuilding layers on every selection.
    (map as unknown as { __basemaps: Map<string, __esri.Basemap> }).__basemaps = basemaps;

    void (async () => {
      const built = await buildLayers(config.layers, addHealthProblem);
      if (cancelled) return;

      // Reverse: config lists top-of-legend first, ArcGIS draws last-added on top.
      const ordered = [...built].reverse();
      map.addMany(ordered.map((b) => b.layer as Layer));
      map.addMany([
        overlays.uploadLayer,
        overlays.highlightLayer,
        overlays.hoverLayer,
        overlays.drawLayer,
        overlays.drawTextLayer,
        overlays.searchLayer,
      ]);

      layersRef.current = new Map(built.map((b) => [b.config.id, b]));

      setHealthOk(
        built.map((b) => ({
          layerId: b.config.id,
          title: b.config.title,
          url: b.config.url,
          status: 'ok' as const,
        })),
      );

      // Seed visibility from URL bitmask first, config default otherwise.
      const visibility: Record<string, boolean> = {};
      const opacity: Record<string, number> = {};
      for (const b of built) {
        visibility[b.config.id] = urlState.layerVisibility[b.config.id] ?? b.config.visible;
        opacity[b.config.id] = b.config.opacity;
        b.layer.visible = visibility[b.config.id]!;
      }
      setLayerVisibilityBulk(visibility);

      await view.when();
      if (cancelled) return;

      if (!urlState.center && !urlState.zoom) {
        void view.goTo(
          new Extent({
            xmin: config.map.extent.xmin, ymin: config.map.extent.ymin,
            xmax: config.map.extent.xmax, ymax: config.map.extent.ymax,
            spatialReference: { wkid: config.map.extent.wkid },
          }),
          { animate: false },
        );
      }
      setReady(true);
    })();

    // Scale gating replaces four hand-written pairs of enable/disable jQuery
    // functions that hard-coded checkbox DOM ids.
    const gateHandle = reactiveUtils.watch(
      () => view.scale,
      (scale) => {
        const gated: Record<string, boolean> = {};
        for (const layer of config.layers) {
          if (!layer.scaleGate) continue;
          gated[layer.id] = scale > layer.scaleGate.enableBelow;
        }
        setGatedLayers(gated);
      },
      { initial: true },
    );

    return () => {
      cancelled = true;
      gateHandle.remove();
      view.destroy();
      container.remove();
      viewRef.current = null;
      mapRef.current = null;
    };
  }, [config, addHealthProblem, setHealthOk, setLayerVisibilityBulk, setBasemapId, setGatedLayers, overlays]);

  const value = useMemo<MapContextValue>(
    () => ({
      view: viewRef.current,
      map: mapRef.current,
      layers: layersRef.current,
      ready,
      host: hostRef.current!,
      ...overlays,
    }),
    [ready, overlays],
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

/**
 * Mounts the map into the layout. Rendered inside <main>, while <MapProvider>
 * wraps the whole application so every tool panel can call useMap().
 */
export function MapCanvas(): React.ReactElement {
  const { host } = useMap();
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.append(host);
    return () => {
      if (host.parentNode === mount) mount.removeChild(host);
    };
  }, [host]);

  return <div className="hp-mapmount" ref={mountRef} />;
}
