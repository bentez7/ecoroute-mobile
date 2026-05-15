import { MapboxNavigationView } from '@badatgil/expo-mapbox-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { FeedbackBanner } from '@/components/feedback-banner';
import { useActiveTrip } from '@/context/active-trip';
import { searchRoutes, type RouteLabel } from '@/lib/api';
import { consumePendingDirectionsJson } from '@/lib/pending-route';
import { synthesizeDirectionsResponse } from '@/lib/synth-directions';
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
    destName?: string;
    originAddress?: string;
    vehicleId?: string;
    fuelType?: string;
  }>();

  // Active polyline + directions JSON. Seeded from route-select on mount; both
  // get replaced when the user goes off-route and we refetch from our backend.
  const [activePolyline, setActivePolyline] = useState<string>(params.polyline ?? '');
  const [directionsJson, setDirectionsJson] = useState<string | undefined>(() => {
    const json = consumePendingDirectionsJson();
    const stringified = json ? JSON.stringify(json) : undefined;
    console.log('[navigate] consumed pending directionsJson; bytes=', stringified?.length ?? 0);
    return stringified;
  });

  const decoded = useMemo(() => decode(activePolyline), [activePolyline]);

  console.log(
    '[navigate] decoded coords=', decoded.length,
    'first=', decoded[0],
    'last=', decoded[decoded.length - 1],
  );

  const isValid = hasMeaningfulSpan(decoded);

  const dest = useMemo(
    () => ({ lat: Number(params.destLat), lng: Number(params.destLng) }),
    [params.destLat, params.destLng],
  );

  const coordinates = useMemo<LatLngObject[]>(() => {
    if (!isValid) return [];
    const sampled = toLatLngObjects(sampleWaypoints(decoded, MATCH_MAX_COORDS));
    // Force the final waypoint to the user-selected destination so Map
    // Matching ends where the user tapped (e.g. Monash), not where RouteE
    // Compass's graph snapped the polyline to (e.g. an adjacent car park).
    if (sampled.length > 0 && Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) {
      sampled[sampled.length - 1] = { latitude: dest.lat, longitude: dest.lng };
    }
    return sampled;
  }, [decoded, isValid, dest.lat, dest.lng]);

  const { tripId, start, end, cancel, feedback, dismissFeedback } = useActiveTrip();
  const tripStartAttemptedRef = useRef(false);
  const arrivedRef = useRef(false);

  const ARRIVAL_AUTO_DISMISS_SEC = 8;
  const [arrived, setArrived] = useState(false);
  const [arrivalCountdown, setArrivalCountdown] = useState(ARRIVAL_AUTO_DISMISS_SEC);

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
          destName: params.destName,
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

  const goHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleArrival = useCallback(async () => {
    arrivedRef.current = true;
    setArrived(true);
    setArrivalCountdown(ARRIVAL_AUTO_DISMISS_SEC);
    try {
      await end();
    } catch (err) {
      console.warn('[navigate] end trip failed', (err as Error).message);
    }
  }, [end]);

  // Countdown ticker for the arrival overlay; auto-dismiss to home at 0.
  useEffect(() => {
    if (!arrived) return;
    if (arrivalCountdown <= 0) {
      goHome();
      return;
    }
    const t = setTimeout(() => setArrivalCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [arrived, arrivalCountdown, goHome]);

  const handleCancel = useCallback(async () => {
    arrivedRef.current = true;
    try {
      await cancel();
    } catch (err) {
      console.warn('[navigate] cancel trip failed', (err as Error).message);
    }
    router.replace('/(tabs)');
  }, [cancel, router]);

  const handleRouteFailed = useCallback(
    (evt: { nativeEvent: { errorMessage: string } }) => {
      console.warn('[navigate] route failed to load', evt.nativeEvent.errorMessage);
    },
    [],
  );

  // Lock + cooldown so a continuously-firing off-route signal doesn't spam
  // /routes/search. 5s is enough to absorb GPS jitter without making the
  // user wait forever for a fresh route once they've truly diverged.
  const refetchInFlightRef = useRef(false);
  const lastRefetchAtRef = useRef(0);

  const handleUserOffRoute = useCallback(async () => {
    if (refetchInFlightRef.current) return;
    if (Date.now() - lastRefetchAtRef.current < 5000) return;
    refetchInFlightRef.current = true;

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch(() => null);
      if (!loc) {
        console.warn('[navigate] off-route: no GPS fix, skipping refetch');
        return;
      }

      console.warn('[navigate] off-route — refetching route from backend', {
        gps: { lat: loc.coords.latitude, lng: loc.coords.longitude },
        dest: { lat: dest.lat, lng: dest.lng },
      });

      const results = await searchRoutes({
        origin_lat: loc.coords.latitude,
        origin_lng: loc.coords.longitude,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
      });

      const picked = results.find((r) => r.label === params.label) ?? results[0];
      if (!picked) {
        console.warn('[navigate] off-route: backend returned no routes');
        return;
      }

      let json: Record<string, unknown> | null = picked.directions_json;
      if (!json) {
        try {
          json = synthesizeDirectionsResponse({
            polyline:    picked.polyline,
            distanceM:   picked.distance_km * 1000,
            durationSec: picked.duration_sec,
            destLat:     dest.lat,
            destLng:     dest.lng,
          });
        } catch (e) {
          console.warn('[navigate] off-route: synth failed', (e as Error).message);
          return;
        }
      }

      const stringified = JSON.stringify(json);
      console.log('[navigate] off-route: applying new route', {
        label: picked.label,
        distance_km: picked.distance_km,
        duration_sec: picked.duration_sec,
        bytes: stringified.length,
      });

      setActivePolyline(picked.polyline);
      setDirectionsJson(stringified);
      lastRefetchAtRef.current = Date.now();
    } catch (e) {
      console.warn('[navigate] off-route refetch failed', (e as Error).message);
    } finally {
      refetchInFlightRef.current = false;
    }
  }, [dest.lat, dest.lng, params.label]);

  const handleRouteChanged = useCallback(() => {
    console.warn('[navigate] DID REROUTE — SDK swapped to a new route');
  }, []);

  // One-shot diagnostic: at mount, compare current GPS to the route's first
  // vertex. If distance is >30–50 m, the SDK will fire an off-route reroute
  // as soon as nav starts.
  useEffect(() => {
    if (decoded.length === 0) return;
    (async () => {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch(() => null);
      if (!loc) {
        console.log('[navigate] reroute-diag: no GPS fix available');
        return;
      }
      const start = decoded[0];
      const end = decoded[decoded.length - 1];
      const distStartM = haversineMeters(
        [loc.coords.latitude, loc.coords.longitude],
        start,
      );
      console.log('[navigate] reroute-diag', {
        gps: { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy_m: Math.round(loc.coords.accuracy ?? -1) },
        route_start: { lat: start[0], lng: start[1] },
        route_end: { lat: end[0], lng: end[1] },
        gps_to_route_start_m: Math.round(distStartM),
        likely_to_reroute: distStartM > 30,
      });
    })();
  }, [decoded]);

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
        directionsJson={directionsJson}
        initialLocation={initialLocation}
        onFinalDestinationArrival={handleArrival}
        onCancelNavigation={handleCancel}
        onRouteFailedToLoad={handleRouteFailed}
        onRoutesLoaded={handleRoutesLoaded}
        onUserOffRoute={handleUserOffRoute}
        onRouteChanged={handleRouteChanged}
      />
      <FeedbackBanner items={feedback} onDismiss={dismissFeedback} />

      {arrived && (
        <View style={styles.arrivedOverlay} pointerEvents="box-none">
          <SafeAreaView edges={['bottom']} style={styles.arrivedSafe} pointerEvents="box-none">
            <View style={styles.arrivedCard}>
              <View style={styles.arrivedIconWrap}>
                <MaterialIcons color="#16A34A" name="check-circle" size={48} />
              </View>
              <Text style={styles.arrivedTitle}>You&apos;ve arrived</Text>
              {params.destName ? (
                <Text style={styles.arrivedSub} numberOfLines={2}>{params.destName}</Text>
              ) : null}
              <Pressable style={styles.doneBtn} onPress={goHome}>
                <Text style={styles.doneBtnText}>
                  Done{arrivalCountdown > 0 ? ` · ${arrivalCountdown}s` : ''}
                </Text>
              </Pressable>
              <Text style={styles.arrivedHint}>Returning to home automatically</Text>
            </View>
          </SafeAreaView>
        </View>
      )}
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

  // Arrival overlay — anchored to the bottom so it doesn't hide the map.
  arrivedOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    zIndex: 200,
  },
  arrivedSafe: { paddingHorizontal: 16, paddingBottom: 12 },
  arrivedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  arrivedIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  arrivedTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  arrivedSub: {
    fontSize: 14, color: '#6B7280', marginTop: 4,
    textAlign: 'center', maxWidth: '90%',
  },
  doneBtn: {
    marginTop: 20, alignSelf: 'stretch',
    backgroundColor: '#16A34A',
    borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  arrivedHint: { fontSize: 12, color: '#9CA3AF', marginTop: 10 },

  errorBtn: {
    marginTop: 16,
    backgroundColor: '#1B2B45',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBtnText: { color: '#FFFFFF', fontWeight: '700' },
});
