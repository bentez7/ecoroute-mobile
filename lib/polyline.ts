import polyline from '@mapbox/polyline';

export type LatLng = [number, number]; // [lat, lng]
export type LngLat = [number, number]; // [lng, lat] — GeoJSON/Mapbox order

export function decode(encoded: string): LatLng[] {
  return polyline.decode(encoded) as LatLng[];
}

export function toGeoJSONLineString(coords: LatLng[]): LngLat[] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

export type LatLngObject = { latitude: number; longitude: number };

export function toLatLngObjects(coords: LatLng[]): LatLngObject[] {
  return coords.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
}

export function sampleWaypoints(coords: LatLng[], maxCount = 23): LatLng[] {
  if (coords.length <= 2) return coords.slice();
  const total = Math.min(maxCount, coords.length);
  if (total <= 2) return [coords[0], coords[coords.length - 1]];

  const step = (coords.length - 1) / (total - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < total; i++) {
    const idx = Math.round(i * step);
    out.push(coords[idx]);
  }
  return out;
}

const EARTH_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

interface NearestResult {
  distance: number;
  segmentIndex: number;
  t: number; // 0..1 along segment
}

function nearestOnSegment(p: LatLng, a: LatLng, b: LatLng): { dist: number; t: number } {
  // Local equirectangular projection centered at a — accurate enough for short segments
  const latRef = toRad(a[0]);
  const toXY = (pt: LatLng) => {
    const x = toRad(pt[1] - a[1]) * Math.cos(latRef) * EARTH_M;
    const y = toRad(pt[0] - a[0]) * EARTH_M;
    return [x, y] as const;
  };
  const [px, py] = toXY(p);
  const [bx, by] = toXY(b);
  const len2 = bx * bx + by * by;
  if (len2 === 0) return { dist: Math.hypot(px, py), t: 0 };
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = t * bx;
  const cy = t * by;
  return { dist: Math.hypot(px - cx, py - cy), t };
}

export function nearestPointOnPolyline(p: LatLng, coords: LatLng[]): NearestResult {
  let best: NearestResult = { distance: Infinity, segmentIndex: 0, t: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const { dist, t } = nearestOnSegment(p, coords[i], coords[i + 1]);
    if (dist < best.distance) best = { distance: dist, segmentIndex: i, t };
  }
  return best;
}

export function distanceToPolyline(p: LatLng, coords: LatLng[]): number {
  return nearestPointOnPolyline(p, coords).distance;
}

export function remainingCoordsFromNearest(
  p: LatLng,
  coords: LatLng[],
): LatLng[] {
  const { segmentIndex } = nearestPointOnPolyline(p, coords);
  return coords.slice(segmentIndex + 1);
}
