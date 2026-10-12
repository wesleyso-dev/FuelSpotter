// components/LiveCameraModal.tsx (replaces v1)
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { BRANDS, type BrandKey } from '../constants/brands';
import { useProfile } from '../context/ProfileContext';
import { uploadSighting } from '../utils/uploadSighting';
import { Countdown } from './Countdown';

interface Props { visible: boolean; onClose: () => void; onSubmitted: () => void }
interface Captured { uri: string; latitude: number; longitude: number; address: string; capturedAt: string }

const MAX_ACCURACY_METERS = 75;
const GPS_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function resolveAddress(lat: number, lng: number): Promise<string> {
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (p) {
      const street = [p.streetNumber, p.street].filter(Boolean).join(' ');
      const parts = [street || p.name, p.city ?? p.subregion, p.region].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
  } catch { /* geocoder is best-effort */ }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function LiveCameraModal({ visible, onClose, onSubmitted }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const { profile, refetch: refetchProfile } = useProfile();
  const [locGranted, setLocGranted] = useState<boolean | null>(null);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ brand: BrandKey; streak: number } | null>(null);

  // On open: ask for location and refresh the profile so the daily limit is current.
  useEffect(() => {
    if (!visible) return;
    refetchProfile();
    Location.requestForegroundPermissionsAsync().then(({ status }) => setLocGranted(status === 'granted'));
  }, [visible, refetchProfile]);

  const reset = () => { setCaptured(null); setError(null); setSubmitting(false); setDone(null); };
  const close = () => { reset(); onClose(); };

  // Frontend half of the 1-photo/day rule; the DB enforces it too.
  const nextAt = profile?.next_sighting_at ? Date.parse(profile.next_sighting_at) : null;
  const blocked = nextAt !== null && nextAt > Date.now();

  const handleShutter = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      const capturedAt = new Date().toISOString(); // taken at the moment of capture
      const [photo, position] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.6, exif: false }),
        withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
          GPS_TIMEOUT_MS,
          'Could not get a GPS fix. Try again with a clear view of the sky.',
        ),
      ]);
      if (!photo?.uri) throw new Error('Camera returned no photo.');
      if (position.mocked) throw new Error('Mock locations are not allowed.');
      const acc = position.coords.accuracy ?? Infinity;
      if (acc > MAX_ACCURACY_METERS) throw new Error(`GPS is too rough (±${Math.round(acc)} m). Wait a moment and retry.`);

      const { latitude, longitude } = position.coords;
      const address = await resolveAddress(latitude, longitude);
      setCaptured({ uri: photo.uri, latitude, longitude, address, capturedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed.');
    } finally {
      setCapturing(false);
    }
  };

  const handleSubmit = async () => {
    if (!captured) return;
    setSubmitting(true);
    setError(null);
    const result = await uploadSighting({
      photoUri: captured.uri,
      latitude: captured.latitude,
      longitude: captured.longitude,
      address: captured.address,
      capturedAt: captured.capturedAt,
    });
    setSubmitting(false);

    if (result.ok) {
      setDone({ brand: result.brand, streak: result.streakCount });
      refetchProfile();
      return;
    }
    if (result.code === 'daily_limit') {   // server says we're capped: show the limit screen
      await refetchProfile();
      setCaptured(null);
      return;
    }
    setError(result.message);
  };

  const needsPermission = !camPerm?.granted || locGranted === false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View className="flex-1 bg-black">
        {needsPermission ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="mb-2 text-center text-lg font-semibold text-white">Camera and location needed</Text>
            <Text className="mb-6 text-center text-neutral-400">
              Sightings are live photos tagged with where you are right now.
            </Text>
            <Pressable
              className="rounded-full bg-white px-6 py-3"
              onPress={camPerm && !camPerm.granted && camPerm.canAskAgain ? requestCamPerm : () => Linking.openSettings()}
            >
              <Text className="font-semibold">{camPerm && !camPerm.granted && camPerm.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
            </Pressable>
            <Pressable className="mt-4 p-3" onPress={close}><Text className="text-neutral-400">Cancel</Text></Pressable>
          </View>
        ) : done ? (
          <View className="flex-1 items-center justify-center bg-neutral-950 px-8">
            <Text className="mb-2 text-3xl font-bold text-white">Verified</Text>
            <Text className="mb-1 text-center text-lg text-neutral-300">{BRANDS[done.brand].label} vehicle is on the map.</Text>
            <Text className="mb-8 text-center text-lime-400">Streak: {done.streak} {done.streak === 1 ? 'day' : 'days'}</Text>
            <Pressable className="rounded-full bg-white px-8 py-4" onPress={() => { reset(); onSubmitted(); }}>
              <Text className="font-semibold">Done</Text>
            </Pressable>
          </View>
        ) : blocked && nextAt ? (
          <View className="flex-1 items-center justify-center bg-neutral-950 px-8">
            <Text className="mb-2 text-center text-2xl font-bold text-white">One sighting a day</Text>
            <Text className="mb-4 text-center text-neutral-400">You can post again in</Text>
            <Countdown until={nextAt} className="mb-6 text-5xl font-bold text-lime-400" />
            <Text className="mb-8 text-center text-neutral-500">Post within 48 hours of your last one to keep your streak.</Text>
            <Pressable className="rounded-full bg-white px-8 py-4" onPress={close}><Text className="font-semibold">Back to the map</Text></Pressable>
          </View>
        ) : !captured ? (
          <View className="flex-1">
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <Pressable className="absolute left-5 top-14 rounded-full bg-black/50 px-4 py-2" onPress={close}>
              <Text className="text-white">Close</Text>
            </Pressable>
            {error && (
              <View className="absolute left-5 right-5 top-28 rounded-xl bg-red-600/90 p-3"><Text className="text-white">{error}</Text></View>
            )}
            <View className="absolute bottom-12 w-full items-center">
              <Text className="mb-4 text-white/80">Get the whole vehicle and its logo in frame</Text>
              <Pressable onPress={handleShutter} disabled={capturing} className="h-20 w-20 items-center justify-center rounded-full border-4 border-white">
                {capturing ? <ActivityIndicator color="#fff" /> : <View className="h-14 w-14 rounded-full bg-white" />}
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-1 bg-white">
            <Image source={{ uri: captured.uri }} className="h-[50%] w-full" resizeMode="cover" />
            <View className="flex-1 px-5 pt-4">
              <Text className="text-base font-semibold">{captured.address}</Text>
              <Text className="mb-4 text-neutral-500">
                {new Date(captured.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Text className="text-neutral-500">
                We'll check the photo for a branded promo vehicle before it goes on the map. You only get one post per day.
              </Text>
              {error && <Text className="mt-4 text-red-600">{error}</Text>}

              <View className="mt-auto flex-row gap-3 pb-10">
                <Pressable className="flex-1 items-center rounded-full bg-neutral-100 py-4" onPress={() => { setCaptured(null); setError(null); }} disabled={submitting}>
                  <Text className="font-semibold">Retake</Text>
                </Pressable>
                <Pressable className={`flex-1 items-center rounded-full py-4 ${submitting ? 'bg-neutral-300' : 'bg-black'}`} onPress={handleSubmit} disabled={submitting}>
                  {submitting ? (
                    <View className="flex-row items-center gap-2"><ActivityIndicator color="#fff" /><Text className="font-semibold text-white">Checking photo…</Text></View>
                  ) : <Text className="font-semibold text-white">Submit</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}