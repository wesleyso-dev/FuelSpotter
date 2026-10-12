import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiveCameraModal } from './LiveCameraModal';
import { useSightings } from '../context/SightingsContext';

export function ReportFab() {
  const [open, setOpen] = useState(false);
  const { refetch } = useSightings();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="absolute bottom-6 right-5 flex-row items-center gap-2 rounded-full bg-black px-5 py-4"
      >
        <Ionicons name="camera" size={20} color="#fff" />
        <Text className="font-semibold text-white">Report</Text>
      </Pressable>
      <LiveCameraModal
        visible={open}
        onClose={() => setOpen(false)}
        onSubmitted={() => { setOpen(false); refetch(); }}
      />
    </>
  );
}