import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { api, type PlaceSuggestion, type Trip } from '@/lib/api';

type RecentPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const cameraRef = useRef<MapboxGL.Camera>(null);

  // Delay map render until screen transition settles
  const [screenReady, setScreenReady] = useState(false);
  useFocusEffect(useCallback(() => {
    const t = setTimeout(() => setScreenReady(true), 100);
    return () => clearTimeout(t);
  }, []));

  const KL_DEFAULT: [number, number] = [101.6869, 3.1390];
  const [userCoords, setUserCoords] = useState<[number, number]>(KL_DEFAULT);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  const [destQuery, setDestQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request location permission + seed initial position
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationGranted(false);
          return;
        }
        setLocationGranted(true);
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserCoords([pos.coords.longitude, pos.coords.latitude]);
      } catch {
        setLocationGranted(false);
      }
    })();
  }, []);

  const openSettings = useCallback(() => {
    Alert.alert(
      'Location needed',
      'EcoRoute needs location access to plan routes from where you are. Open settings to enable it?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }, []);

  // Load recent trip destinations
  useFocusEffect(useCallback(() => {
    api.trips.list()
      .then((trips: Trip[]) => {
        const seen = new Set<string>();
        const recent: RecentPlace[] = [];
        for (const t of trips) {
          const key = `${t.dest_lat.toFixed(4)},${t.dest_lng.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          recent.push({
            name:    t.dest_address?.split(',')[0] ?? 'Destination',
            address: t.dest_address ?? `${t.dest_lat.toFixed(4)}, ${t.dest_lng.toFixed(4)}`,
            lat:     t.dest_lat,
            lng:     t.dest_lng,
          });
          if (recent.length >= 5) break;
        }
        setRecentPlaces(recent);
      })
      .catch(() => {});
  }, []));

  // Debounced autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (destQuery.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoadingSuggestions(true);
        const results = await api.places.autocomplete(destQuery, userCoords[1], userCoords[0]);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [destQuery, userCoords]);

  const goToRouteSelect = useCallback((p: { name: string; address: string; lat: number; lng: number }) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      console.warn('[home] suggestion missing coords, ignoring:', p);
      Alert.alert('No location', `"${p.name}" is missing location data. Please pick another result.`);
      return;
    }
    if (!Number.isFinite(userCoords[0]) || !Number.isFinite(userCoords[1])) {
      console.warn('[home] userCoords not ready, ignoring tap. userCoords =', userCoords);
      Alert.alert('Location not ready', 'Still getting your location. Please try again in a moment.');
      return;
    }
    router.push({
      pathname: '/route-select',
      params: {
        destName:    p.name,
        destAddress: p.address,
        destLat:     String(p.lat),
        destLng:     String(p.lng),
        originLat:   String(userCoords[1]),
        originLng:   String(userCoords[0]),
      },
    });
  }, [router, userCoords]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
          {user && (
            <View style={styles.userChip}>
              <MaterialIcons color="#4ADE80" name="person" size={14} />
              <Text style={styles.userChipText} numberOfLines={1}>
                {user.display_name ?? user.email}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={logout}>
            <MaterialIcons color="#C8D4E4" name="logout" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapCard}>
        {screenReady && (
          <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Street}>
            <MapboxGL.Camera ref={cameraRef} followUserLocation followZoomLevel={14} />
            <MapboxGL.UserLocation
              visible
              onUpdate={(loc) => {
                const lng = loc?.coords?.longitude;
                const lat = loc?.coords?.latitude;
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                  setUserCoords([lng, lat]);
                } else {
                  console.warn('[home] UserLocation.onUpdate missing coords:', loc);
                }
              }}
            />
          </MapboxGL.MapView>
        )}
      </View>

      {/* Search panel */}
      <View style={styles.panel}>
        {locationGranted === false && (
          <TouchableOpacity style={styles.permissionBanner} onPress={openSettings}>
            <MaterialIcons color="#B45309" name="location-off" size={18} />
            <Text style={styles.permissionText} numberOfLines={2}>
              Location access denied — tap to enable in Settings. Routes will use Kuala Lumpur as fallback.
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.searchBar}>
          <MaterialIcons color="#6B7280" name="search" size={20} />
          <TextInput
            style={styles.searchInput}
            placeholder="Where to?"
            placeholderTextColor="#9CA3AF"
            value={destQuery}
            onChangeText={setDestQuery}
            returnKeyType="search"
          />
          {loadingSuggestions && <ActivityIndicator size="small" color="#6B7280" />}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Autocomplete results */}
          {suggestions.length > 0 && (
            <View style={styles.listCard}>
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={s.place_id ?? i}
                  style={[styles.row, i < suggestions.length - 1 && styles.rowBorder]}
                  onPress={() => goToRouteSelect({
                    name:    s.name,
                    address: s.full_address,
                    lat:     s.lat,
                    lng:     s.lng,
                  })}
                >
                  <View style={styles.rowIcon}>
                    <MaterialIcons color="#6B7280" name="place" size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{s.full_address}</Text>
                  </View>
                  <MaterialIcons color="#9CA3AF" name="chevron-right" size={22} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recent trips — only when not searching */}
          {destQuery.length < 2 && recentPlaces.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Recent</Text>
              <View style={styles.listCard}>
                {recentPlaces.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.row, i < recentPlaces.length - 1 && styles.rowBorder]}
                    onPress={() => goToRouteSelect(p)}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: '#EFF6FF' }]}>
                      <MaterialIcons color="#3B82F6" name="history" size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{p.address}</Text>
                    </View>
                    <MaterialIcons color="#9CA3AF" name="chevron-right" size={22} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {destQuery.length < 2 && recentPlaces.length === 0 && (
            <View style={styles.emptyBox}>
              <MaterialIcons color="#CBD5E1" name="explore" size={40} />
              <Text style={styles.emptyText}>Search for a destination to start planning an eco-friendly route.</Text>
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
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
    paddingBottom: 14,
    backgroundColor: '#1B2B45',
  },
  brandRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  brandTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  brandSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 1 },
  userChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 10, height: 40, maxWidth: 120,
  },
  userChipText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },

  mapCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    height: 260,
    marginBottom: -20,
    zIndex: 1,
  },
  map: { flex: 1 },

  panel: {
    backgroundColor: '#F4F5F7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 16,
    flex: 1,
  },

  permissionBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  permissionText: {
    flex: 1, color: '#92400E', fontSize: 13, fontWeight: '600',
  },

  searchBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '600', padding: 0 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginLeft: 4,
  },

  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  emptyBox: {
    alignItems: 'center', padding: 32, gap: 10,
  },
  emptyText: {
    color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },
});
