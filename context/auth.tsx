import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthUser, getMe, refreshSession, signIn, signOut, signUp } from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

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
  }, []);

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
    const { session, user: authUser } = await signIn(email, password);
    await SecureStore.setItemAsync('access_token', session.access_token);
    await SecureStore.setItemAsync('refresh_token', session.refresh_token);
    setUser(authUser);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { session, user: authUser } = await signUp(email, password, displayName);
      await SecureStore.setItemAsync('access_token', session.access_token);
      await SecureStore.setItemAsync('refresh_token', session.refresh_token);
      setUser(authUser);
    },
    [],
  );

  const logout = useCallback(async () => {
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
    </AuthContext.Provider>
  );
}
