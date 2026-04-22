import { MapboxNavigationView } from '@badatgil/expo-mapbox-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { FeedbackBanner } from '@/components/feedback-banner';
import { useActiveTrip } from '@/context/active-trip';
import { searchRoutes, type RouteLabel } from '@/lib/api';
import {
  decode,
  haversineMeters,
  sampleWaypoints,
  toLatLngObjects,
  type LatLng,
  type LatLngObject,
} from '@/lib/polyline';

const REPLAN_COOLDOWN_MS = 15_000;
const REPLAN_CAP = 3;
const MAP_MATCHING_MAX_COORDS = 25;

function decodeAndSample(encoded: string): LatLngObject[] {
  const decoded = decode(encoded);
  const sampled = sampleWaypoints(decoded, MAP_MATCHING_MAX_COORDS);
  return toLatLngObjects(sampled);
}

function hasMeaningfulSpan(coords: LatLng[]): boolean {
  if (coords.length < 2) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return haversineMeters(first, last) > 100;
}

export default function NavigateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    polyline: string;
    label: RouteLabel;
    destLat: string;
    destLng: string;
    originLat?: string;
    originLng?: string;
    destAddress?: string;
    originAddress?: string;
  }>();

  const decoded = useMemo(() => decode(params.polyline ?? ''), [params.polyline]);
  const isValid = hasMeaningfulSpan(decoded);

  const [coordinates, setCoordinates] = useState<LatLngObject[]>(() =>
    isValid ? toLatLngObjects(sampleWaypoints(decoded, MAP_MATCHING_MAX_COORDS)) : [],
  );

  const dest = useMemo(
    () => ({ lat: Number(params.destLat), lng: Number(params.destLng) }),
    [params.destLat, params.destLng],
  );

  const lastReplanAtRef = useRef(0);
  const replanCountRef = useRef(0);
  const replanningRef = useRef(false);

  const { tripId, start, end, cancel, feedback, dismissFeedback } = useActiveTrip();
  const tripStartAttemptedRef = useRef(false);
  const arrivedRef = useRef(false);

  useEffect(() => {
    if (!isValid || coordinates.length < 2) return;
    if (tripStartAttemptedRef.current) return;
    tripStartAttemptedRef.current = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }).catch(() => null);

        const originLat = loc?.coords.latitude ?? Number(params.originLat) ?? coordinates[0].latitude;
        const originLng = loc?.coords.longitude ?? Number(params.originLng) ?? coordinates[0].longitude;

        await start({
          originLat,
          originLng,
          destLat: dest.lat,
          destLng: dest.lng,
          originAddress: params.originAddress,
          destAddress: params.destAddress,
          routePolyline: params.polyline,
        });
      } catch (err) {
        console.warn('[navigate] start trip failed', (err as Error).message);
      }
    })();
  }, [isValid, coordinates, dest, params, start]);

  useEffect(() => {
    return () => {
      // If user backed out of the screen without arrival/cancel buttons firing,
      // ensure the trip is cancelled to avoid orphans.
      if (!arrivedRef.current && tripId) {
        void cancel();
      }
    };
  }, [tripId, cancel]);

  const handleOffRoute = useCallback(async () => {
    if (replanningRef.current) return;
    if (Date.now() - lastReplanAtRef.current < REPLAN_COOLDOWN_MS) return;
    if (replanCountRef.current >= REPLAN_CAP) return;

    replanningRef.current = true;
    lastReplanAtRef.current = Date.now();
    replanCountRef.current += 1;

    Speech.speak('Recalculating');

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const options = await searchRoutes({
        origin_lat: loc.coords.latitude,
        origin_lng: loc.coords.longitude,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
      });
      const preferred =
        options.find((o) => o.label === params.label) ?? options[0];
      if (!preferred) return;
      const fresh = decodeAndSample(preferred.polyline);
      if (fresh.length >= 2) setCoordinates(fresh);
    } catch (err) {
      console.warn('[navigate] backend replan failed', err);
    } finally {
      replanningRef.current = false;
    }
  }, [dest, params.label]);

  const handleArrival = useCallback(async () => {
    arrivedRef.current = true;
    try {
      await end();
    } catch (err) {
      console.warn('[navigate] end trip failed', (err as Error).message);
    }
    router.back();
  }, [end, router]);

  const handleCancel = useCallback(async () => {
    arrivedRef.current = true;
    try {
      await cancel();
    } catch (err) {
      console.warn('[navigate] cancel trip failed', (err as Error).message);
    }
    router.back();
  }, [cancel, router]);

  const handleRouteFailed = useCallback(
    (evt: { nativeEvent: { errorMessage: string } }) => {
      console.warn('[navigate] route failed to load', evt.nativeEvent.errorMessage);
    },
    [],
  );

  const handleRoutesLoaded = useCallback(() => {
    console.log('[navigate] routes loaded');
  }, []);

  const initialLocation = useMemo(() => {
    const lat = Number(params.originLat);
    const lng = Number(params.originLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng, zoom: 15 };
    }
    if (coordinates.length > 0) {
      return { latitude: coordinates[0].latitude, longitude: coordinates[0].longitude, zoom: 15 };
    }
    return undefined;
  }, [params.originLat, params.originLng, coordinates]);

  const waypointIndices = useMemo(
    () => [0, coordinates.length - 1],
    [coordinates.length],
  );

  if (!isValid || coordinates.length < 2) {
    return (
      <SafeAreaView style={styles.errorWrap}>
        <MaterialIcons color="#DC2626" name="error-outline" size={48} />
        <Text style={styles.errorTitle}>Invalid route</Text>
        <Text style={styles.errorText}>
          The route returned by the server is too short to navigate.
          Please try a different destination.
        </Text>
        <Pressable style={styles.errorBtn} onPress={() => router.back()}>
          <Text style={styles.errorBtnText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapboxNavigationView
        style={StyleSheet.absoluteFill}
        coordinates={coordinates}
        waypointIndices={waypointIndices}
        useRouteMatchingApi
        initialLocation={initialLocation}
        onUserOffRoute={handleOffRoute}
        onFinalDestinationArrival={handleArrival}
        onCancelNavigation={handleCancel}
        onRouteFailedToLoad={handleRouteFailed}
        onRoutesLoaded={handleRoutesLoaded}
      />
      <FeedbackBanner items={feedback} onDismiss={dismissFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  errorText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  errorBtn: {
    marginTop: 16,
    backgroundColor: '#1B2B45',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBtnText: { color: '#FFFFFF', fontWeight: '700' },
});
