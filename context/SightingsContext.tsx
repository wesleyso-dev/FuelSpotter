// context/SightingsContext.tsx (replaces v1; vote is now confirm + report)
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { LatLng, ReportReason, Sighting } from '../types/sighting';

const RADIUS_METERS = 15000;

interface SightingsContextValue {
  location: LatLng | null;       // query origin, fixed at launch
  livePosition: LatLng | null;   // updates as you move; drives the 100 m check in the UI
  permission: 'unknown' | 'granted' | 'denied';
  sightings: Sighting[];
  now: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  confirm: (id: string) => Promise<string | null>;                      // error message or null
  report: (id: string, reason: ReportReason) => Promise<string | null>; // error message or null
}

const Ctx = createContext<SightingsContextValue | null>(null);

export function useSightings(): SightingsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSightings must be used inside <SightingsProvider>');
  return v;
}

function friendlyRpcError(message: string): string {
  if (message.includes('out_of_range')) return 'You need to be within 100 m of this spot.';
  if (message.includes('already_confirmed')) return 'You already confirmed this one.';
  if (message.includes('already_reported')) return 'You already reported this one.';
  if (message.includes('not_found')) return 'This sighting has already expired.';
  return message;
}

export function SightingsProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [livePosition, setLivePosition] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [raw, setRaw] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const locRef = useRef<LatLng | null>(null);

  // 1) Location: one fix for the query origin, then a watcher for live distance.
  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') { setPermission('denied'); setLoading(false); return; }
      setPermission('granted');

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cancelled) return;
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      locRef.current = c;
      setLocation(c);
      setLivePosition(c);

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (p) => setLivePosition({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })().catch((e) => {
      setError(e instanceof Error ? e.message : 'Could not get your location.');
      setLoading(false);
    });
    return () => { cancelled = true; sub?.remove(); };
  }, []);

  // 2) PostGIS radius query. App.tsx only mounts this provider when signed in.
  const refetch = useCallback(async () => {
    const c = locRef.current;
    if (!c) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('get_nearby_sightings', {
        user_lat: c.latitude, user_lng: c.longitude, radius_meters: RADIUS_METERS,
      });
      if (rpcError) throw rpcError;
      setRaw((data ?? []) as Sighting[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sightings.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 3) Fetch + Realtime. Payloads carry geography as WKB hex, so any change just triggers a debounced refetch.
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(refetch, 400); };

    (async () => {
      await refetch();
      if (cancelled) return;
      channel = supabase
        .channel('sightings-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sightings' }, schedule)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [location, refetch]);

  // 4) Expiry clock + refetch on foreground.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { setNow(Date.now()); refetch(); }
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [refetch]);

  const sightings = useMemo(
    () => raw.filter((s) => s.is_active && Date.parse(s.expires_at) > now),
    [raw, now],
  );

  // "Still here": take a fresh high-accuracy fix at tap time; the server re-checks the 100 m rule.
  const confirm = useCallback(async (id: string) => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (pos.mocked) return 'Mock locations are not allowed.';
      const { error: e } = await supabase.rpc('confirm_sighting', {
        p_sighting_id: id, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude,
      });
      if (e) return friendlyRpcError(e.message);
      await refetch();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not get your location.';
    }
  }, [refetch]);

  const report = useCallback(async (id: string, reason: ReportReason) => {
    const { error: e } = await supabase.rpc('report_sighting', { p_sighting_id: id, p_reason: reason });
    if (e) return friendlyRpcError(e.message);
    await refetch();
    return null;
  }, [refetch]);

  const value = useMemo(
    () => ({ location, livePosition, permission, sightings, now, loading, error, refetch, confirm, report }),
    [location, livePosition, permission, sightings, now, loading, error, refetch, confirm, report],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}