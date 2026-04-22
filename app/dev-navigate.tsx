// =============================================================================
// DEV-ONLY SCREEN — run turn-by-turn navigation over a hardcoded backend
// response, without needing the backend live.
// To remove after dev:
//   1. Delete this file (app/dev-navigate.tsx)
//   2. Remove the <Stack.Screen name="dev-navigate" ... /> in app/_layout.tsx
//   3. Remove the "Dev: Simulate TBT" button in app/(tabs)/index.tsx
// =============================================================================

import { MapboxNavigationView } from '@badatgil/expo-mapbox-navigation';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { FeedbackBanner } from '@/components/feedback-banner';
import { useActiveTrip } from '@/context/active-trip';
import {
  decode,
  haversineMeters,
  sampleWaypoints,
  toLatLngObjects,
} from '@/lib/polyline';

const HARDCODED_ECO_POLYLINE =
  'cgtQ{tckR?~@?fL@zC@vC@bJ@`@?Z?D?l@?n@?z@?hD@vBAlB?fD?D?bB@d@?N?V@T@P@H@DDLFNJPpCvC^p@Pl@DZ@H@FBNA^S?M?_B?qA@gAAiBAk@C{@Me@MuCy@sAa@u@Ws@Wk@Oc@Ie@Eo@Cw@?{GEmLAG?wH?kj@CsRA_JA_J@}DBsB@yBFsIAw@B[B]JYL_@TOLe@b@Sb@q@fAw@pA]h@o@x@c@Zk@X}@XmANk@@o@B[K]WQYI]?]DQHWPUJKVOVGb@?r@BpA@`A?l@?b@E\\Gz@[n@e@\\e@Zm@f@a@~DcJn@oCJi@RWn@wFj@wFdBqOJ_B?m@@yDCsD?q@[wAAWEkEAqBCwBAcAA[AGISKQUOSGOAI?I?ODIBKFIFyDfEYLYDWAUI}CiBqBmAe@UQKWKYMOAa@GsGDqA?aBFmAAg@?MAOAcACKAKAA?IAMAQAe@GYC[?wCAmBAeA?oAAcC@gB?yBA{O?oD?_C@{AAk@CcAMw@Qe@QqBaAi@YMIiHqD}JgF]AW@SDW?WEQOMMMQGWGUU_@aCoAIEo@I{ASmFu@mCa@y@MsAQC?AAUCGAG?I?KEIECCCCDWL{@J_APqAiAOq@Ts@Tk@gBg@wA_Bw@m@[a@SqAo@aBy@cAi@o@[MIa@SyAaAqB}AwBeBaCiBm@e@k@c@k@c@g@_@vBqCpBiCHK';

const MAP_MATCHING_MAX_COORDS = 25;

export default function DevNavigateScreen() {
  const router = useRouter();
  const { tripId, start, end, cancel, feedback, dismissFeedback } = useActiveTrip();
  const tripStartAttemptedRef = useRef(false);
  const arrivedRef = useRef(false);

  const coordinates = useMemo(() => {
    const decoded = decode(HARDCODED_ECO_POLYLINE);
    return toLatLngObjects(sampleWaypoints(decoded, MAP_MATCHING_MAX_COORDS));
  }, []);

  const valid = useMemo(() => {
    if (coordinates.length < 2) return false;
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return (
      haversineMeters(
        [first.latitude, first.longitude],
        [last.latitude, last.longitude],
      ) > 100
    );
  }, [coordinates]);

  useEffect(() => {
    if (!valid) return;
    if (tripStartAttemptedRef.current) return;
    tripStartAttemptedRef.current = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        await start({
          originLat: first.latitude,
          originLng: first.longitude,
          destLat: last.latitude,
          destLng: last.longitude,
          routePolyline: HARDCODED_ECO_POLYLINE,
        });
      } catch (err) {
        console.warn('[dev-navigate] start trip failed', (err as Error).message);
      }
    })();
  }, [valid, coordinates, start]);

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
      console.warn('[dev-navigate] end failed', (err as Error).message);
    }
    router.back();
  }, [end, router]);

  const handleCancel = useCallback(async () => {
    arrivedRef.current = true;
    try {
      await cancel();
    } catch (err) {
      console.warn('[dev-navigate] cancel failed', (err as Error).message);
    }
    router.back();
  }, [cancel, router]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.errorWrap}>
        <MaterialIcons color="#DC2626" name="error-outline" size={48} />
        <Text style={styles.errorTitle}>Dev polyline invalid</Text>
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
        waypointIndices={[0, coordinates.length - 1]}
        useRouteMatchingApi
        onFinalDestinationArrival={handleArrival}
        onCancelNavigation={handleCancel}
        onRouteFailedToLoad={(evt) =>
          console.warn('[dev-navigate] route failed', evt.nativeEvent.errorMessage)
        }
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
  errorBtn: {
    marginTop: 16,
    backgroundColor: '#1B2B45',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorBtnText: { color: '#FFFFFF', fontWeight: '700' },
});
