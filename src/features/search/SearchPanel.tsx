import { useEffect, useRef, useState } from 'react';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import Search from '@arcgis/core/widgets/Search';
import Locator from '@arcgis/core/rest/support/AddressCandidate';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { useAppStore } from '@/state/store';
import { parseCoordinate, formatPoint, type CoordFormat } from '@/lib/coordinates';
import { Icon } from '@/components/Icon';
import { useWidgetContainer } from '@/map/useWidgetContainer';

void Locator; // type-only import guard for the Esri typings

interface SearchToolConfig {
  geocoder?: { url: string; fallbackUrl?: string; countryCode?: string; maxSuggestions?: number };
  coordinateFormats?: CoordFormat[];
  defaultCoordinateFormat?: CoordFormat;
  zoomScale?: number;
}

export function SearchPanel(): React.ReactElement {
  const config = useConfig();
  const { view, searchLayer, ready } = useMap();
  const showToast = useAppStore((s) => s.showToast);

  const [hostRef, makeContainer] = useWidgetContainer();
  const widgetRef = useRef<Search | null>(null);

  const tool = (config.tools['search'] ?? {}) as SearchToolConfig;
  const [coordText, setCoordText] = useState('');
  const [format, setFormat] = useState<CoordFormat>(tool.defaultCoordinateFormat ?? 'dd');

  // Place search — Esri's keyless World Geocoder, clipped to the Idaho extent.
  useEffect(() => {
    if (!ready || !view || !hostRef.current) return;
    const container = makeContainer();
    if (!container) return;

    const widget = new Search({
      view,
      container,
      includeDefaultSources: false,
      popupEnabled: false,
      locationEnabled: false,
      maxSuggestions: tool.geocoder?.maxSuggestions ?? 8,
      sources: [
        {
          name: 'Places in Idaho',
          placeholder: 'City, landmark, or address',
          url: tool.geocoder?.url ?? 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer',
          countryCode: tool.geocoder?.countryCode ?? 'USA',
          filter: {
            geometry: {
              type: 'extent',
              xmin: config.map.extent.xmin, ymin: config.map.extent.ymin,
              xmax: config.map.extent.xmax, ymax: config.map.extent.ymax,
              spatialReference: { wkid: config.map.extent.wkid },
            } as unknown as __esri.Geometry,
          },
        } as unknown as __esri.LocatorSearchSource,
      ],
    });
    widgetRef.current = widget;

    return () => { widget.destroy(); widgetRef.current = null; };
  }, [ready, view, config, makeContainer, hostRef, tool.geocoder]);

  function goToCoordinate(): void {
    if (!view) return;
    const parsed = parseCoordinate(coordText);
    if (!parsed) {
      showToast('Could not read that coordinate. Try 45.5, -114.5 or 45° 30\' 00" N, 114° 30\' 00" W.', 'error');
      return;
    }

    const point = new Point({
      longitude: parsed.lon, latitude: parsed.lat, spatialReference: { wkid: 4326 },
    });

    searchLayer.add(new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: 'diamond', color: '#ff7200', size: 14,
        outline: { color: '#ffffff', width: 2 },
      }),
    }));
    searchLayer.add(new Graphic({
      geometry: point,
      symbol: new TextSymbol({
        text: formatPoint(point, format),
        color: '#1f2119',
        haloColor: '#ffffff',
        haloSize: 1.5,
        font: { size: 12, family: 'Lato, Arial, sans-serif', weight: 'bold' },
        horizontalAlignment: 'left',
        xoffset: 14,
      }),
    }));

    void view.goTo({ target: point, scale: tool.zoomScale ?? 36112 });
  }

  return (
    <div className="hp-panel">
      <section className="hp-panel__section">
        <h3 className="hp-panel__heading">Search for a place</h3>
        <div ref={hostRef} className="hp-esri-widget" />
      </section>

      <section className="hp-panel__section">
        <h3 className="hp-panel__heading">Go to a coordinate</h3>
        <p className="hp-panel__hint">
          Decimal degrees, degrees-minutes-seconds, or degrees-decimal-minutes all work.
        </p>
        <div className="hp-field">
          <label className="hp-field__label" htmlFor="coord-input">Coordinate</label>
          <input
            id="coord-input"
            className="hp-input"
            value={coordText}
            placeholder="45.5, -114.5"
            onChange={(e) => setCoordText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') goToCoordinate(); }}
          />
        </div>
        <div className="hp-field">
          <label className="hp-field__label" htmlFor="coord-format">Label format</label>
          <select
            id="coord-format"
            className="hp-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as CoordFormat)}
          >
            {(tool.coordinateFormats ?? ['dd', 'dms', 'ddm']).map((f) => (
              <option key={f} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="hp-panel__actions">
          <button type="button" className="hp-btn hp-btn--primary" onClick={goToCoordinate}>
            <Icon name="crosshair" size={15} /> Go
          </button>
          <button type="button" className="hp-btn hp-btn--ghost" onClick={() => searchLayer.removeAll()}>
            Clear pins
          </button>
        </div>
      </section>
    </div>
  );
}
