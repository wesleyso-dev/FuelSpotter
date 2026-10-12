import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,       // persist the anonymous session across launches
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,   // no web redirects in RN
  },
});

/** Returns the current session, creating an anonymous one on first launch. */
export async function ensureSession(): Promise<Session> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error('Anonymous sign-in failed');
  return data.session;
}