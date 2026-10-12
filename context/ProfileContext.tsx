// context/ProfileContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/sighting';

interface ProfileCtx { profile: Profile | null; loading: boolean; refetch: () => Promise<void> }
const Ctx = createContext<ProfileCtx | null>(null);

export function useProfile(): ProfileCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile must be used inside <ProfileProvider>');
  return v;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_profile').single();
    if (!error && data) setProfile(data as Profile);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const value = useMemo(() => ({ profile, loading, refetch }), [profile, loading, refetch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}