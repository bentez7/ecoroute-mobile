import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MapboxGL from '@rnmapbox/maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackBanner } from '@/components/feedback-banner';
import { useActiveTrip } from '@/context/active-trip';
import { type RouteLabel } from '@/lib/api';
import { consumePendingDirectionsJson } from '@/lib/pending-route';
import { decode, haversineMeters, toGeoJSONLineString, type LatLng } from '@/lib/polyline';

const ARRIVAL_RADIUS_M = 30;
const ADVANCE_RADIUS_M = 25;

interface Step {
  instruction: string;
  location: LatLng;   // [lat, lng]
  distance: number;   // meters of this step
  type: string;
}

function extractSteps(directionsJson: Record<string, unknown> | null): Step[] {
  try {
    const route = (directionsJson as any)?.routes?.[0];
    const legs = route?.legs ?? [];
    const out: Step[] = [];
    for (const leg of legs) {
      for (const s of leg.steps ?? []) {
        const loc = s?.maneuver?.location;
        const instruction = s?.maneuver?.instruction;
        if (!Array.isArray(loc) || loc.length < 2 || typeof instruction !== 'string') continue;
        out.push({
          instruction,
          location: [loc[1], loc[0]] as LatLng,
          distance: typeof s.distance === 'number' ? s.distance : 0,
          type: s?.maneuver?.type ?? 'continue',
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function formatDistance(m: number): string {
  if (m < 50) return 'now';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return '<1 min';
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m} min`;
}

function maneuverIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  if (type.includes('left')) return 'turn-left';
  if (type.includes('right')) return 'turn-right';
  if (type === 'arrive') return 'flag';
  if (type === 'depart') return 'navigation';
  return 'straight';
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
    durationSec?: string;
    distanceKm?: string;
  }>();

  const totalDurationSec = Number(params.durationSec) || 0;

  const dest = useMemo(
    () => ({ lat: Number(params.destLat), lng: Number(params.destLng) }),
    [params.destLat, params.destLng],
  );

  const steps = useMemo<Step[]>(() => {
    const json = consumePendingDirectionsJson();
    return extractSteps(json);
  }, []);

  const decoded = useMemo(() => decode(params.polyline ?? ''), [params.polyline]);
  const routeGeoJSON = useMemo(() => toGeoJSONLineString(decoded), [decoded]);
  const isValid = decoded.length >= 2;

  const { tripId, start, end, cancel, feedback, dismissFeedback } = useActiveTrip();
  const tripStartAttemptedRef = useRef(false);
  const arrivedRef = useRef(false);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [distToNextManeuver, setDistToNextManeuver] = useState<number | null>(null);
  const [distToDest, setDistToDest] = useState<number | null>(null);
  const spokenStepRef = useRef<number>(-1);

  // Speak on step change
  useEffect(() => {
    if (steps.length === 0) return;
    if (currentStepIdx === spokenStepRef.current) return;
    const step = steps[currentStepIdx];
    if (!step) return;
    spokenStepRef.current = currentStepIdx;
    Speech.speak(step.instruction, { rate: 1.0 });
  }, [currentStepIdx, steps]);

  // Trip bootstrap (same flow as before)
  useEffect(() => {
    if (!isValid) return;
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

        const originLat =
          loc?.coords.latitude ?? Number(params.originLat) ?? decoded[0][0];
        const originLng =
          loc?.coords.longitude ?? Number(params.originLng) ?? decoded[0][1];

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
  }, [isValid, decoded, dest, params, start]);

  // Watch user position, advance steps, detect arrival
  useEffect(() => {
    if (!isValid) return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 3,
          timeInterval: 1000,
        },
        (loc) => {
          const here: LatLng = [loc.coords.latitude, loc.coords.longitude];
          const dDest = haversineMeters(here, [dest.lat, dest.lng]);
          setDistToDest(dDest);

          if (dDest < ARRIVAL_RADIUS_M && !arrivedRef.current) {
            arrivedRef.current = true;
            void handleArrival();
            return;
          }

          setCurrentStepIdx((idx) => {
            let next = idx;
            while (next < steps.length) {
              const d = haversineMeters(here, steps[next].location);
              if (d <= ADVANCE_RADIUS_M) {
                next += 1;
                continue;
              }
              setDistToNextManeuver(d);
              break;
            }
            return next;
          });
        },
      );
    })();
    return () => {
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, steps, dest.lat, dest.lng]);

  const handleArrival = useCallback(async () => {
    try {
      Speech.speak('You have arrived');
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

  // Cancel trip on back-out without arrival
  useEffect(() => {
    return () => {
      if (!arrivedRef.current && tripId) {
        void cancel();
      }
    };
  }, [tripId, cancel]);

  if (!isValid) {
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

  const currentStep = steps[currentStepIdx];
  const upcomingText = currentStep?.instruction ?? 'Follow the route';
  const upcomingIcon = maneuverIcon(currentStep?.type ?? 'continue');

  // ETA from backend duration scaled by progress through the route
  let etaSec: number | null = null;
  if (totalDurationSec > 0) {
    const progress =
      steps.length > 0
        ? Math.min(1, currentStepIdx / steps.length)
        : 0;
    etaSec = Math.max(0, Math.round(totalDurationSec * (1 - progress)));
  } else if (distToDest != null) {
    etaSec = Math.round((distToDest / 1000) * 90);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapboxGL.MapView style={StyleSheet.absoluteFill} styleURL={MapboxGL.StyleURL.Street}>
        <MapboxGL.Camera
          followUserLocation
          followUserMode={MapboxGL.UserTrackingMode.FollowWithHeading}
          followZoomLevel={17}
          followPitch={45}
        />
        <MapboxGL.UserLocation visible showsUserHeadingIndicator />

        <MapboxGL.ShapeSource
          id="route"
          shape={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: routeGeoJSON },
          }}
        >
          <MapboxGL.LineLayer
            id="route-layer"
            style={{
              lineColor: '#3B82F6',
              lineWidth: 7,
              lineOpacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </MapboxGL.ShapeSource>

        <MapboxGL.MarkerView coordinate={[dest.lng, dest.lat]}>
          <View style={styles.destPin}>
            <MaterialIcons color="#FFFFFF" name="place" size={18} />
          </View>
        </MapboxGL.MarkerView>
      </MapboxGL.MapView>

      {/* Top banner: next maneuver */}
      <SafeAreaView edges={['top']} style={styles.topWrap} pointerEvents="box-none">
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <MaterialIcons color="#FFFFFF" name={upcomingIcon} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerDist}>
              {distToNextManeuver != null ? formatDistance(distToNextManeuver) : '—'}
            </Text>
            <Text style={styles.bannerText} numberOfLines={2}>
              {upcomingText}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom bar: ETA + end */}
      <SafeAreaView edges={['bottom']} style={styles.bottomWrap} pointerEvents="box-none">
        <View style={styles.bottomBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.etaLabel}>
              {distToDest != null ? formatDistance(distToDest) + ' remaining' : 'Starting…'}
            </Text>
            {etaSec != null && (
              <Text style={styles.etaValue}>ETA {formatDuration(etaSec)}</Text>
            )}
          </View>
          <Pressable style={styles.endBtn} onPress={handleCancel}>
            <MaterialIcons color="#FFFFFF" name="close" size={20} />
            <Text style={styles.endBtnText}>End</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <FeedbackBanner items={feedback} onDismiss={dismissFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  errorWrap: {
    flex: 1, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 12,
  },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  errorText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  errorBtn: {
    marginTop: 16, backgroundColor: '#1B2B45',
    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12,
  },
  errorBtnText: { color: '#FFFFFF', fontWeight: '700' },

  topWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1B2B45',
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  bannerIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerDist: { color: '#93C5FD', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  bannerText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },

  destPin: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
  },

  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4,
  },
  etaLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  etaValue: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 2 },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EF4444',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  endBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
