import { useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

<<<<<<< HEAD
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
=======
import { AuthUser, getMe, refreshSession, signIn, signOut, signUp } from '@/lib/api';
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

function mapUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { id, email, user_metadata } = session.user;
  return {
    id,
    email: email ?? null,
    display_name:
      (user_metadata?.display_name as string | undefined) ??
      (user_metadata?.full_name as string | undefined) ??
      (user_metadata?.name as string | undefined) ??
      null,
    avatar_url: (user_metadata?.avatar_url as string | undefined) ?? null,
  };
}

async function openOAuthFlow(provider: 'google' | 'apple') {
  const redirectTo = Linking.createURL('/auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('OAuth URL missing from Supabase response');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('OAuth flow was cancelled');
  }

  // Supabase returns tokens in the URL fragment (#access_token=...&refresh_token=...)
  const url = new URL(result.url);
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(fragment || url.search);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');

  if (!access_token || !refresh_token) {
    throw new Error('OAuth response missing tokens');
  }

  const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
  if (setErr) throw setErr;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

<<<<<<< HEAD
  // Restore session on mount, then subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
=======
  // On mount — restore session from secure storage.
  // Prefer the refresh token: the access token is likely expired by the time
  // the user reopens the app, so refreshing proactively avoids a guaranteed 401.
  useEffect(() => {
    (async () => {
      try {
        const storedRefresh = await SecureStore.getItemAsync('refresh_token');
        if (storedRefresh) {
          const { session, user: authUser } = await refreshSession(storedRefresh);
          await SecureStore.setItemAsync('access_token', session.access_token);
          await SecureStore.setItemAsync('refresh_token', session.refresh_token);
          setUser(authUser);
        } else {
          // Legacy install (pre-refresh-token) — fall back to validating the access token.
          const token = await SecureStore.getItemAsync('access_token');
          if (token) {
            const me = await getMe();
            setUser(me);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
      } finally {
        setIsLoading(false);
      }
    })();
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc
  }, []);

  const user = mapUser(session);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, router]);

  const login = useCallback(async (email: string, password: string) => {
<<<<<<< HEAD
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
=======
    const { session, user: authUser } = await signIn(email, password);
    await SecureStore.setItemAsync('access_token', session.access_token);
    await SecureStore.setItemAsync('refresh_token', session.refresh_token);
    setUser(authUser);
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
<<<<<<< HEAD
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: displayName ? { data: { display_name: displayName } } : undefined,
      });
      if (error) throw error;
=======
      const { session, user: authUser } = await signUp(email, password, displayName);
      await SecureStore.setItemAsync('access_token', session.access_token);
      await SecureStore.setItemAsync('refresh_token', session.refresh_token);
      setUser(authUser);
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    await openOAuthFlow('google');
  }, []);

  const signInWithApple = useCallback(async () => {
    await openOAuthFlow('apple');
  }, []);

  const logout = useCallback(async () => {
<<<<<<< HEAD
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, isLoading, login, register, signInWithGoogle, signInWithApple, logout }}>
      {children}
=======
    try {
      await signOut();
    } catch {
      // Ignore — token may already be invalid
    }
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1B2B45' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        children
      )}
>>>>>>> 91d2c94e478f137ee509785743f06e7cb0ca26fc
    </AuthContext.Provider>
  );
}
