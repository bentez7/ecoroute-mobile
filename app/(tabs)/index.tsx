import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MapboxGL from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { searchRoutes, type RouteLabel, type RouteOption } from '@/lib/api';

interface RouteCardMeta {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: string;
  surface: string;
}

const CARD_META: Record<RouteLabel, RouteCardMeta> = {
  eco: { title: 'Eco Route', icon: 'eco', tint: '#16A34A', surface: '#DCFCE7' },
  fastest: { title: 'Fastest Route', icon: 'bolt', tint: '#64748B', surface: '#F1F5F9' },
  balanced: { title: 'Balanced Route', icon: 'balance', tint: '#7C3AED', surface: '#EDE9FE' },
};

// Demo destination (Shah Alam, Selangor) so the user can tap "Use demo" quickly.
const DEMO_DEST = { lat: 3.0738, lng: 101.5183, label: 'Demo: Shah Alam' };

function fmtDuration(sec: number): string {
  if (sec < 60) return '< 1 min';
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function co2FromEnergy(kwh: number): number {
  // Rough grid-average CO2 factor: 0.7 kg / kWh
  return kwh * 0.7;
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [destInput, setDestInput] = useState(`${DEMO_DEST.lat}, ${DEMO_DEST.lng}`);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<RouteLabel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask for location on mount so we can use GPS as origin
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setOrigin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        /* user can still proceed without GPS origin */
      }
    })();
  }, []);

  const handleFindRoutes = useCallback(async () => {
    setError(null);

    if (!origin) {
      setError('Waiting for GPS — grant location permission and try again.');
      return;
    }
    const parts = destInput.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) {
      setError('Destination must be "lat, lng" (e.g. 3.0738, 101.5183).');
      return;
    }
    const [destLat, destLng] = parts;

    setLoading(true);
    try {
      const options = await searchRoutes({
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        dest_lat: destLat,
        dest_lng: destLng,
      });
      setRoutes(options);
      setSelectedLabel(options.find((o) => o.label === 'eco')?.label ?? options[0]?.label ?? null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message ??
        'Failed to fetch routes.';
      setError(msg);
      setRoutes([]);
      setSelectedLabel(null);
    } finally {
      setLoading(false);
    }
  }, [origin, destInput]);

  const handleStartNavigation = useCallback(() => {
    const selected = routes.find((r) => r.label === selectedLabel);
    if (!selected) return;
    const parts = destInput.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) return;
    router.push({
      pathname: '/navigate',
      params: {
        polyline: selected.polyline,
        label: selected.label,
        destLat: String(parts[0]),
        destLng: String(parts[1]),
      },
    });
  }, [routes, selectedLabel, destInput, router]);

  const hasRoutes = routes.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
            </View>
            <View>
              <Text style={styles.brandTitle}>EcoRoute</Text>
              <Text style={styles.brandSub}>Carbon-smart navigation</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {user ? (
              <View style={styles.userChip}>
                <MaterialIcons color="#4ADE80" name="person" size={14} />
                <Text style={styles.userChipText} numberOfLines={1}>
                  {user.display_name ?? user.email}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.tuneBtn} onPress={logout}>
              <MaterialIcons color="#C8D4E4" name="logout" size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Map preview */}
        <View style={styles.mapCard}>
          <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Street}>
            <MapboxGL.Camera
              zoomLevel={12}
              centerCoordinate={
                origin ? [origin.lng, origin.lat] : [101.6869, 3.139]
              }
            />
            {origin ? <MapboxGL.UserLocation visible /> : null}
          </MapboxGL.MapView>
        </View>

        <View style={styles.body}>
          {/* Destination input */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Destination</Text>
            <TouchableOpacity
              onPress={() => setDestInput(`${DEMO_DEST.lat}, ${DEMO_DEST.lng}`)}>
              <Text style={styles.sectionHint}>Use demo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.destRow}>
            <TextInput
              style={styles.destInput}
              value={destInput}
              onChangeText={setDestInput}
              placeholder="lat, lng"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.searchBtn, loading && styles.btnDisabled]}
              onPress={handleFindRoutes}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <MaterialIcons color="#FFFFFF" name="search" size={22} />
              )}
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons color="#DC2626" name="error-outline" size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Route cards */}
          {hasRoutes ? (
            <>
              <View style={[styles.sectionHeader, { marginTop: 18 }]}>
                <Text style={styles.sectionTitle}>Choose Your Route</Text>
                <Text style={styles.sectionHint}>{routes.length} options</Text>
              </View>

              {routes.map((route) => {
                const meta = CARD_META[route.label];
                const active = route.label === selectedLabel;
                const isEco = route.label === 'eco';
                return (
                  <TouchableOpacity
                    key={route.label}
                    activeOpacity={0.85}
                    onPress={() => setSelectedLabel(route.label)}
                    style={[styles.routeCard, active && styles.routeCardActive]}>
                    <View style={[styles.routeIcon, { backgroundColor: meta.surface }]}>
                      <MaterialIcons color={meta.tint} name={meta.icon} size={22} />
                    </View>
                    <View style={styles.routeBody}>
                      <View style={styles.routeTopRow}>
                        <Text style={styles.routeTitle}>{meta.title}</Text>
                        {isEco ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                              {route.energy_kwh.toFixed(2)} kWh
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.routeMeta}>
                        {fmtDuration(route.duration_sec)}
                        {'  ·  '}
                        {route.distance_km.toFixed(1)} km
                        {'  ·  '}
                        {co2FromEnergy(route.energy_kwh).toFixed(1)} kg CO₂
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.ctaBtn, !selectedLabel && styles.btnDisabled]}
                onPress={handleStartNavigation}
                disabled={!selectedLabel}>
                <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
                <Text style={styles.ctaText}>Start Navigation</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <MaterialIcons color="#9CA3AF" name="route" size={36} />
              <Text style={styles.emptyText}>
                Enter a destination and tap search to find eco routes.
              </Text>
            </View>
          )}

          {/* DEV-ONLY: simulate TBT with a hardcoded polyline. Remove with app/dev-navigate.tsx */}
          <TouchableOpacity
            style={styles.devBtn}
            onPress={() => router.push('/dev-navigate')}>
            <MaterialIcons color="#FBBF24" name="science" size={14} />
            <Text style={styles.devBtnText}>Dev: Simulate TBT</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B2B45' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#1B2B45',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  brandSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 1 },
  tuneBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
    maxWidth: 120,
  },
  userChipText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },

  mapCard: {
    marginHorizontal: 16,
    borderRadius: 24,
    marginBottom: -20,
    zIndex: 1,
    overflow: 'hidden',
    height: 220,
  },
  map: { flex: 1 },

  body: {
    backgroundColor: '#F4F5F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 36,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  sectionHint: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  destRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  destInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 14,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },

  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  routeCardActive: {
    borderColor: '#1B2B45',
    borderWidth: 2,
    shadowColor: '#1B2B45',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  routeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  routeBody: { flex: 1 },
  routeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  badge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: '#16A34A', fontSize: 12, fontWeight: '700' },
  routeMeta: { color: '#6B7280', fontSize: 13, fontWeight: '500' },

  emptyCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: { color: '#6B7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  ctaBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 18,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },

  // DEV-ONLY
  devBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FBBF24',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  devBtnText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
});
