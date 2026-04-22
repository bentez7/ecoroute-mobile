import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const url = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? '';
const anonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] SUPABASE_URL / SUPABASE_ANON_KEY not set; Realtime feedback disabled. ' +
      'Fill them in .env and rerun `expo prebuild --clean`.',
  );
}

// Use harmless placeholders when unconfigured so module load doesn't throw.
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : 'http://localhost.invalid',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

export function setSupabaseAccessToken(token: string | null) {
  if (!isSupabaseConfigured) return;
  supabase.realtime.setAuth(token ?? '');
}
