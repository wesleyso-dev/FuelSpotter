// utils/geo.ts
import type { LatLng } from '../types/sighting';

export const IN_RANGE_METERS = 100;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatMiles(meters: number): string {
  const mi = meters / 1609.34;
  return mi < 0.1 ? '<0.1 mi' : `${mi.toFixed(1)} mi`;
}