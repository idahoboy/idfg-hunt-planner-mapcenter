import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';
import Polyline from '@arcgis/core/geometry/Polyline';
import Polygon from '@arcgis/core/geometry/Polygon';

export interface ParsedTrack {
  graphics: Graphic[];
  name: string;
  counts: { points: number; lines: number; polygons: number };
}

const WGS84 = { wkid: 4326 } as const;

function textOf(node: Element | null, tag: string): string {
  return node?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

/**
 * GPX parsed in the browser. The legacy app POSTed the user's file to
 * arcgis.com/sharing/rest/content/features/generate — a third-party round trip
 * for data that never needed to leave the device, and one that silently failed
 * whenever ArcGIS Online rate-limited anonymous requests.
 */
export function parseGpx(xml: string, filename: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('That GPX file could not be parsed.');
  }

  const graphics: Graphic[] = [];
  const counts = { points: 0, lines: 0, polygons: 0 };

  for (const wpt of Array.from(doc.getElementsByTagName('wpt'))) {
    const lon = Number(wpt.getAttribute('lon'));
    const lat = Number(wpt.getAttribute('lat'));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    counts.points += 1;
    graphics.push(
      new Graphic({
        geometry: new Point({ longitude: lon, latitude: lat, spatialReference: WGS84 }),
        attributes: {
          name: textOf(wpt, 'name') || 'Waypoint',
          description: textOf(wpt, 'desc'),
          elevation: textOf(wpt, 'ele'),
          time: textOf(wpt, 'time'),
        },
      }),
    );
  }

  for (const tag of ['trk', 'rte']) {
    for (const track of Array.from(doc.getElementsByTagName(tag))) {
      const pointTag = tag === 'trk' ? 'trkpt' : 'rtept';
      const paths: number[][][] = [];
      const segments =
        tag === 'trk' ? Array.from(track.getElementsByTagName('trkseg')) : [track];

      for (const segment of segments) {
        const path = Array.from(segment.getElementsByTagName(pointTag))
          .map((pt) => [Number(pt.getAttribute('lon')), Number(pt.getAttribute('lat'))])
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
        if (path.length > 1) paths.push(path);
      }

      if (paths.length === 0) continue;
      counts.lines += 1;
      graphics.push(
        new Graphic({
          geometry: new Polyline({ paths, spatialReference: WGS84 }),
          attributes: {
            name: textOf(track, 'name') || (tag === 'trk' ? 'Track' : 'Route'),
            description: textOf(track, 'desc'),
          },
        }),
      );
    }
  }

  return { graphics, name: filename, counts };
}

function parseKmlCoordinates(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .map((triple) => triple.split(',').map(Number))
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0]!, c[1]!]);
}

export function parseKml(xml: string, filename: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('That KML file could not be parsed.');
  }

  const graphics: Graphic[] = [];
  const counts = { points: 0, lines: 0, polygons: 0 };

  for (const placemark of Array.from(doc.getElementsByTagName('Placemark'))) {
    const attributes = {
      name: textOf(placemark, 'name') || 'Feature',
      description: textOf(placemark, 'description'),
    };

    for (const point of Array.from(placemark.getElementsByTagName('Point'))) {
      const coords = parseKmlCoordinates(textOf(point, 'coordinates'));
      const first = coords[0];
      if (!first) continue;
      counts.points += 1;
      graphics.push(
        new Graphic({
          geometry: new Point({ longitude: first[0], latitude: first[1], spatialReference: WGS84 }),
          attributes,
        }),
      );
    }

    for (const line of Array.from(placemark.getElementsByTagName('LineString'))) {
      const path = parseKmlCoordinates(textOf(line, 'coordinates'));
      if (path.length < 2) continue;
      counts.lines += 1;
      graphics.push(
        new Graphic({
          geometry: new Polyline({ paths: [path], spatialReference: WGS84 }),
          attributes,
        }),
      );
    }

    for (const polygon of Array.from(placemark.getElementsByTagName('Polygon'))) {
      const rings = Array.from(polygon.getElementsByTagName('LinearRing'))
        .map((ring) => parseKmlCoordinates(textOf(ring, 'coordinates')))
        .filter((ring) => ring.length > 3);
      if (rings.length === 0) continue;
      counts.polygons += 1;
      graphics.push(
        new Graphic({
          geometry: new Polygon({ rings, spatialReference: WGS84 }),
          attributes,
        }),
      );
    }
  }

  return { graphics, name: filename, counts };
}

