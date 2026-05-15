import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTrips, getTripStats, type Trip, type TripStats } from '@/lib/api';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDistance(km: number | null): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function formatDuration(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.round(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m} min`;
}

function tripPlace(name: string | null, address: string | null, fallback: string): string {
  if (name && name.trim()) return name;
  if (address && address.trim()) return address.split(',')[0];
  return fallback;
}

function formatTotalDistance(km: number): string {
  if (km >= 100) return `${km.toFixed(0)} km`;
  return `${km.toFixed(1)} km`;
}

function formatTotalDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m} min`;
}

function formatTotalCo2(kg: number): string {
  if (kg < 1) return `${(kg * 1000).toFixed(0)} g`;
  return `${kg.toFixed(2)} kg`;
}

export default function TripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetching = useRef(false);

  const loadPage = useCallback(async (pageToLoad: number, replace = false) => {
    if (isFetching.current) return;
    isFetching.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getTrips(pageToLoad, 20);
      const newTrips = result?.trips ?? [];
      const pagination = result?.pagination ?? { page: pageToLoad, limit: 20, total: newTrips.length, total_pages: 1 };
      setTrips(prev => replace ? newTrips : [...prev, ...newTrips]);
      setPage(pagination.page);
      setHasMore(pagination.page < pagination.total_pages);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load trips');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, []);

  // Aggregate happens in Postgres (one row over the wire) instead of
  // pulling every trip and reducing on the client. Scoped to the current
  // calendar month — the all-time total lives on the Carbon tab.
  const loadStats = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const s = await getTripStats({ since: monthStart });
      setStats(s);
    } catch {
      // Non-fatal: just hide the stats card if the call fails.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadPage(1, true);
    loadStats();
  }, [loadPage, loadStats]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPage(1, true), loadStats()]);
    setRefreshing(false);
  }, [loadPage, loadStats]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loading) return;
    loadPage(page + 1, false);
  }, [hasMore, loading, page, loadPage]);

  const renderItem = useCallback(({ item }: { item: Trip }) => {
    const origin = tripPlace(item.origin_name, item.origin_address, 'Origin');
    const dest = tripPlace(item.dest_name, item.dest_address, 'Destination');
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => router.push({ pathname: '/trip-detail', params: { tripId: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{formatDate(item.started_at)}</Text>
          <View style={[styles.statusBadge, item.status === 'ended' ? styles.statusEnded : styles.statusCancelled]}>
            <Text style={[styles.statusText, item.status === 'ended' ? styles.statusTextEnded : styles.statusTextCancelled]}>
              {item.status}
            </Text>
          </View>
        </View>

        <View style={styles.route}>
          <View style={styles.routeLine}>
            <View style={[styles.dot, { backgroundColor: '#1B2B45' }]} />
            <View style={styles.routeBar} />
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          </View>
          <View style={styles.routeText}>
            <Text style={styles.placeName} numberOfLines={1}>{origin}</Text>
            <View style={{ height: 8 }} />
            <Text style={styles.placeName} numberOfLines={1}>{dest}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <MaterialIcons color="#6B7280" name="straighten" size={14} />
            <Text style={styles.statText}>{formatDistance(item.distance_km)}</Text>
          </View>
          <View style={styles.stat}>
            <MaterialIcons color="#6B7280" name="schedule" size={14} />
            <Text style={styles.statText}>{formatDuration(item.duration_sec)}</Text>
          </View>
          {item.co2_kg != null && (
            <View style={styles.stat}>
              <MaterialIcons color="#16A34A" name="eco" size={14} />
              <Text style={[styles.statText, { color: '#16A34A' }]}>
                {item.co2_kg.toFixed(2)} kg CO₂
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  const ListEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyBox}>
          <ActivityIndicator color="#1B2B45" />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <MaterialIcons color="#DC2626" name="error-outline" size={48} />
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadPage(1, true)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <MaterialIcons color="#CBD5E1" name="explore-off" size={48} />
        <Text style={styles.emptyText}>No trips yet. Start a trip from the home screen.</Text>
      </View>
    );
  };

  const ListFooter = () => {
    if (!hasMore || trips.length === 0) return null;
    return (
      <View style={{ paddingVertical: 16 }}>
        <ActivityIndicator color="#9CA3AF" />
      </View>
    );
  };

  const ListHeader = () => {
    if (!stats || trips.length === 0) return null;
    return (
      <View style={styles.statsCard}>
        <Text style={styles.statsCardTitle}>
          This month · {new Date().toLocaleDateString(undefined, { month: 'long' })}
        </Text>
        <View style={styles.statsGrid}>
          <View style={styles.statsCell}>
            <MaterialIcons color="#7C3AED" name="route" size={20} />
            <Text style={styles.statsValue}>{stats.total_trips}</Text>
            <Text style={styles.statsLabel}>Trips</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCell}>
            <MaterialIcons color="#3B82F6" name="straighten" size={20} />
            <Text style={styles.statsValue}>{formatTotalDistance(stats.total_distance_km)}</Text>
            <Text style={styles.statsLabel}>Distance</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCell}>
            <MaterialIcons color="#D97706" name="schedule" size={20} />
            <Text style={styles.statsValue}>{formatTotalDuration(stats.total_duration_sec)}</Text>
            <Text style={styles.statsLabel}>Duration</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsCell}>
            <MaterialIcons color="#16A34A" name="eco" size={20} />
            <Text style={[styles.statsValue, { color: '#16A34A' }]}>
              {formatTotalCo2(stats.total_co2_kg)}
            </Text>
            <Text style={styles.statsLabel}>CO₂</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Trips</Text>
        <Text style={styles.subtitle}>Your driving history</Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={trips.length === 0 ? styles.listEmpty : styles.list}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7' },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },

  statsCard: {
    backgroundColor: '#1B2B45',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  statsCardTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row', alignItems: 'center',
  },
  statsCell: { flex: 1, alignItems: 'center', gap: 4 },
  statsDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.12)' },
  statsValue: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  statsLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  date: { fontSize: 12, color: '#6B7280', fontWeight: '700' },

  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusEnded: { backgroundColor: '#DCFCE7' },
  statusCancelled: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusTextEnded: { color: '#16A34A' },
  statusTextCancelled: { color: '#DC2626' },

  route: { flexDirection: 'row', marginBottom: 14 },
  routeLine: { alignItems: 'center', marginRight: 12, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeBar: { width: 2, height: 22, backgroundColor: '#E5E7EB', marginVertical: 2 },
  routeText: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '700', color: '#111827' },

  statsRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  emptyBox: { alignItems: 'center', gap: 12, padding: 48 },
  emptyText: { color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: 8, backgroundColor: '#1B2B45',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
