import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureSession } from '../lib/supabase';
import type { LatLng, Sighting, VoteType } from '../types/sighting';

const RADIUS_METERS = 15000;

interface SightingsContextValue {
  location: LatLng | null;
  permission: 'unknown' | 'granted' | 'denied';
  sightings: Sighting[];   // already filtered to non-expired
  now: number;             // ticks every 15s so countdowns/expiry stay current
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  vote: (id: string, v: VoteType) => Promise<string | null>; // returns error message or null
}

const Ctx = createContext<SightingsContextValue | null>(null);

export function useSightings(): SightingsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSightings must be used inside <SightingsProvider>');
  return v;
}

export function SightingsProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [raw, setRaw] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const locRef = useRef<LatLng | null>(null);

  // 1) Foreground location for centering the map and the radius query.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermission('denied');
        setLoading(false);
        return;
      }
      setPermission('granted');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cancelled) return;
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      locRef.current = c;
      setLocation(c);
    })().catch((e) => {
      setError(e instanceof Error ? e.message : 'Could not get your location.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 2) PostGIS radius query via RPC.
  const refetch = useCallback(async () => {
    const c = locRef.current;
    if (!c) return;
    try {
      await ensureSession();
      const { data, error: rpcError } = await supabase.rpc('get_nearby_sightings', {
        user_lat: c.latitude,
        user_lng: c.longitude,
        radius_meters: RADIUS_METERS,
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

  // 3) Initial fetch + Realtime. Realtime payloads carry geography as WKB hex,
  //    so instead of parsing it we treat any change as "refetch" (debounced).
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refetch, 400);
    };

    (async () => {
      await ensureSession();   // Realtime needs the user's JWT before subscribing
      await refetch();
      if (cancelled) return;
      channel = supabase
        .channel('sightings-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sightings' }, schedule)
        .subscribe();
    })().catch((e) => setError(e instanceof Error ? e.message : 'Realtime failed to start.'));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [location, refetch]);

  // 4) Clock tick (expiry happens client-side too) + refetch on foreground.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { setNow(Date.now()); refetch(); }
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [refetch]);

  // Hide anything past its expiry the moment the clock says so,
  // without waiting for the server to tell us.
  const sightings = useMemo(
    () => raw.filter((s) => s.is_active && Date.parse(s.expires_at) > now),
    [raw, now],
  );

  const vote = useCallback(async (id: string, v: VoteType) => {
    const { error: e } = await supabase.rpc('vote_sighting', { p_sighting_id: id, p_vote: v });
    if (e) return e.message;
    await refetch();
    return null;
  }, [refetch]);

  const value = useMemo(
    () => ({ location, permission, sightings, now, loading, error, refetch, vote }),
    [location, permission, sightings, now, loading, error, refetch, vote],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}