import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { updateProfile as updateProfileHelper } from '@/lib/profile';

export interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: { display_name?: string }) => Promise<void>;
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
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: displayName ? { data: { display_name: displayName } } : undefined,
      });
      if (error) throw error;
    },
    [],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (updates: { display_name?: string }) => {
      await updateProfileHelper(updates);
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{ user, session, isLoading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
