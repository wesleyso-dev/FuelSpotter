// components/ReportModal.tsx
import React, { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { useSightings } from '../context/SightingsContext';
import type { ReportReason } from '../types/sighting';

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'not_here', label: "The vehicle isn't here anymore" },
  { key: 'fake', label: 'Fake or unrelated photo' },
  { key: 'wrong_brand', label: 'Wrong brand' },
];

interface Props { visible: boolean; sightingId: string; onClose: () => void }

export function ReportModal({ visible, sightingId, onClose }: Props) {
  const { report } = useSightings();
  const [busy, setBusy] = useState(false);

  const submit = async (reason: ReportReason) => {
    setBusy(true);
    const err = await report(sightingId, reason);
    setBusy(false);
    onClose();
    if (err) Alert.alert("Couldn't report", err);
    else Alert.alert('Thanks', 'Three reports from different people take a pin off the map.');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable className="rounded-t-3xl bg-white p-5 pb-10">
          <Text className="mb-3 text-lg font-semibold">What's wrong with this pin?</Text>
          {REASONS.map((r) => (
            <Pressable
              key={r.key}
              disabled={busy}
              onPress={() => submit(r.key)}
              className="mb-2 rounded-xl bg-neutral-100 px-4 py-4"
            >
              <Text className="font-medium">{r.label}</Text>
            </Pressable>
          ))}
          <Pressable className="mt-2 items-center py-3" onPress={onClose}>
            <Text className="text-neutral-500">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}