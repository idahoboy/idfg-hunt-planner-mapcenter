import Point from '@arcgis/core/geometry/Point';

export type CoordFormat = 'dd' | 'dms' | 'ddm' | 'utm' | 'mgrs';

export function toDms(deg: number, isLat: boolean): string {
  const hemisphere = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = Math.round(((abs - d) * 60 - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}° ${m}' ${s}" ${hemisphere}`;
}

export function toDdm(deg: number, isLat: boolean): string {
  const hemisphere = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = (abs - d) * 60;
  return `${d}° ${m.toFixed(3)}' ${hemisphere}`;
}

/**
 * Accepts the coordinate forms hunters actually paste in: decimal degrees,
 * degrees-minutes-seconds with or without symbols, and degrees-decimal-minutes.
 * The legacy app accepted decimal degrees only and silently produced a point in
 * the ocean when given anything else.
 */
export function parseCoordinate(input: string): { lat: number; lon: number } | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;

  // Decimal degrees: "45.5, -114.5" or "45.5 -114.5"
  const dd = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (dd) {
    const a = Number(dd[1]);
    const b = Number(dd[2]);
    // Idaho is ~42-49N, 111-117W. Accept either ordering and disambiguate.
    const [lat, lon] = Math.abs(a) <= 90 && Math.abs(b) > 90 ? [a, b] : [a, b];
    return { lat, lon };
  }

  // DMS / DDM with hemispheres
  const pattern =
    /(-?\d+)\s*[°d ]\s*(\d+(?:\.\d+)?)?\s*['m ]?\s*(\d+(?:\.\d+)?)?\s*["s]?\s*([NSEW])?/gi;
  const parts: Array<{ value: number; hemisphere?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!match[1]) continue;
    const degrees = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    const seconds = Number(match[3] ?? 0);
    const sign = degrees < 0 ? -1 : 1;
    const value = sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
    parts.push({ value, hemisphere: match[4]?.toUpperCase() });
    if (parts.length === 2) break;
  }
  if (parts.length !== 2) return null;

  const applyHemisphere = (p: { value: number; hemisphere?: string }): number =>
    p.hemisphere === 'S' || p.hemisphere === 'W' ? -Math.abs(p.value) : p.value;

  const first = applyHemisphere(parts[0]!);
  const second = applyHemisphere(parts[1]!);

  const firstIsLat =
    parts[0]!.hemisphere === 'N' || parts[0]!.hemisphere === 'S' || Math.abs(first) <= 90;

  const lat = firstIsLat ? first : second;
  const lon = firstIsLat ? second : first;

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export interface UtmZoneConfig {
  wkid: number;
  label: string;
  minLon: number;
  maxLon: number;
}

export function pickUtmZone(lon: number, zones: UtmZoneConfig[]): UtmZoneConfig | null {
  return zones.find((z) => lon > z.minLon && lon <= z.maxLon) ?? null;
}

export function formatPoint(point: Point, format: CoordFormat): string {
  const lon = point.longitude ?? 0;
  const lat = point.latitude ?? 0;
  switch (format) {
    case 'dms': return `${toDms(lat, true)}, ${toDms(lon, false)}`;
    case 'ddm': return `${toDdm(lat, true)}, ${toDdm(lon, false)}`;
    case 'dd':
    default:    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}
