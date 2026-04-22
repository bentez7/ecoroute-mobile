import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import MapboxGL from '@rnmapbox/maps';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

MapboxGL.setAccessToken(
  (Constants.expoConfig?.extra?.mapboxPublicToken as string | undefined) ?? '',
);

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen
            name="navigate"
            options={{ headerShown: false, animation: 'slide_from_bottom' }}
          />
          {/* DEV-ONLY: remove with app/dev-navigate.tsx when done */}
          <Stack.Screen
            name="dev-navigate"
            options={{ headerShown: false, animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
