import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';

MapboxGL.setAccessToken(Constants.expoConfig?.extra?.mapboxPublicToken ?? '');
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/context/auth';
import { ActiveTripProvider } from '@/context/active-trip';
import { useTimeScheme } from '@/hooks/use-time-scheme';
import { cancelTrip, getTrip } from '@/lib/api';
import { ACTIVE_TRIP_KEY, stopLocationTracking } from '@/lib/location-task';
import { clearTrip } from '@/lib/telemetry-queue';

// Side-effect: defines TRIP_LOCATION_TASK at module scope (required by expo-task-manager)
import '@/lib/location-task';

MapboxGL.setAccessToken(
  (Constants.expoConfig?.extra?.mapboxPublicToken as string | undefined) ?? '',
);

export const unstable_settings = {
  anchor: '(tabs)',
};

function useOrphanTripRecovery() {
  useEffect(() => {
    (async () => {
      const id = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
      if (!id) return;
      try {
        const trip = await getTrip(id);
        if (trip.status !== 'active') {
          await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
          await clearTrip(id);
          await stopLocationTracking();
          return;
        }
        Alert.alert(
          'Unfinished trip',
          'You have a trip that was not ended. Cancel it now?',
          [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Cancel trip',
              style: 'destructive',
              onPress: async () => {
                // Orphan recovery: we don't have an accurate distance/duration
                // anymore (state was lost when the app died). Pass zeros so the
                // backend triggers the discard branch and hard-deletes the trip.
                try {
                  await cancelTrip(id, {
                    ended_at: new Date().toISOString(),
                    distance_km: 0,
                    duration_sec: 0,
                  });
                } catch (e) {
                  console.warn('[orphan] cancel failed', (e as Error).message);
                }
                await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
                await clearTrip(id);
                await stopLocationTracking();
              },
            },
          ],
        );
      } catch (e) {
        console.warn('[orphan] getTrip failed', (e as Error).message);
        await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
        await clearTrip(id);
        await stopLocationTracking();
      }
    })();
  }, []);
}

export default function RootLayout() {
  const colorScheme = useTimeScheme();
  useOrphanTripRecovery();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ActiveTripProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="route-select" options={{ headerShown: false }} />
              <Stack.Screen name="my-vehicles" options={{ headerShown: false }} />
              <Stack.Screen name="trip-detail" options={{ headerShown: false }} />
              <Stack.Screen
                name="navigate"
                options={{ headerShown: false, animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ActiveTripProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
