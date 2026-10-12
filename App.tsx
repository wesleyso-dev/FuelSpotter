import './global.css';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { SightingsProvider } from './context/SightingsContext';
import { ProfileProvider } from './context/ProfileContext';
import OnboardingScreen from './screens/OnboardingScreen';
import AuthScreen from './screens/AuthScreen';
import MapScreen from './screens/MapScreen';
import FeedScreen from './screens/FeedScreen';
import ProfileScreen from './screens/ProfileScreen';

const ONBOARDED_KEY = 'fuelspotter.onboarded.v1';
const Tab = createBottomTabNavigator();
const ICONS = { Map: 'map', Nearby: 'list', Profile: 'flame' } as const;

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Auth listener: sign-in, sign-out and token refresh all flow through here.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    (async () => {
      const [flag, { data }] = await Promise.all([AsyncStorage.getItem(ONBOARDED_KEY), supabase.auth.getSession()]);
      setOnboarded(flag === '1');
      setSession(data.session);
      setReady(true);
    })();
    return () => subscription.unsubscribe();
  }, []);

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    setOnboarded(true);
  };

  let content: React.ReactNode;
  if (!ready) {
    content = <View className="flex-1 items-center justify-center bg-neutral-950"><ActivityIndicator color="#A3E635" /></View>;
  } else if (!onboarded) {
    content = <OnboardingScreen onDone={finishOnboarding} />;
  } else if (!session) {
    content = <AuthScreen />;
  } else {
    // Providers mount only while signed in, so all state resets on sign-out.
    content = (
      <SightingsProvider>
        <ProfileProvider>
          <NavigationContainer>
            <Tab.Navigator
              screenOptions={({ route }) => ({
                headerShown: route.name === 'Nearby',
                tabBarActiveTintColor: '#111',
                tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name as keyof typeof ICONS]} size={size} color={color} />,
              })}
            >
              <Tab.Screen name="Map" component={MapScreen} />
              <Tab.Screen name="Nearby" component={FeedScreen} />
              <Tab.Screen name="Profile" component={ProfileScreen} />
            </Tab.Navigator>
          </NavigationContainer>
        </ProfileProvider>
      </SightingsProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {content}
      <StatusBar style={ready && onboarded && session ? 'dark' : 'light'} />
    </SafeAreaProvider>
  );
}