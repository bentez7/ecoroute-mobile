import MaterialIcons from '@expo/vector-icons/MaterialIcons';
// import MapboxGL from '@rnmapbox/maps';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';

const routeOptions = [
  {
    id: 'eco',
    title: 'Eco Route',
    icon: 'eco',
    duration: '28 min',
    distance: '15.2 km',
    emission: '2.8 kg CO₂',
    badge: '-35% CO₂',
    active: true,
    tint: '#16A34A',
    surface: '#DCFCE7',
  },
  {
    id: 'fastest',
    title: 'Fastest Route',
    icon: 'bolt',
    duration: '22 min',
    distance: '18.5 km',
    emission: '4.3 kg CO₂',
    tint: '#64748B',
    surface: '#F1F5F9',
  },
  {
    id: 'shortest',
    title: 'Shortest Route',
    icon: 'alt-route',
    duration: '25 min',
    distance: '14.8 km',
    emission: '3.2 kg CO₂',
    badge: '-25% CO₂',
    tint: '#7C3AED',
    surface: '#EDE9FE',
  },
];

const metrics = [
  { label: 'Battery saved', value: '12%' },
  { label: 'CO₂ this week', value: '18.5 kg' },
  { label: 'Green trips', value: '09' },
];

export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

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

        {/* Map Card */}
        <View style={styles.mapCard}>
          {/* TODO: uncomment when using dev build
          <MapboxGL.MapView style={styles.map} styleURL={MapboxGL.StyleURL.Street}>
            <MapboxGL.Camera zoomLevel={12} centerCoordinate={[101.6869, 3.139]} />
          </MapboxGL.MapView>
          */}
          <View style={[styles.map, styles.mapPlaceholder]}>
            <MaterialIcons color="rgba(255,255,255,0.4)" name="map" size={48} />
            <Text style={styles.mapPlaceholderText}>Map unavailable in Expo Go</Text>
          </View>
        </View>

        <View style={styles.body}>

          {/* Route Options */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Choose Your Route</Text>
            <Text style={styles.sectionHint}>3 options</Text>
          </View>

          {routeOptions.map((route) => (
            <TouchableOpacity
              key={route.id}
              activeOpacity={0.85}
              style={[styles.routeCard, route.active && styles.routeCardActive]}>
              <View style={[styles.routeIcon, { backgroundColor: route.surface }]}>
                <MaterialIcons color={route.tint} name={route.icon as never} size={22} />
              </View>
              <View style={styles.routeBody}>
                <View style={styles.routeTopRow}>
                  <Text style={styles.routeTitle}>{route.title}</Text>
                  {route.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{route.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.routeMeta}>
                  {route.duration}  ·  {route.distance}  ·  {route.emission}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Metrics */}
          <View style={styles.metricsRow}>
            {metrics.map((m) => (
              <View key={m.label} style={styles.metricCard}>
                <Text style={styles.metricValue}>{m.value}</Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity activeOpacity={0.9} style={styles.ctaBtn}>
            <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
            <Text style={styles.ctaText}>Start Navigation</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B2B45' },

  // Header
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

  // Map card
  mapCard: {
    marginHorizontal: 16,
    borderRadius: 24,
    marginBottom: -20,
    zIndex: 1,
    overflow: 'hidden',
    height: 220,
  },
  map: { flex: 1 },
  mapPlaceholder: {
    backgroundColor: '#2C3E5A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPlaceholderText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  locationBox: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  locationLabel: { color: '#6B7280', fontSize: 12, marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  locationText: { color: '#111827', fontSize: 16, fontWeight: '700', flex: 1 },

  // Body
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
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  sectionHint: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  // Route cards
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

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricValue: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  metricLabel: { fontSize: 11, color: '#6B7280', lineHeight: 15 },

  // CTA
  ctaBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 18,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
});
