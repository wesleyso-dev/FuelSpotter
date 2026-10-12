// screens/AuthScreen.tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { sendEmailOtp, signInWithApple, signInWithGoogle, verifyEmailOtp } from '../lib/auth';

type Busy = 'email' | 'code' | 'apple' | 'google' | null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => { AppleAuthentication.isAvailableAsync().then(setAppleAvailable); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // On success, App.tsx's auth listener swaps this screen out. No navigation call needed.
  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(null); }
  };

  const sendCode = () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) return setError('Enter a valid email address.');
    run('email', async () => { await sendEmailOtp(trimmed); setStep('code'); setCooldown(30); });
  };

  const verify = (value: string) =>
    run('code', async () => {
      try { await verifyEmailOtp(email.trim().toLowerCase(), value); }
      catch (e) { setCode(''); throw e; }
    });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-neutral-950">
      <View className="flex-1 justify-center px-8">
        <Text className="mb-2 text-4xl font-bold text-white">FuelSpotter</Text>
        <Text className="mb-10 text-lg text-neutral-400">Sign in to see what's parked near you.</Text>

        {step === 'email' ? (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.edu"
              placeholderTextColor="#737373"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              className="mb-3 rounded-2xl bg-neutral-900 px-5 py-4 text-base text-white"
            />
            <Pressable onPress={sendCode} disabled={busy !== null} className="items-center rounded-full bg-lime-400 py-4">
              {busy === 'email' ? <ActivityIndicator color="#000" /> : <Text className="font-bold text-black">Email me a code</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mb-3 text-neutral-400">Enter the 6-digit code we sent to {email.trim().toLowerCase()}.</Text>
            <TextInput
              value={code}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (digits.length === 6) verify(digits);
              }}
              placeholder="123456"
              placeholderTextColor="#737373"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              className="mb-3 rounded-2xl bg-neutral-900 px-5 py-4 text-center text-2xl tracking-[8px] text-white"
            />
            {busy === 'code' && <ActivityIndicator color="#A3E635" />}
            <View className="mt-4 flex-row justify-between">
              <Pressable onPress={() => { setStep('email'); setCode(''); setError(null); }}><Text className="text-neutral-400">Change email</Text></Pressable>
              <Pressable disabled={cooldown > 0 || busy !== null} onPress={sendCode}>
                <Text className={cooldown > 0 ? 'text-neutral-600' : 'text-lime-400'}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</Text>
              </Pressable>
            </View>
          </>
        )}

        {error && <Text className="mt-4 text-red-400">{error}</Text>}

        {step === 'email' && (
          <>
            <View className="my-8 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-neutral-800" />
              <Text className="text-neutral-500">or</Text>
              <View className="h-px flex-1 bg-neutral-800" />
            </View>

            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={999}
                style={{ height: 52, marginBottom: 12 }}
                onPress={() => run('apple', signInWithApple)}
              />
            )}
            <Pressable onPress={() => run('google', signInWithGoogle)} disabled={busy !== null} className="flex-row items-center justify-center gap-3 rounded-full bg-white py-4">
              {busy === 'google' ? <ActivityIndicator color="#000" /> : (
                <>
                  <Ionicons name="logo-google" size={18} color="#000" />
                  <Text className="font-semibold text-black">Continue with Google</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}