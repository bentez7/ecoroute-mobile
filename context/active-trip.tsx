import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  acknowledgeFeedback as ackFeedbackApi,
  cancelTrip as cancelTripApi,
  createTrip,
  endTrip as endTripApi,
  FeedbackEvent,
  FuelType,
  getTrip,
  postTelemetry,
  Trip,
  TripInactiveError,
} from '@/lib/api';
import {
  ACTIVE_TRIP_KEY,
  startLocationTracking,
  stopLocationTracking,
} from '@/lib/location-task';
import { haversineMeters } from '@/lib/polyline';
import { setSupabaseAccessToken, supabase } from '@/lib/supabase';
import {
  clearTrip,
  deletePoints,
  pullPoints,
} from '@/lib/telemetry-queue';

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_BATCH_SIZE = 200;
const SUMMARY_POLL_INTERVAL_MS = 2000;
const SUMMARY_POLL_TIMEOUT_MS = 30_000;

interface StartTripArgs {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  originAddress?: string;
  destAddress?: string;
  routePolyline?: string;
}

interface ActiveTripContextValue {
  tripId: string | null;
  startedAt: number | null;
  feedback: FeedbackEvent[];
  isStarting: boolean;
  isEnding: boolean;
  start: (args: StartTripArgs) => Promise<Trip>;
  end: () => Promise<Trip>;
  cancel: () => Promise<void>;
  dismissFeedback: (id: string) => void;
}

const ActiveTripContext = createContext<ActiveTripContextValue | null>(null);

export function useActiveTrip(): ActiveTripContextValue {
  const ctx = useContext(ActiveTripContext);
  if (!ctx) throw new Error('useActiveTrip must be used inside <ActiveTripProvider>');
  return ctx;
}

