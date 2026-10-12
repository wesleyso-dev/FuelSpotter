import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { BRANDS, BRAND_KEYS, type BrandKey } from '../constants/brands';
import { uploadSighting } from '../utils/uploadSighting';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

interface Captured {
  uri: string;
  latitude: number;
  longitude: number;
  address: string;
  capturedAt: string;
}

const MAX_ACCURACY_METERS = 75;
const GPS_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Reverse-geocode to "123 Main St, Berkeley, CA"; fall back to raw coords. */
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
  const [locGranted, setLocGranted] = useState<boolean | null>(null);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [brand, setBrand] = useState<BrandKey | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask for location up front so the GPS isn't cold when the shutter fires.
  useEffect(() => {
    if (!visible) return;
    Location.requestForegroundPermissionsAsync().then(({ status }) => setLocGranted(status === 'granted'));
  }, [visible]);

  const reset = () => { setCaptured(null); setBrand(null); setError(null); setSubmitting(false); };
  const close = () => { reset(); onClose(); };

  const handleShutter = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setError(null);
    try {
      // Timestamp is taken at the moment of capture, not at submit time.
      const capturedAt = new Date().toISOString();

      // Photo and GPS fix run in parallel so the shutter feels instant.
      const [photo, position] = await Promise.all([
        cameraRef.current.takePictureAsync({ quality: 0.6, exif: false }),
        withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
          GPS_TIMEOUT_MS,
          'Could not get a GPS fix. Try again with a clear view of the sky.',
        ),
      ]);
      if (!photo?.uri) throw new Error('Camera returned no photo.');

      // Android flags spoofed locations; reject them.
      if (position.mocked) throw new Error('Mock locations are not allowed.');

      const acc = position.coords.accuracy ?? Infinity;
      if (acc > MAX_ACCURACY_METERS) {
        throw new Error(`GPS is too rough (±${Math.round(acc)} m). Wait a moment and retry.`);
      }

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
    if (!captured || !brand) return;
    setSubmitting(true);
    setError(null);
    const result = await uploadSighting({
      photoUri: captured.uri,
      brand,
      latitude: captured.latitude,
      longitude: captured.longitude,
      address: captured.address,
      capturedAt: captured.capturedAt,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    reset();
    onSubmitted();
  };

  // ── Permission gates ──
  const needsPermission = !camPerm?.granted || locGranted === false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View className="flex-1 bg-black">
        {needsPermission ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="mb-2 text-center text-lg font-semibold text-white">
              Camera and location needed
            </Text>
            <Text className="mb-6 text-center text-neutral-400">
              Sightings are live photos tagged with where you are right now. No camera, no report.
            </Text>
            {camPerm && !camPerm.granted && camPerm.canAskAgain ? (
              <Pressable className="rounded-full bg-white px-6 py-3" onPress={requestCamPerm}>
                <Text className="font-semibold">Allow camera</Text>
              </Pressable>
            ) : (
              <Pressable className="rounded-full bg-white px-6 py-3" onPress={() => Linking.openSettings()}>
                <Text className="font-semibold">Open Settings</Text>
              </Pressable>
            )}
            <Pressable className="mt-4 p-3" onPress={close}>
              <Text className="text-neutral-400">Cancel</Text>
            </Pressable>
          </View>
        ) : !captured ? (
          // ── Live viewfinder ──
          <View className="flex-1">
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <Pressable className="absolute left-5 top-14 rounded-full bg-black/50 px-4 py-2" onPress={close}>
              <Text className="text-white">Close</Text>
            </Pressable>
            {error && (
              <View className="absolute left-5 right-5 top-28 rounded-xl bg-red-600/90 p-3">
                <Text className="text-white">{error}</Text>
              </View>
            )}
            <View className="absolute bottom-12 w-full items-center">
              <Pressable
                onPress={handleShutter}
                disabled={capturing}
                className="h-20 w-20 items-center justify-center rounded-full border-4 border-white"
              >
                {capturing
                  ? <ActivityIndicator color="#fff" />
                  : <View className="h-14 w-14 rounded-full bg-white" />}
              </Pressable>
            </View>
          </View>
        ) : (
          // ── Review + brand selection ──
          <View className="flex-1 bg-white">
            <Image source={{ uri: captured.uri }} className="h-[45%] w-full" resizeMode="cover" />
            <View className="flex-1 px-5 pt-4">
              <Text className="text-base font-semibold">{captured.address}</Text>
              <Text className="mb-4 text-neutral-500">
                {new Date(captured.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' · '}
                {captured.latitude.toFixed(4)}, {captured.longitude.toFixed(4)}
              </Text>

              <Text className="mb-2 font-medium">Which brand?</Text>
              <View className="flex-row flex-wrap gap-2">
                {BRAND_KEYS.map((k) => {
                  const selected = brand === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setBrand(k)}
                      style={{ backgroundColor: selected ? BRANDS[k].color : '#F4F4F5' }}
                      className="rounded-full px-4 py-2"
                    >
                      <Text style={{ color: selected ? BRANDS[k].text : '#18181B' }} className="font-medium">
                        {BRANDS[k].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {error && <Text className="mt-4 text-red-600">{error}</Text>}

              <View className="mt-auto flex-row gap-3 pb-10">
                <Pressable
                  className="flex-1 items-center rounded-full bg-neutral-100 py-4"
                  onPress={() => { setCaptured(null); setError(null); }}
                  disabled={submitting}
                >
                  <Text className="font-semibold">Retake</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 items-center rounded-full py-4 ${brand && !submitting ? 'bg-black' : 'bg-neutral-300'}`}
                  onPress={handleSubmit}
                  disabled={!brand || submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text className="font-semibold text-white">Post sighting</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}