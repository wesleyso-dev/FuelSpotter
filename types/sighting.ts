// types/sighting.ts
import type { BrandKey } from '../constants/brands';

export interface LatLng { latitude: number; longitude: number }

/** Row shape returned by get_nearby_sightings(). */
export interface Sighting {
  id: string;
  brand: BrandKey;
  address: string | null;
  photo_url: string;
  created_at: string;
  expires_at: string;
  upvotes: number;
  downvotes: number;
  is_active: boolean;
  latitude: number;
  longitude: number;
  distance_meters: number;
}

export type VoteType = 'still_here' | 'gone';