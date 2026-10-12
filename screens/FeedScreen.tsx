import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { useSightings } from '../context/SightingsContext';
import { SightingCard } from '../components/SightingCard';
import { ReportFab } from '../components/ReportFab';

export default function FeedScreen() {
  const { sightings, now, vote, loading, error, refetch } = useSightings();

  return (
    <View className="flex-1 bg-neutral-100">
      <FlatList
        data={sightings}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 16 }}
        refreshing={loading}
        onRefresh={refetch}
        renderItem={({ item }) => <SightingCard sighting={item} now={now} onVote={vote} />}
        ListEmptyComponent={
          <View className="items-center pt-24">
            <Text className="text-neutral-500">
              {error ?? 'Nothing spotted nearby in the last 45 minutes.'}
            </Text>
          </View>
        }
      />
      <ReportFab />
    </View>
  );
}