import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const BASE_URL =
  (Constants.expoConfig?.extra?.backendUrl as string | undefined) ??
  'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach stored token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Auth ---

export interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
}

export interface AuthSession {
  access_token: string;
  expires_at: number;
}

export interface AuthResponse {
  user: AuthUser;
  session: AuthSession;
}

export async function signUp(
  email: string,
  password: string,
  display_name?: string,
): Promise<AuthResponse> {
  const { data } = await api.post<{ success: true; data: AuthResponse }>(
    '/auth/signup',
    { email, password, display_name },
  );
  return data.data;
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const url = `${api.defaults.baseURL}/auth/signin`;
  const body = { email, password };
  console.log('[signIn] POST', url);
  console.log('[signIn] body', JSON.stringify(body));
  try {
    const { data } = await api.post<{ success: true; data: AuthResponse }>(
      '/auth/signin',
      body,
    );
    console.log('[signIn] response', JSON.stringify(data));
    return data.data;
  } catch (err: any) {
    console.log('[signIn] error status', err?.response?.status);
    console.log('[signIn] error data', JSON.stringify(err?.response?.data));
    console.log('[signIn] error message', err?.message);
    throw err;
  }
}

export async function signOut(): Promise<void> {
  await api.post('/auth/signout');
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<{ success: true; data: AuthUser }>('/auth/me');
  return data.data;
}

// --- Places ---

export interface PlaceSuggestion {
  place_id: string;
  name: string;
  full_address: string;
  lat: number;
  lng: number;
}

export async function autocomplete(
  query: string,
  proximity_lat?: number,
  proximity_lng?: number,
): Promise<PlaceSuggestion[]> {
  const { data } = await api.post<{
    success: true;
    data: PlaceSuggestion[];
  }>('/places/autocomplete', { query, proximity_lat, proximity_lng });
  return data.data;
}

// --- Routes ---

export type RouteLabel = 'eco' | 'balanced' | 'fastest';

export interface RouteOption {
  label: RouteLabel;
  distance_km: number;
  duration_sec: number;
  energy_kwh: number | null;
  elevation_gain_km: number | null;
  polyline: string;
  directions_json: Record<string, unknown> | null;
  warnings: string[];
}

export interface RouteSearchParams {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  model_name?: string;
}

export async function searchRoutes(params: RouteSearchParams): Promise<RouteOption[]> {
  console.log('[routes/search] →', params);
  const { data } = await api.post<{ success: true; data: RouteOption[] }>(
    '/routes/search',
    params,
  );
  const options = data.data;
  console.log(
    `[routes/search] ← ${options.length} option(s):`,
    options.map((o) => ({
      label: o.label,
      distance_km: o.distance_km,
      duration_sec: o.duration_sec,
      energy_kwh: o.energy_kwh,
      elevation_gain_km: o.elevation_gain_km,
      polyline_len: o.polyline.length,
      polyline_preview: o.polyline.slice(0, 40) + (o.polyline.length > 40 ? '…' : ''),
      warnings: o.warnings,
    })),
  );
  return options;
}

