// Flow: auth → validate → cheap rate-limit pre-check → AI vision check →
// upload photo → create_verified_sighting() (atomic limit + insert + streak).
// Rejected photos are never stored and never consume the daily slot.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

// Auto-injected by Supabase. If your project uses the newer API keys and
// these come back undefined, check the function logs for the new names.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Set with: supabase secrets set OPENAI_API_KEY=... VISION_MODEL=...
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const VISION_MODEL = Deno.env.get('VISION_MODEL') ?? 'gpt-4o-mini'; // any vision model with JSON-schema output

const BUCKET = 'sighting-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.7;

type Brand = 'red_bull' | 'monster' | 'celsius' | 'other';
interface Verdict { is_promo_vehicle: boolean; brand: Brand | 'none'; confidence: number; reason: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SYSTEM_PROMPT = `You verify photos for an app that tracks brand promotional vehicles: branded vans, trucks and cars (for example Red Bull Mini Coopers or Monster Energy trucks) that hand out free samples.
Set is_promo_vehicle=true ONLY if the photo shows a real vehicle, photographed live, with a clearly visible brand livery or logo.
Set it to false for: screenshots, photos of screens or prints, logos on clothing/cans/signs/stores with no promo vehicle, ordinary unbranded vehicles, stock-looking or AI-generated images, and anything where the brand can't be read.
brand: red_bull | monster | celsius | other (another clearly branded promo vehicle) | none.
confidence: 0 to 1. reason: one short sentence.`;

async function verifyWithVision(base64Jpeg: string): Promise<Verdict> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Does this photo show a brand promotional vehicle?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail: 'auto' } },
        ] },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'sighting_verification',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['is_promo_vehicle', 'brand', 'confidence', 'reason'],
            properties: {
              is_promo_vehicle: { type: 'boolean' },
              brand: { type: 'string', enum: ['red_bull', 'monster', 'celsius', 'other', 'none'] },
              confidence: { type: 'number' },
              reason: { type: 'string' },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`vision_api_${res.status}`);
  const data = await res.json();
  const verdict = JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as Verdict | null;
  if (!verdict || typeof verdict.is_promo_vehicle !== 'boolean') throw new Error('vision_bad_response');
  return verdict;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'invalid', message: 'POST only.' }, 405);

  try {
    // 1. Who is calling?
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: 'unauthorized', message: 'Please sign in again.' }, 401);

    // 2. Parse and validate the multipart payload.
    const form = await req.formData();
    const photo = form.get('photo');
    const lat = parseFloat(String(form.get('latitude')));
    const lng = parseFloat(String(form.get('longitude')));
    const capturedAt = String(form.get('captured_at') ?? '');
    const address = form.get('address') ? String(form.get('address')) : null;

    if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
      return json({ error: 'invalid', message: 'Photo missing or too large (5 MB max).' }, 400);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json({ error: 'invalid', message: 'Bad coordinates.' }, 400);
    }
    if (!(Math.abs(Date.now() - Date.parse(capturedAt)) <= MAX_CAPTURE_AGE_MS)) {
      return json({ error: 'invalid', message: 'That capture is too old. Take a fresh photo.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 3. Cheap pre-check so we don't pay for a vision call we'd reject anyway.
    //    The authoritative check is inside create_verified_sighting().
    const { data: profile } = await admin.from('profiles').select('last_sighting_at').eq('user_id', user.id).maybeSingle();
    if (profile?.last_sighting_at && Date.now() - Date.parse(profile.last_sighting_at) < DAY_MS) {
      const nextAt = new Date(Date.parse(profile.last_sighting_at) + DAY_MS).toISOString();
      return json({ error: 'daily_limit', message: "You've already posted today.", next_at: nextAt }, 429);
    }

    // 4. AI brand verification.
    const bytes = new Uint8Array(await photo.arrayBuffer());
    let verdict: Verdict;
    try {
      verdict = await verifyWithVision(encodeBase64(bytes));
    } catch (e) {
      console.error('vision failure', e);
      return json({ error: 'verification_unavailable', message: "Couldn't verify the photo right now. Try again in a minute." }, 502);
    }

    const accepted = verdict.is_promo_vehicle && verdict.brand !== 'none' && verdict.confidence >= MIN_CONFIDENCE;
    if (!accepted) {
      console.log('rejected', user.id, verdict);
      return json({
        error: 'not_a_brand_vehicle',
        message: "We couldn't spot a branded promo vehicle in that photo. Get the whole vehicle and its logo in frame, then try again.",
      }, 422);
    }

    // 5. Store the photo (service role bypasses storage RLS), then insert atomically.
    const path = `${user.id}/${Date.now()}.jpg`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);

    const { data, error: rpcErr } = await admin.rpc('create_verified_sighting', {
      p_user_id: user.id,
      p_brand: verdict.brand,
      p_lat: lat,
      p_lng: lng,
      p_address: address,
      p_photo_url: publicUrl,
      p_captured_at: capturedAt,
      p_verification: { model: VISION_MODEL, ...verdict },
    });

    if (rpcErr) {
      await admin.storage.from(BUCKET).remove([path]); // don't leave orphans
      if (rpcErr.message.includes('daily_limit')) {
        return json({ error: 'daily_limit', message: "You've already posted today.", next_at: rpcErr.details ?? null }, 429);
      }
      if (rpcErr.message.includes('stale_capture')) return json({ error: 'invalid', message: 'That capture is too old. Take a fresh photo.' }, 400);
      throw rpcErr;
    }

    return json({ ok: true, sighting_id: data.id, brand: verdict.brand, streak_count: data.streak_count });
  } catch (e) {
    console.error('verify-sighting failed', e);
    return json({ error: 'unknown', message: 'Something went wrong on our end. Try again.' }, 500);
  }
});