export function parseGeoJson(text: string, filename: string): ParsedTrack {
  const data = JSON.parse(text) as {
    type?: string;
    features?: Array<{ geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> }>;
  };
  const features = data.type === 'FeatureCollection' ? data.features ?? [] : [];
  const graphics: Graphic[] = [];
  const counts = { points: 0, lines: 0, polygons: 0 };

  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;
    const attributes = (feature.properties ?? {}) as Record<string, unknown>;

    switch (geom.type) {
      case 'Point': {
        const [x, y] = geom.coordinates as number[];
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        counts.points += 1;
        graphics.push(new Graphic({
          geometry: new Point({ longitude: x, latitude: y, spatialReference: WGS84 }),
          attributes,
        }));
        break;
      }
      case 'LineString': {
        counts.lines += 1;
        graphics.push(new Graphic({
          geometry: new Polyline({ paths: [geom.coordinates as number[][]], spatialReference: WGS84 }),
          attributes,
        }));
        break;
      }
      case 'MultiLineString': {
        counts.lines += 1;
        graphics.push(new Graphic({
          geometry: new Polyline({ paths: geom.coordinates as number[][][], spatialReference: WGS84 }),
          attributes,
        }));
        break;
      }
      case 'Polygon': {
        counts.polygons += 1;
        graphics.push(new Graphic({
          geometry: new Polygon({ rings: geom.coordinates as number[][][], spatialReference: WGS84 }),
          attributes,
        }));
        break;
      }
      case 'MultiPolygon': {
        for (const rings of geom.coordinates as number[][][][]) {
          counts.polygons += 1;
          graphics.push(new Graphic({
            geometry: new Polygon({ rings, spatialReference: WGS84 }),
            attributes,
          }));
        }
        break;
      }
      default:
        break;
    }
  }

  return { graphics, name: filename, counts };
}

/** Minimal CSV waypoint reader — looks for lat/lon style column names. */
export function parseCsv(text: string, filename: string): ParsedTrack {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('That CSV has no rows.');

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const lonIndex = header.findIndex((h) => ['lon', 'long', 'longitude', 'x'].includes(h));
  const latIndex = header.findIndex((h) => ['lat', 'latitude', 'y'].includes(h));
  if (lonIndex < 0 || latIndex < 0) {
    throw new Error('CSV needs latitude and longitude columns (lat/lon, latitude/longitude, or x/y).');
  }

  const graphics: Graphic[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const lon = Number(cells[lonIndex]);
    const lat = Number(cells[latIndex]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const attributes: Record<string, unknown> = {};
    header.forEach((key, i) => { attributes[key] = cells[i]?.trim() ?? ''; });
    graphics.push(new Graphic({
      geometry: new Point({ longitude: lon, latitude: lat, spatialReference: WGS84 }),
      attributes,
    }));
  }

  return { graphics, name: filename, counts: { points: graphics.length, lines: 0, polygons: 0 } };
}

export async function parseTrackFile(file: File): Promise<ParsedTrack> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith('.kmz')) {
    throw new Error('KMZ is a zipped KML. Unzip it and upload the .kml inside.');
  }

  const text = await file.text();
  if (lower.endsWith('.gpx')) return parseGpx(text, name);
  if (lower.endsWith('.kml')) return parseKml(text, name);
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return parseGeoJson(text, name);
  if (lower.endsWith('.csv')) return parseCsv(text, name);
  throw new Error(`Unsupported file type: ${name}`);
}
