// components/SightingCard.tsx (replaces v1; now self-contained)
import React, { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { BRANDS } from '../constants/brands';
import { useSightings } from '../context/SightingsContext';
import { formatMiles, haversineMeters, IN_RANGE_METERS } from '../utils/geo';
import type { Sighting } from '../types/sighting';
import { Countdown } from './Countdown';
import { ReportModal } from './ReportModal';

export function SightingCard({ sighting }: { sighting: Sighting }) {
  const { livePosition, confirm } = useSightings();
  const [pending, setPending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const brand = BRANDS[sighting.brand] ?? BRANDS.other;

  const meters = livePosition ? haversineMeters(livePosition, sighting) : null;
  const inRange = meters !== null && meters <= IN_RANGE_METERS;
  const canConfirm = inRange && !sighting.has_confirmed && !pending;

  const handleConfirm = async () => {
    setPending(true);
    const err = await confirm(sighting.id);
    setPending(false);
    if (err) Alert.alert("Couldn't confirm", err);
  };

  const confirmLabel = sighting.has_confirmed
    ? 'Confirmed'
    : pending ? '…'
    : inRange ? `Still here (${sighting.confirm_count})`
    : 'Get within 100 m';

  return (
    <View className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-black/20">
      <Image source={{ uri: sighting.photo_url }} className="h-40 w-full bg-neutral-200" resizeMode="cover" />
      <View className="p-4">
        <View className="flex-row items-center justify-between">
          <View style={{ backgroundColor: brand.color }} className="rounded-full px-3 py-1">
            <Text style={{ color: brand.text }} className="text-xs font-bold">{brand.label}</Text>
          </View>
          <View className="items-end">
            <Countdown until={sighting.expires_at} className="text-lg font-bold tabular-nums" />
            <Text className="text-[10px] uppercase tracking-wide text-neutral-400">left on the map</Text>
          </View>
        </View>

        <Text className="mt-2 text-base font-medium" numberOfLines={2}>{sighting.address ?? 'Unknown location'}</Text>
        {meters !== null && <Text className="text-xs text-neutral-500">{formatMiles(meters)} away</Text>}

        <View className="mt-3 flex-row gap-3">
          <Pressable
            disabled={!canConfirm}
            onPress={handleConfirm}
            className={`flex-1 items-center rounded-full py-3 ${canConfirm ? 'bg-neutral-900' : 'bg-neutral-200'}`}
          >
            <Text className={`font-semibold ${canConfirm ? 'text-white' : 'text-neutral-500'}`}>{confirmLabel}</Text>
          </Pressable>
          <Pressable
            disabled={sighting.has_reported}
            onPress={() => setReportOpen(true)}
            className="flex-1 items-center rounded-full bg-neutral-100 py-3"
          >
            <Text className="font-semibold">{sighting.has_reported ? 'Reported' : 'Not here'}</Text>
          </Pressable>
        </View>
      </View>
      <ReportModal visible={reportOpen} sightingId={sighting.id} onClose={() => setReportOpen(false)} />
    </View>
  );
}