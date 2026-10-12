// types/sighting.ts (replaces v1)
import type { BrandKey } from '../constants/brands';

export interface LatLng { latitude: number; longitude: number }

export interface Sighting extends LatLng {
  id: string;
  brand: BrandKey;
  address: string | null;
  photo_url: string;
  created_at: string;
  expires_at: string;
  report_count: number;
  confirm_count: number;
  is_active: boolean;
  distance_meters: number;   // from the query origin, not live; use haversine for live distance
  has_reported: boolean;
  has_confirmed: boolean;
}

export type ReportReason = 'not_here' | 'fake' | 'wrong_brand';

export interface Profile {
  streak_count: number;
  best_streak: number;
  last_sighting_at: string | null;
  next_sighting_at: string | null;
}