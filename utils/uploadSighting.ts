import { requireSession, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase';
import type { BrandKey } from '../constants/brands';

export interface UploadSightingInput {
  photoUri: string;
  latitude: number;
  longitude: number;
  address: string | null;
  capturedAt: string;   // ISO string taken at shutter time
}

export type SubmitErrorCode =
  | 'daily_limit' | 'not_a_brand_vehicle' | 'verification_unavailable'
  | 'unauthorized' | 'invalid' | 'network' | 'unknown';

export type UploadSightingResult =
  | { ok: true; sightingId: string; brand: BrandKey; streakCount: number }
  | { ok: false; code: SubmitErrorCode; message: string; nextAt?: string };

/** Sends the photo + metadata to the verify-sighting Edge Function. Never throws. */
export async function uploadSighting(input: UploadSightingInput): Promise<UploadSightingResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const session = await requireSession();

    // Multipart avoids base64-inflating the photo on the client.
    const form = new FormData();
    form.append('photo', { uri: input.photoUri, name: 'sighting.jpg', type: 'image/jpeg' } as unknown as Blob);
    form.append('latitude', String(input.latitude));
    form.append('longitude', String(input.longitude));
    form.append('captured_at', input.capturedAt);
    if (input.address) form.append('address', input.address);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-sighting`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
      body: form,   // don't set Content-Type; fetch adds the multipart boundary
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);

    if (res.ok && body?.ok) {
      return { ok: true, sightingId: body.sighting_id, brand: body.brand, streakCount: body.streak_count };
    }
    return {
      ok: false,
      code: (body?.error as SubmitErrorCode) ?? 'unknown',
      message: body?.message ?? 'Something went wrong. Try again.',
      nextAt: body?.next_at ?? undefined,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false,
      code: 'network',
      message: aborted ? 'That took too long. Check your connection and try again.' : 'Network error. Check your connection and try again.',
    };
  } finally {
    clearTimeout(timeout);
  }
}