export function ActiveTripProvider({ children }: { children: React.ReactNode }) {
  const [tripId, setTripId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const tripIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const distanceMetersRef = useRef(0);
  const lastFlushedPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const flushInFlightRef = useRef(false);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);

  const stopFlushLoop = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const teardownChannel = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const flushOnce = useCallback(async (): Promise<void> => {
    const id = tripIdRef.current;
    if (!id) return;
    if (flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    try {
      const batch = await pullPoints(id, FLUSH_BATCH_SIZE);
      if (batch.length === 0) return;

      for (const pt of batch) {
        if (lastFlushedPointRef.current) {
          distanceMetersRef.current += haversineMeters(
            [lastFlushedPointRef.current.lat, lastFlushedPointRef.current.lng],
            [pt.lat, pt.lng],
          );
        }
        lastFlushedPointRef.current = { lat: pt.lat, lng: pt.lng };
      }

      try {
        await postTelemetry(
          id,
          batch.map(({ _row_id, trip_id, ...p }) => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(p)) {
              if (v !== null && v !== undefined) out[k] = v;
            }
            return out as typeof p;
          }),
        );
        await deletePoints(batch.map((p) => p._row_id));
        console.log(`[active-trip] flushed ${batch.length} points`);
      } catch (err) {
        if (err instanceof TripInactiveError) {
          console.warn('[active-trip] trip inactive on server; tearing down');
          await fullTeardown(id);
          setTripId(null);
          setStartedAt(null);
        } else {
          const body = (err as { response?: { data?: unknown } })?.response?.data;
          console.warn(
            '[active-trip] flush failed (will retry):',
            (err as Error).message,
            body ? JSON.stringify(body) : '',
          );
        }
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, []);

  const fullTeardown = useCallback(
    async (id: string) => {
      stopFlushLoop();
      await stopLocationTracking();
      await teardownChannel();
      await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
      await clearTrip(id);
      distanceMetersRef.current = 0;
      lastFlushedPointRef.current = null;
    },
    [stopFlushLoop, teardownChannel],
  );

  const subscribeToFeedback = useCallback((id: string) => {
    const ch = supabase
      .channel(`trip:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'feedback_events',
          filter: `trip_id=eq.${id}`,
        },
        (payload) => {
          const evt = payload.new as FeedbackEvent;
          console.log('[active-trip] feedback received', evt.event_type, evt.severity);
          setFeedback((prev) => [...prev, evt]);
        },
      )
      .subscribe((status) => {
        console.log('[active-trip] supabase channel', status);
      });
    channelRef.current = ch;
  }, []);

  const start = useCallback<ActiveTripContextValue['start']>(
    async (args) => {
      if (tripIdRef.current) {
        throw new Error('A trip is already active.');
      }
      const vehicleId = Constants.expoConfig?.extra?.vehicleId as string | undefined;
      const fuelType =
        (Constants.expoConfig?.extra?.fuelType as FuelType | undefined) ?? 'petrol';
      if (!vehicleId) {
        throw new Error(
          'VEHICLE_ID not set in .env. Add it before starting a trip.',
        );
      }

      setIsStarting(true);
      try {
        const accessToken = await SecureStore.getItemAsync('access_token');
        setSupabaseAccessToken(accessToken);

        const trip = await createTrip({
          vehicle_id: vehicleId,
          fuel_type: fuelType,
          started_at: new Date().toISOString(),
          origin_lat: args.originLat,
          origin_lng: args.originLng,
          origin_address: args.originAddress,
          dest_lat: args.destLat,
          dest_lng: args.destLng,
          dest_address: args.destAddress,
          route_polyline: args.routePolyline,
        });

        await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, trip.id);
        setTripId(trip.id);
        setStartedAt(Date.parse(trip.started_at));
        distanceMetersRef.current = 0;
        lastFlushedPointRef.current = null;

        subscribeToFeedback(trip.id);

        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status === 'granted') {
          // Background permission must be requested separately on iOS
          await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
          await startLocationTracking();
        } else {
          console.warn('[active-trip] foreground location not granted; sampler disabled');
        }

        flushTimerRef.current = setInterval(() => {
          void flushOnce();
        }, FLUSH_INTERVAL_MS);

        return trip;
      } finally {
        setIsStarting(false);
      }
    },
    [flushOnce, subscribeToFeedback],
  );

  const end = useCallback<ActiveTripContextValue['end']>(async () => {
    const id = tripIdRef.current;
    if (!id) throw new Error('No active trip to end.');
    setIsEnding(true);
    try {
      stopFlushLoop();
      await stopLocationTracking();
      await flushOnce();

      const startedMs = startedAtRef.current ?? Date.now();
      const endedMs = Date.now();
      const distanceKm = Number((distanceMetersRef.current / 1000).toFixed(3));
      const durationSec = Math.round((endedMs - startedMs) / 1000);

      const ended = await endTripApi(id, {
        ended_at: new Date(endedMs).toISOString(),
        distance_km: distanceKm,
        duration_sec: durationSec,
      });

      await teardownChannel();
      await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
      await clearTrip(id);
      setTripId(null);
      setStartedAt(null);
      setFeedback([]);
      distanceMetersRef.current = 0;
      lastFlushedPointRef.current = null;

      const deadline = Date.now() + SUMMARY_POLL_TIMEOUT_MS;
      let summary = ended;
      while (Date.now() < deadline) {
        if (summary.driver_profile) return summary;
        await new Promise((r) => setTimeout(r, SUMMARY_POLL_INTERVAL_MS));
        try {
          summary = await getTrip(id);
        } catch (e) {
          console.warn('[active-trip] summary poll failed', (e as Error).message);
        }
      }
      return summary;
    } finally {
      setIsEnding(false);
    }
  }, [flushOnce, stopFlushLoop, teardownChannel]);

  const cancel = useCallback<ActiveTripContextValue['cancel']>(async () => {
    const id = tripIdRef.current;
    if (!id) return;
    setIsEnding(true);
    try {
      stopFlushLoop();
      await stopLocationTracking();
      try {
        await cancelTripApi(id);
      } catch (e) {
        console.warn('[active-trip] cancel API failed', (e as Error).message);
      }
      await teardownChannel();
      await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
      await clearTrip(id);
      setTripId(null);
      setStartedAt(null);
      setFeedback([]);
      distanceMetersRef.current = 0;
      lastFlushedPointRef.current = null;
    } finally {
      setIsEnding(false);
    }
  }, [stopFlushLoop, teardownChannel]);

  const dismissFeedback = useCallback((id: string) => {
    setFeedback((prev) => prev.filter((f) => f.id !== id));
    void ackFeedbackApi(id).catch((e) =>
      console.warn('[active-trip] ack failed', (e as Error).message),
    );
  }, []);

  return (
    <ActiveTripContext.Provider
      value={{
        tripId,
        startedAt,
        feedback,
        isStarting,
        isEnding,
        start,
        end,
        cancel,
        dismissFeedback,
      }}
    >
      {children}
    </ActiveTripContext.Provider>
  );
}
