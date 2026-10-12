import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SightingsProvider } from './context/SightingsContext';
import MapScreen from './screens/MapScreen';
import FeedScreen from './screens/FeedScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <SightingsProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              tabBarActiveTintColor: '#111',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={route.name === 'Map' ? 'map' : 'list'} size={size} color={color} />
              ),
            })}
          >
            <Tab.Screen name="Map" component={MapScreen} options={{ headerShown: false }} />
            <Tab.Screen name="Nearby" component={FeedScreen} options={{ title: 'Nearby' }} />
          </Tab.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </SightingsProvider>
    </SafeAreaProvider>
  );
}