import type MapView from '@arcgis/core/views/MapView';

export type Bbox = [number, number, number, number];

/** A box this small is a point that happens to be expressed as an extent. */
const DEGENERATE_DEGREES = 0.0002;   // ~20 m

/**
 * Frames a target on the map.
 *
 * An extent is the right answer for a polygon or a line — it shows the whole
 * thing and lets the shape set the scale. It is the wrong answer for a point:
 * a zero-area extent either gets rejected or drops the view to maximum zoom on
 * a coordinate, which tells the reader nothing about where they are. Points
 * get a fixed, legible scale instead.
 */
export async function zoomToBbox(
  view: MapView,
  bbox: Bbox,
  opts: { pointZoom?: number; duration?: number } = {},
): Promise<void> {
  const [xmin, ymin, xmax, ymax] = bbox;
  const width = Math.abs(xmax - xmin);
  const height = Math.abs(ymax - ymin);
  const duration = opts.duration ?? 500;

  if (width < DEGENERATE_DEGREES && height < DEGENERATE_DEGREES) {
    await view.goTo(
      {
        center: [(xmin + xmax) / 2, (ymin + ymax) / 2],
        zoom: opts.pointZoom ?? 12,
      },
      { duration },
    );
    return;
  }

  await view.goTo(
    {
      target: {
        type: 'extent',
        xmin,
        ymin,
        xmax,
        ymax,
        spatialReference: { wkid: 4326 },
      },
    },
    { duration },
  );
}

/**
 * Same rule, applied to a geometry rather than a box: extent for anything with
 * area or length, a fixed zoom for a point or multipoint that collapses to one.
 */
export async function zoomToGeometry(
  view: MapView,
  geometry: __esri.GeometryUnion,
  opts: { pointZoom?: number; duration?: number } = {},
): Promise<void> {
  const duration = opts.duration ?? 500;

  if (geometry.type === 'point') {
    await view.goTo({ target: geometry, zoom: opts.pointZoom ?? 12 }, { duration });
    return;
  }

  const extent = 'extent' in geometry ? geometry.extent : null;
  if (!extent) {
    await view.goTo({ target: geometry, zoom: opts.pointZoom ?? 12 }, { duration });
    return;
  }

  // A multipoint of one, or a line of zero length, still collapses to a point.
  if (extent.width < 1 && extent.height < 1) {
    await view.goTo({ target: extent.center, zoom: opts.pointZoom ?? 12 }, { duration });
    return;
  }

  await view.goTo({ target: extent }, { duration });
}