// --- Vehicles ---

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  vehicle_mass_kg: number;
  drag_coefficient: number | null;
  drivetrain_type: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleVariant {
  variant: string;
  year: number;
  vehicle_type: string;
  drivetrain_type: string;
  vehicle_mass_kg: number;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export async function getVehicleMakes(): Promise<string[]> {
  const { data } = await api.get<{
    success: true;
    data: PaginatedResponse<string>;
  }>('/vehicles/makes', { params: { limit: 100 } });
  return data.data.data;
}

export async function getVehicleModels(make: string): Promise<string[]> {
  const { data } = await api.get<{
    success: true;
    data: PaginatedResponse<string>;
  }>(`/vehicles/makes/${encodeURIComponent(make)}/models`, { params: { limit: 100 } });
  return data.data.data;
}

export async function getVehicleVariants(
  make: string,
  model: string,
): Promise<VehicleVariant[]> {
  const { data } = await api.get<{
    success: true;
    data: PaginatedResponse<VehicleVariant>;
  }>(`/vehicles/makes/${encodeURIComponent(make)}/models/${encodeURIComponent(model)}/variants`, {
    params: { limit: 100 },
  });
  return data.data.data;
}

export async function createVehicle(body: {
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  vehicle_mass_kg: number;
  drivetrain_type: string;
}): Promise<Vehicle> {
  const { data } = await api.post<{ success: true; data: Vehicle }>(
    '/vehicles',
    body,
  );
  return data.data;
}

export async function getVehicles(): Promise<Vehicle[]> {
  const { data } = await api.get<{ success: true; data: Vehicle[] }>('/vehicles');
  return data.data;
}

// --- Trips ---

export type TripStatus = 'active' | 'ended' | 'cancelled';
export type DriverProfile = 'smooth' | 'normal' | 'aggressive';
export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'ev';

export interface Trip {
  id: string;
  user_id?: string;
  status: TripStatus;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  origin_lat: number;
  origin_lng: number;
  origin_address: string | null;
  dest_lat: number;
  dest_lng: number;
  dest_address: string | null;
  route_polyline: string | null;
  fuel_type: string;
  distance_km: number | null;
  duration_sec: number | null;
  energy_kwh: number | null;
  co2_kg: number | null;
  driver_profile: DriverProfile | string | null;
  excess_vs_optimal_pct: number | null;
  created_at?: string;
}

export interface CreateTripBody {
  vehicle_id: string;
  started_at: string;
  origin_lat: number;
  origin_lng: number;
  origin_address?: string;
  dest_lat: number;
  dest_lng: number;
  dest_address?: string;
  route_polyline?: string;
  fuel_type: string;
}

export async function createTrip(body: CreateTripBody): Promise<Trip> {
  console.log('[trips] create →', { vehicle_id: body.vehicle_id, fuel_type: body.fuel_type });
  const { data } = await api.post<{ success: true; data: Trip }>('/trips', body);
  console.log('[trips] create ←', data.data.id, data.data.status);
  return data.data;
}

export async function endTrip(
  id: string,
  body: { ended_at: string; distance_km: number; duration_sec: number },
): Promise<Trip> {
  console.log('[trips] end →', id, body);
  const { data } = await api.patch<{ success: true; data: Trip }>(`/trips/${id}/end`, body);
  return data.data;
}

export async function cancelTrip(id: string): Promise<Trip> {
  console.log('[trips] cancel →', id);
  const { data } = await api.patch<{ success: true; data: Trip }>(`/trips/${id}/cancel`, {});
  return data.data;
}

export async function getTrip(id: string): Promise<Trip> {
  const { data } = await api.get<{ success: true; data: Trip }>(`/trips/${id}`);
  return data.data;
}

// --- Telemetry ---

export interface TelemetryPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  speed_ms?: number | null;
  accel_ms2?: number | null;
  altitude_m?: number | null;
  heading_deg?: number | null;
}

export class TripInactiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TripInactiveError';
  }
}

export async function postTelemetry(
  trip_id: string,
  points: TelemetryPoint[],
): Promise<{ inserted: number }> {
  try {
    const { data } = await api.post<{ success: true; data: { inserted: number } }>(
      '/telemetry',
      { trip_id, points },
    );
    return data.data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      (err as Error)?.message ??
      'Telemetry POST failed';
    if (status === 409) throw new TripInactiveError(msg);
    throw err;
  }
}

// --- Feedback ---

export type FeedbackEventType =
  | 'hard_braking'
  | 'speeding'
  | 'idling'
  | 'aggressive_accel'
  | 'eco_praise';
export type FeedbackSeverity = 'info' | 'warning' | 'critical';

export interface FeedbackEvent {
  id: string;
  trip_id: string;
  segment_id: string | null;
  event_type: FeedbackEventType;
  severity: FeedbackSeverity;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export async function acknowledgeFeedback(id: string): Promise<void> {
  await api.patch(`/feedback/${id}/acknowledge`, {});
}

export async function getFeedbackForTrip(trip_id: string): Promise<FeedbackEvent[]> {
  const { data } = await api.get<{ success: true; data: FeedbackEvent[] }>(
    `/feedback/trip/${trip_id}`,
  );
  return data.data;
}

export async function getTrips(): Promise<Trip[]> {
  const { data } = await api.get<{ success: true; data: Trip[] }>('/trips');
  return data.data;
}
