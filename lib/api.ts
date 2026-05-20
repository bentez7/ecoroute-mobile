import Constants from 'expo-constants';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

import { supabase } from '@/lib/supabase';

// ---------------- Types ----------------

export interface PlaceSuggestion {
  place_id: string;
  name: string;
  full_address: string;
  lat: number;
  lng: number;
}

export interface RouteOption {
  label: string;
  distance_km: number;
  duration_sec: number;
  energy_kwh: number | null;
  elevation_gain_km: number | null;
  polyline: string;
  warnings: string[];
}

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

interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

interface ApiEnvelope<T> {
  success: true;
  data: T;
}

// ---------------- Base service ----------------

abstract class BaseService {
  protected constructor(protected readonly http: AxiosInstance) {}

  protected async httpGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const { data } = await this.http.get<ApiEnvelope<T>>(url, config);
    return data.data;
  }

  protected async httpPost<T>(url: string, body?: unknown): Promise<T> {
    const { data } = await this.http.post<ApiEnvelope<T>>(url, body);
    return data.data;
  }

  protected async httpPatch<T>(url: string, body?: unknown): Promise<T> {
    const { data } = await this.http.patch<ApiEnvelope<T>>(url, body);
    return data.data;
  }

  protected async httpDelete(url: string): Promise<void> {
    await this.http.delete(url);
  }
}

// ---------------- Services ----------------

class PlacesService extends BaseService {
  constructor(http: AxiosInstance) {
    super(http);
  }

  autocomplete(query: string, proximity_lat?: number, proximity_lng?: number): Promise<PlaceSuggestion[]> {
    return this.httpPost<PlaceSuggestion[]>('/places/autocomplete', {
      query,
      proximity_lat,
      proximity_lng,
    });
  }
}

class RoutesService extends BaseService {
  constructor(http: AxiosInstance) {
    super(http);
  }

  search(origin_lat: number, origin_lng: number, dest_lat: number, dest_lng: number): Promise<RouteOption[]> {
    return this.httpPost<RouteOption[]>('/routes/search', {
      origin_lat,
      origin_lng,
      dest_lat,
      dest_lng,
    });
  }
}

class VehiclesService extends BaseService {
  constructor(http: AxiosInstance) {
    super(http);
  }

  list(): Promise<Vehicle[]> {
    return this.httpGet<Vehicle[]>('/vehicles');
  }

  async getMakes(): Promise<string[]> {
    const res = await this.httpGet<PaginatedResponse<string>>('/vehicles/makes', {
      params: { limit: 100 },
    });
    return res.data;
  }

  async getModels(make: string): Promise<string[]> {
    const res = await this.httpGet<PaginatedResponse<string>>(
      `/vehicles/makes/${encodeURIComponent(make)}/models`,
      { params: { limit: 100 } },
    );
    return res.data;
  }

  async getVariants(make: string, model: string): Promise<VehicleVariant[]> {
    const res = await this.httpGet<PaginatedResponse<VehicleVariant>>(
      `/vehicles/makes/${encodeURIComponent(make)}/models/${encodeURIComponent(model)}/variants`,
      { params: { limit: 100 } },
    );
    return res.data;
  }

  create(body: {
    make: string;
    model: string;
    year: number;
    vehicle_type: string;
    vehicle_mass_kg: number;
    drivetrain_type: string;
  }): Promise<Vehicle> {
    return this.httpPost<Vehicle>('/vehicles', body);
  }

  setDefault(id: string): Promise<Vehicle> {
    return this.httpPatch<Vehicle>(`/vehicles/${id}/default`, {});
  }

  delete(id: string): Promise<void> {
    return this.httpDelete(`/vehicles/${id}`);
  }
}

class TripsService extends BaseService {
  constructor(http: AxiosInstance) {
    super(http);
  }

  list(): Promise<Trip[]> {
    return this.httpGet<Trip[]>('/trips');
  }

  create(body: {
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
    return this.httpPost<Trip>('/trips', body);
  }
}

// ---------------- Facade ----------------

class ApiClient {
  private readonly http: AxiosInstance;
  readonly places: PlacesService;
  readonly routes: RoutesService;
  readonly vehicles: VehiclesService;
  readonly trips: TripsService;

  constructor(baseURL: string) {
    this.http = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach Supabase access token to every outgoing request
    this.http.interceptors.request.use(async (config) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.places = new PlacesService(this.http);
    this.routes = new RoutesService(this.http);
    this.vehicles = new VehiclesService(this.http);
    this.trips = new TripsService(this.http);
  }
}

const BASE_URL =
  (Constants.expoConfig?.extra?.backendUrl as string | undefined) ??
  'http://localhost:3000/api';

export const api = new ApiClient(BASE_URL);
