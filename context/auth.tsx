import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { AuthUser, getMe, signIn, signOut, signUp } from '@/lib/api';

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

  // On mount — restore session from secure storage
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
          const me = await getMe();
          setUser(me);
        }
      } catch {
        await SecureStore.deleteItemAsync('access_token');
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
    setUser(authUser);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { session, user: authUser } = await signUp(email, password, displayName);
      await SecureStore.setItemAsync('access_token', session.access_token);
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
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
