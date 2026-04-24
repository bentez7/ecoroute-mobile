import { MapboxNavigationView } from '@badatgil/expo-mapbox-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { FeedbackBanner } from '@/components/feedback-banner';
import { useActiveTrip } from '@/context/active-trip';
import { type RouteLabel } from '@/lib/api';
import {
  decode,
  haversineMeters,
  sampleWaypoints,
  toLatLngObjects,
  type LatLng,
  type LatLngObject,
} from '@/lib/polyline';

// Mapbox Map Matching API caps a single request at 100 coordinates.
const MATCH_MAX_COORDS = 100;

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
    vehicleId?: string;
    fuelType?: string;
  }>();

  const decoded = useMemo(() => decode(params.polyline ?? ''), [params.polyline]);
  const isValid = hasMeaningfulSpan(decoded);

  const coordinates = useMemo<LatLngObject[]>(
    () => (isValid ? toLatLngObjects(sampleWaypoints(decoded, MATCH_MAX_COORDS)) : []),
    [decoded, isValid],
  );

  const dest = useMemo(
    () => ({ lat: Number(params.destLat), lng: Number(params.destLng) }),
    [params.destLat, params.destLng],
  );

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
          vehicleId: params.vehicleId,
          fuelType: params.fuelType,
        });
      } catch (err) {
        console.warn('[navigate] start trip failed', (err as Error).message);
      }
    })();
  }, [isValid, coordinates, dest, params, start]);

  useEffect(() => {
    return () => {
      if (!arrivedRef.current && tripId) {
        void cancel();
      }
    };
  }, [tripId, cancel]);

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

  const handleRoutesLoaded = useCallback(
    (evt: { nativeEvent: { routes: { mainRoute: { distance: number; legs: { steps: { shape?: { coordinates: { latitude: number; longitude: number }[] } }[] }[] } } } }) => {
      const main = evt.nativeEvent.routes.mainRoute;
      console.log('[navigate] routes loaded', {
        legs: main.legs.length,
        matched_distance_m: Math.round(main.distance),
        matched_steps: main.legs.reduce((acc, l) => acc + l.steps.length, 0),
        backend_points: decoded.length,
        waypoints_sent: coordinates.length,
      });
    },
    [decoded.length, coordinates.length],
  );

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
        useRouteMatchingApi={true}
        initialLocation={initialLocation}
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
