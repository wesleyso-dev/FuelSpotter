import { supabase, ensureSession } from '../lib/supabase';
import type { BrandKey } from '../constants/brands';

const BUCKET = 'sighting-photos';

export interface UploadSightingInput {
  photoUri: string;     // file:// URI straight from the camera
  brand: BrandKey;
  latitude: number;
  longitude: number;
  address: string | null;
  capturedAt: string;   // ISO string recorded at shutter time
}

export type UploadSightingResult =
  | { ok: true; sightingId: string }
  | { ok: false; error: string };

/** Turns raw Postgres exception text into something a human can read. */
function friendlyError(message: string): string {
  if (message.includes('stale')) return 'That capture is too old. Take a fresh photo.';
  if (message.includes('rate limit')) return 'Too many reports in a short time. Give it a few minutes.';
  if (message.includes('not authenticated')) return 'Session expired. Restart the app and try again.';
  return message;
}

/**
 * 1. Upload JPEG to Storage under <userId>/…  (matches the storage RLS policy)
 * 2. Insert the row via create_sighting()
 * 3. If step 2 fails, delete the orphaned photo
 * Never throws; callers get a discriminated result.
 */
export async function uploadSighting(input: UploadSightingInput): Promise<UploadSightingResult> {
  let uploadedPath: string | null = null;

  try {
    const session = await ensureSession();

    // fetch(file://…).arrayBuffer() is the most reliable way to get bytes in RN
    // without extra deps. Blob uploads from RN can silently produce 0-byte files.
    const response = await fetch(input.photoUri);
    if (!response.ok) throw new Error('Could not read the captured photo.');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) throw new Error('Captured photo was empty.');

    const path = `${session.user.id}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
    uploadedPath = path;

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data, error: rpcError } = await supabase.rpc('create_sighting', {
      p_brand: input.brand,
      p_lat: input.latitude,
      p_lng: input.longitude,
      p_address: input.address,
      p_photo_url: publicUrl,
      p_captured_at: input.capturedAt,
    });
    if (rpcError) throw new Error(friendlyError(rpcError.message));

    return { ok: true, sightingId: data as string };
  } catch (e) {
    if (uploadedPath) {
      try { await supabase.storage.from(BUCKET).remove([uploadedPath]); } catch { /* best effort */ }
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}