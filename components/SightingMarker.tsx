import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { BRANDS } from '../constants/brands';
import type { Sighting } from '../types/sighting';

interface Props { sighting: Sighting; selected: boolean; onPress: () => void }

export function SightingMarker({ sighting, selected, onPress }: Props) {
  const brand = BRANDS[sighting.brand] ?? BRANDS.other;

  // Custom marker views need tracksViewChanges on long enough to rasterize,
  // then off so the map doesn't re-render every pin each frame.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 400);
    return () => clearTimeout(t);
  }, [selected, sighting.brand]);

  return (
    <Marker
      coordinate={{ latitude: sighting.latitude, longitude: sighting.longitude }}
      onPress={onPress}
      tracksViewChanges={tracks}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: brand.color,
            borderColor: selected ? '#000' : '#fff',
            borderWidth: selected ? 3 : 2,
            width: 40, height: 40, borderRadius: 20,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: brand.text, fontWeight: '800', fontSize: 16 }}>{brand.initial}</Text>
        </View>
        {/* little pointer under the badge */}
        <View
          style={{
            width: 0, height: 0, marginTop: -1,
            borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
            borderLeftColor: 'transparent', borderRightColor: 'transparent',
            borderTopColor: brand.color,
          }}
        />
      </View>
    </Marker>
  );
}