import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { enqueuePoint } from './telemetry-queue';

export const TRIP_LOCATION_TASK = 'TRIP_LOCATION_TASK';
export const ACTIVE_TRIP_KEY = 'active_trip_id';

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
  TRIP_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn('[location-task] error', error.message);
      return;
    }
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;

    const tripId = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
    if (!tripId) return;

    for (const loc of locations) {
      try {
        await enqueuePoint(tripId, {
          recorded_at: new Date(loc.timestamp).toISOString(),
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          speed_ms: loc.coords.speed ?? null,
          altitude_m: loc.coords.altitude ?? null,
          heading_deg: loc.coords.heading ?? null,
        });
      } catch (e) {
        console.warn('[location-task] enqueue failed', (e as Error).message);
      }
    }
  },
);

export async function startLocationTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
  if (isRunning) return;

  await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'EcoRoute is tracking your trip',
      notificationBody: 'Recording telemetry to compute your eco score.',
      notificationColor: '#1B2B45',
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  });
}

export async function stopLocationTracking(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  }
}
