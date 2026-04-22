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
  const { data } = await api.post<{ success: true; data: AuthResponse }>(
    '/auth/signin',
    { email, password },
  );
  return data.data;
}

export async function signOut(): Promise<void> {
  await api.post('/auth/signout');
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<{ success: true; data: AuthUser }>('/auth/me');
  return data.data;
}

// --- Routes ---

export type RouteLabel = 'eco' | 'balanced' | 'fastest';

export interface RouteOption {
  label: RouteLabel;
  distance_km: number;
  duration_sec: number;
  energy_kwh: number;
  elevation_gain_km: number;
  polyline: string;
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
