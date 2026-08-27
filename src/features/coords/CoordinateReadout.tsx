import { useEffect, useRef, useState } from 'react';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import type Point from '@arcgis/core/geometry/Point';
import { useConfig } from '@/config/ConfigContext';
import { useMap } from '@/map/MapProvider';
import { formatPoint, pickUtmZone, type CoordFormat, type UtmZoneConfig } from '@/lib/coordinates';

interface ReadoutConfig {
  enabled?: boolean;
  formats?: CoordFormat[];
  utmZones?: UtmZoneConfig[];
}

/**
 * Pointer coordinate readout. The legacy version re-created a GeometryService
 * and fired a network request on *every mousemove* to project to UTM; this
 * projects locally with the client-side projection engine.
 */
export function CoordinateReadout(): React.ReactElement | null {
  const config = useConfig();
  const { view, ready } = useMap();
  const tool = (config.tools['coordinateReadout'] ?? {}) as ReadoutConfig;
  const formats = tool.formats ?? ['dd', 'dms'];

  // The projection engine is ~615KB and is only needed for UTM. Statically
  // importing it made a readout that defaults to decimal degrees the single
  // largest thing pulled into the boot bundle.
  const projectionRef = useRef<typeof import('@arcgis/core/geometry/projection') | null>(null);
  const [projectionReady, setProjectionReady] = useState(false);
  const needsProjection = formats.includes('utm');

  const [formatIndex, setFormatIndex] = useState(0);
  const [primary, setPrimary] = useState('');
  const [utm, setUtm] = useState('');

  // Fetch the projection engine once, and only when a UTM format is on offer.
  useEffect(() => {
    if (!needsProjection || projectionRef.current) return;
    let cancelled = false;
    void (async () => {
      const mod = await import('@arcgis/core/geometry/projection');
      await mod.load();
      if (cancelled) return;
      projectionRef.current = mod;
      setProjectionReady(true);
    })();
    return () => { cancelled = true; };
  }, [needsProjection]);

  useEffect(() => {
    if (!ready || !view || tool.enabled === false) return;


    let frame = 0;
    const handle = view.on('pointer-move', (event) => {
      if (frame) return;                       // throttle to one update per frame
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const point = view.toMap({ x: event.x, y: event.y }) as Point | null;
        if (!point) return;

        const format = formats[formatIndex] ?? 'dd';
        setPrimary(formatPoint(point, format));

        const zone = pickUtmZone(point.longitude ?? 0, tool.utmZones ?? []);
        if (!zone || !projectionReady || !projectionRef.current) { setUtm(''); return; }
        try {
          const projected = projectionRef.current.project(
            point, new SpatialReference({ wkid: zone.wkid }),
          ) as Point | null;
          setUtm(
            projected
              ? `${zone.label}: ${projected.x.toFixed(0)}, ${projected.y.toFixed(0)}`
              : '',
          );
        } catch {
          setUtm('');
        }
      });
    });

    return () => {
      handle.remove();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ready, view, formatIndex, formats, tool.enabled, tool.utmZones]);

  if (tool.enabled === false) return null;

  return (
    <div className="hp-coords">
      <button
        type="button"
        className="hp-coords__btn"
        onClick={() => setFormatIndex((i) => (i + 1) % formats.length)}
        title="Click to change coordinate format"
      >
        <span className="hp-coords__format">{(formats[formatIndex] ?? 'dd').toUpperCase()}</span>
        <span className="hp-coords__value">{primary || '—'}</span>
      </button>
      {utm ? <span className="hp-coords__utm">{utm}</span> : null}
    </div>
  );
}
