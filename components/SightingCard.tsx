import React, { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { BRANDS } from '../constants/brands';
import type { Sighting, VoteType } from '../types/sighting';

interface Props {
  sighting: Sighting;
  now: number;
  onVote: (id: string, v: VoteType) => Promise<string | null>;
}

function formatMiles(meters: number): string {
  const mi = meters / 1609.34;
  return mi < 0.1 ? '<0.1 mi' : `${mi.toFixed(1)} mi`;
}

export function SightingCard({ sighting, now, onVote }: Props) {
  const [pending, setPending] = useState<VoteType | null>(null);
  const brand = BRANDS[sighting.brand] ?? BRANDS.other;
  const minsLeft = Math.max(0, Math.ceil((Date.parse(sighting.expires_at) - now) / 60_000));
  const minsAgo = Math.max(0, Math.floor((now - Date.parse(sighting.created_at)) / 60_000));

  const handle = async (v: VoteType) => {
    setPending(v);
    const err = await onVote(sighting.id, v);
    setPending(null);
    if (err) Alert.alert('Vote failed', err);
  };

  return (
    <View className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-black/20">
      <Image source={{ uri: sighting.photo_url }} className="h-40 w-full bg-neutral-200" resizeMode="cover" />
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <View style={{ backgroundColor: brand.color }} className="rounded-full px-3 py-1">
            <Text style={{ color: brand.text }} className="text-xs font-bold">{brand.label}</Text>
          </View>
          <Text className="text-xs text-neutral-500">
            {minsAgo}m ago · {minsLeft}m left · {formatMiles(sighting.distance_meters)}
          </Text>
        </View>
        <Text className="mt-2 text-base font-medium" numberOfLines={2}>
          {sighting.address ?? 'Unknown location'}
        </Text>

        <View className="mt-3 flex-row gap-3">
          <Pressable
            disabled={pending !== null}
            onPress={() => handle('still_here')}
            className="flex-1 items-center rounded-full bg-neutral-900 py-3"
          >
            <Text className="font-semibold text-white">
              {pending === 'still_here' ? '…' : `Still here (${sighting.upvotes})`}
            </Text>
          </Pressable>
          <Pressable
            disabled={pending !== null}
            onPress={() => handle('gone')}
            className="flex-1 items-center rounded-full bg-neutral-100 py-3"
          >
            <Text className="font-semibold">
              {pending === 'gone' ? '…' : `Gone (${sighting.downvotes})`}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}