<<<<<<< HEAD
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl     = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] SUPABASE_URL / SUPABASE_ANON_KEY missing from env. ' +
    'OAuth and password auth will fail until these are set in .env.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
=======
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
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc
