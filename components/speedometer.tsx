import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  style?: StyleProp<ViewStyle>;
};

// Dev-only: poll the sim-drive control server so the speedometer shows the
// commanded speed during simulator testing (no real GPS needed).
const SIM_DRIVE_URL    = 'http://localhost:7777/state';
const SIM_POLL_MS      = 500;
const SIM_PROBE_MS     = 800;
const SIM_RETRY_MS     = 3000;
const LOG = (msg: string, extra?: unknown) => {
  if (__DEV__) console.log(`[Speedometer] ${msg}`, extra ?? '');
};

// Haversine distance between two lat/lng points in metres
function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

async function probeSimDrive(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SIM_PROBE_MS);
    const res = await fetch(SIM_DRIVE_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    LOG('probe response', { ok: res.ok, status: res.status });
    return res.ok;
  } catch (err) {
    LOG('probe failed', (err as Error).message);
    return false;
  }
}

export function Speedometer({ style }: Props) {
  const [speedKmh, setSpeedKmh] = useState(0);
  const [source, setSource]     = useState<'gps' | 'sim'>('gps');
  const lastSampleRef = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let gpsSub: Location.LocationSubscription | undefined;
    let simInterval: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let mode: 'gps' | 'sim' = 'gps';

    function stopGps() {
      gpsSub?.remove();
      gpsSub = undefined;
    }

    function startGps() {
      if (gpsSub) return;
      LOG('starting GPS subscription');
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') {
          LOG('GPS permission not granted', status);
          return;
        }

        gpsSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (loc) => {
            const hwMps = loc.coords.speed;
            if (hwMps != null && hwMps >= 0.3) {
              setSpeedKmh(hwMps * 3.6);
              lastSampleRef.current = {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                t: loc.timestamp,
              };
              return;
            }

            const prev = lastSampleRef.current;
            const now = { lat: loc.coords.latitude, lng: loc.coords.longitude, t: loc.timestamp };
            lastSampleRef.current = now;

            if (!prev) return;
            const dtSec = (now.t - prev.t) / 1000;
            if (dtSec <= 0) return;
            const distM = haversineMeters(prev.lat, prev.lng, now.lat, now.lng);
            const mps = distM / dtSec;
            if (mps < 0.3) { setSpeedKmh(0); return; }
            setSpeedKmh(mps * 3.6);
          },
        );
      })();
    }

    function startSimPolling() {
      if (simInterval) return;
      LOG('starting sim-drive polling');
      const tick = async () => {
        try {
          const res = await fetch(SIM_DRIVE_URL);
          if (!res.ok) return;
          const json = await res.json() as { speed_mps?: number; stopped?: boolean };
          if (json.stopped) { setSpeedKmh(0); return; }
          if (typeof json.speed_mps === 'number') {
            setSpeedKmh(json.speed_mps * 3.6);
          }
        } catch (err) {
          LOG('sim poll failed — falling back to GPS', (err as Error).message);
          if (simInterval) { clearInterval(simInterval); simInterval = undefined; }
          mode = 'gps';
          setSource('gps');
          startGps();
          scheduleRetry();
        }
      };
      void tick();
      simInterval = setInterval(tick, SIM_POLL_MS);
    }

    function scheduleRetry() {
      if (!__DEV__ || retryTimer) return;
      retryTimer = setTimeout(async () => {
        retryTimer = undefined;
        if (cancelled || mode === 'sim') return;
        const ok = await probeSimDrive();
        if (cancelled) return;
        if (ok) {
          LOG('sim-drive came online — switching from GPS');
          stopGps();
          mode = 'sim';
          setSource('sim');
          startSimPolling();
        } else {
          scheduleRetry();
        }
      }, SIM_RETRY_MS);
    }

    (async () => {
      if (__DEV__) {
        const simAvailable = await probeSimDrive();
        if (cancelled) return;
        if (simAvailable) {
          mode = 'sim';
          setSource('sim');
          startSimPolling();
          return;
        }
        LOG('sim-drive not reachable on mount; using GPS, will retry');
        scheduleRetry();
      }
      startGps();
    })();

    return () => {
      cancelled = true;
      stopGps();
      if (simInterval) clearInterval(simInterval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.value}>{Math.round(speedKmh)}</Text>
      <Text style={styles.unit}>{source === 'sim' ? 'km/h · sim' : 'km/h'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  unit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
