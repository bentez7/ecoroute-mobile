import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const confirmLogout = useCallback(() => {
    Alert.alert('Sign out?', 'You will need to sign in again to use EcoRoute.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.display_name, user?.email)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.display_name ?? 'EcoRoute user'}
            </Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.listCard}>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={() => router.push('/my-vehicles')}
          >
            <View style={styles.rowIcon}>
              <MaterialIcons color="#1B2B45" name="directions-car" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>My Vehicles</Text>
              <Text style={styles.rowSub}>Manage saved vehicles</Text>
            </View>
            <MaterialIcons color="#9CA3AF" name="chevron-right" size={22} />
          </TouchableOpacity>

          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowIcon}>
              <MaterialIcons color="#1B2B45" name="notifications" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSub}>Trip updates and reminders</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialIcons color="#1B2B45" name="privacy-tip" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Privacy & Security</Text>
              <Text style={styles.rowSub}>Data and account settings</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.signOut} onPress={confirmLogout}>
          <MaterialIcons color="#DC2626" name="logout" size={18} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7' },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF',
    margin: 16, padding: 16,
    borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1B2B45',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  email: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 20, marginTop: 8, marginBottom: 8,
  },

  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 24,
    backgroundColor: '#FEE2E2',
    borderRadius: 14, height: 50,
  },
  signOutText: { color: '#DC2626', fontSize: 15, fontWeight: '800' },
});
