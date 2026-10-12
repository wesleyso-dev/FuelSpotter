// screens/ProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Countdown } from '../components/Countdown';
import { useProfile } from '../context/ProfileContext';
import { signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refetch } = useProfile();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    refetch();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [refetch]);

  const streak = profile?.streak_count ?? 0;
  const nextAt = profile?.next_sighting_at ? Date.parse(profile.next_sighting_at) : null;
  const waiting = nextAt !== null && nextAt > Date.now();

  return (
    <View className="flex-1 bg-neutral-950 px-6" style={{ paddingTop: insets.top + 24 }}>
      {email && <Text className="mb-8 text-neutral-500">{email}</Text>}

      <Text className="text-xs uppercase tracking-widest text-neutral-500">Spotter streak</Text>
      <View className="mb-1 flex-row items-end gap-2">
        <Text className="text-8xl font-extrabold text-lime-400">{streak}</Text>
        <Text className="mb-4 text-xl text-neutral-400">{streak === 1 ? 'day' : 'days'}</Text>
      </View>
      <Text className="mb-10 text-neutral-500">Best: {profile?.best_streak ?? 0}. Post within 48 hours of your last sighting to keep it going.</Text>

      <View className="rounded-2xl bg-neutral-900 p-5">
        <Text className="mb-1 text-neutral-400">{waiting ? 'Next sighting available in' : 'Ready to post'}</Text>
        {waiting && nextAt ? (
          <Countdown until={nextAt} className="text-4xl font-bold text-white" />
        ) : (
          <Text className="text-xl font-semibold text-white">Find a truck, take a photo.</Text>
        )}
      </View>

      <Pressable onPress={signOut} className="mt-auto items-center py-6" style={{ marginBottom: insets.bottom + 8 }}>
        <Text className="text-neutral-500">Sign out</Text>
      </Pressable>
    </View>
  );
}