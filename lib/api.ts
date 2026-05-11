import Constants from 'expo-constants';
import axios from 'axios';

import { supabase } from '@/lib/supabase';

const BASE_URL =
  (Constants.expoConfig?.extra?.backendUrl as string | undefined) ??
  'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Supabase access token to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export interface RouteOption {
  label: string;
  distance_km: number;
  duration_sec: number;
  energy_kwh: number | null;
  elevation_gain_km: number | null;
  polyline: string;
  warnings: string[];
}

export async function searchRoutes(
  origin_lat: number,
  origin_lng: number,
  dest_lat: number,
  dest_lng: number,
): Promise<RouteOption[]> {
  const { data } = await api.post<{
    success: true;
    data: RouteOption[];
  }>('/routes/search', { origin_lat, origin_lng, dest_lat, dest_lng });
  return data.data;
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

// --- Trips ---

export interface Trip {
  id: string;
  user_id: string;
  vehicle_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number | null;
  duration_sec: number | null;
  route_polyline: string | null;
  origin_lat: number;
  origin_lng: number;
  origin_address: string | null;
  dest_lat: number;
  dest_lng: number;
  dest_address: string | null;
  fuel_type: string;
  energy_kwh: number | null;
  co2_kg: number | null;
  excess_vs_optimal_pct: number | null;
  driver_profile: string | null;
  created_at: string;
}

export async function createTrip(body: {
  vehicle_id: string;
  started_at: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  fuel_type: string;
  origin_address?: string;
  dest_address?: string;
  route_polyline?: string;
}): Promise<Trip> {
  const { data } = await api.post<{ success: true; data: Trip }>(
    '/trips',
    body,
  );
  return data.data;
}

export async function getTrips(): Promise<Trip[]> {
  const { data } = await api.get<{ success: true; data: Trip[] }>('/trips');
  return data.data;
}
