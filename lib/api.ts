import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

const BASE_URL =
  (Constants.expoConfig?.extra?.backendUrl as string | undefined) ??
  'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
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
