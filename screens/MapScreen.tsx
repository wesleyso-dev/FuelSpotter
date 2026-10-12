// screens/MapScreen.tsx (replaces v1)
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { useSightings } from '../context/SightingsContext';
import { SightingMarker } from '../components/SightingMarker';
import { SightingCard } from '../components/SightingCard';
import { ReportFab } from '../components/ReportFab';

export default function MapScreen() {
  const { location, permission, sightings, loading, error } = useSightings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sightings.find((s) => s.id === selectedId) ?? null; // becomes null when it expires or gets reported off

  if (permission === 'denied') {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Text className="mb-2 text-lg font-semibold">Location is off</Text>
        <Text className="mb-5 text-center text-neutral-500">FuelSpotter needs your location to show what's parked nearby.</Text>
        <Pressable className="rounded-full bg-black px-6 py-3" onPress={() => Linking.openSettings()}>
          <Text className="font-semibold text-white">Open Settings</Text>
        </Pressable>
      </View>
    );
  }
  if (!location) return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator /></View>;

  return (
    <View className="flex-1">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...location, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedId(null)}
      >
        {sightings.map((s) => (
          <SightingMarker key={s.id} sighting={s} selected={s.id === selectedId} onPress={() => setSelectedId(s.id)} />
        ))}
      </MapView>

      {(loading || error) && (
        <View className="absolute left-4 right-4 top-14 rounded-xl bg-white/95 px-4 py-3">
          <Text className={error ? 'text-red-600' : 'text-neutral-500'}>{error ?? 'Loading sightings…'}</Text>
        </View>
      )}

      {selected && (
        <View className="absolute bottom-24 left-4 right-4">
          <SightingCard sighting={selected} />
        </View>
      )}
      <ReportFab />
    </View>
  );
}