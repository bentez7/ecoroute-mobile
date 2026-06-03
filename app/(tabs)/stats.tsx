import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMe, type AuthUser } from '@/lib/api';

// One mature tree absorbs ~21 kg CO2 per year (US EPA).
const KG_CO2_PER_TREE_YEAR = 21;
// Average ICE passenger car: ~0.18 kg CO2 per km.
const KG_CO2_PER_KM_BASELINE = 0.18;

function fmtKg(kg: number): string {
  if (kg < 1) return `${(kg * 1000).toFixed(0)} g`;
  if (kg >= 100) return `${kg.toFixed(0)} kg`;
  return `${kg.toFixed(2)} kg`;
}

function fmtKm(km: number): string {
  if (km >= 100) return `${km.toFixed(0)} km`;
  return `${km.toFixed(1)} km`;
}

export default function CarbonFootprintScreen() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const user = await getMe();
      setMe(user);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load carbon footprint');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalCo2 = me?.total_co2_kg ?? 0;
  const treesNeeded = totalCo2 / KG_CO2_PER_TREE_YEAR;
  const equivKm = totalCo2 / KG_CO2_PER_KM_BASELINE;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Carbon Footprint</Text>
          <Text style={styles.subtitle}>Your cumulative emissions</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <MaterialIcons color="#FFFFFF" name="error-outline" size={32} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setLoading(true); load().finally(() => setLoading(false)); }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Hero — total CO₂ */}
            <View style={styles.heroCard}>
              <View style={styles.heroIconRow}>
                <MaterialIcons color="#4ADE80" name="eco" size={20} />
                <Text style={styles.heroLabel}>Total CO₂ emitted</Text>
              </View>
              <Text style={styles.heroValue}>{fmtKg(totalCo2)}</Text>
              <Text style={styles.heroUnit}>
                across all your trips
              </Text>
            </View>

            <View style={styles.body}>
              {totalCo2 > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>What that looks like</Text>

                  <View style={styles.equivCard}>
                    <View style={styles.equivIconBox}>
                      <MaterialIcons color="#16A34A" name="park" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>
                        {treesNeeded < 0.1
                          ? `${(treesNeeded * 10).toFixed(1)} tree-months`
                          : `${treesNeeded.toFixed(1)} trees`}
                      </Text>
                      <Text style={styles.equivSub}>
                        needed for one year to absorb your emissions
                      </Text>
                    </View>
                  </View>

                  <View style={styles.equivCard}>
                    <View style={[styles.equivIconBox, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialIcons color="#D97706" name="directions-car" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>{fmtKm(equivKm)}</Text>
                      <Text style={styles.equivSub}>
                        equivalent driving by an average petrol car
                      </Text>
                    </View>
                  </View>

                  <View style={styles.gamifyHeaderRow}>
                    <Text style={styles.sectionTitle}>Reduce your footprint</Text>
                    <View style={styles.comingSoonPill}>
                      <Text style={styles.comingSoonText}>Coming soon</Text>
                    </View>
                  </View>
                  <Text style={styles.gamifySubtitle}>
                    Join programs and challenges that reward greener travel choices.
                  </Text>

                  <View style={styles.programCard}>
                    <View style={[styles.equivIconBox, { backgroundColor: '#E0F2FE' }]}>
                      <MaterialIcons color="#0284C7" name="emoji-events" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>Weekly Eco Challenges</Text>
                      <Text style={styles.equivSub}>
                        Hit weekly low-emission trip goals to earn badges and streaks.
                      </Text>
                    </View>
                    <MaterialIcons color="#9CA3AF" name="lock-outline" size={20} />
                  </View>

                  <View style={styles.programCard}>
                    <View style={[styles.equivIconBox, { backgroundColor: '#F3E8FF' }]}>
                      <MaterialIcons color="#7C3AED" name="leaderboard" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>Community Leaderboard</Text>
                      <Text style={styles.equivSub}>
                        Compare your CO₂ savings with friends and climb the ranks.
                      </Text>
                    </View>
                    <MaterialIcons color="#9CA3AF" name="lock-outline" size={20} />
                  </View>

                  <View style={styles.programCard}>
                    <View style={[styles.equivIconBox, { backgroundColor: '#DCFCE7' }]}>
                      <MaterialIcons color="#16A34A" name="redeem" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>Green Rewards</Text>
                      <Text style={styles.equivSub}>
                        Redeem points from greener trips for partner perks and tree planting.
                      </Text>
                    </View>
                    <MaterialIcons color="#9CA3AF" name="lock-outline" size={20} />
                  </View>

                  <View style={styles.programCard}>
                    <View style={[styles.equivIconBox, { backgroundColor: '#FEE2E2' }]}>
                      <MaterialIcons color="#DC2626" name="flag" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equivTitle}>Personal Carbon Goal</Text>
                      <Text style={styles.equivSub}>
                        Set a monthly cap and get nudges when you're close to hitting it.
                      </Text>
                    </View>
                    <MaterialIcons color="#9CA3AF" name="lock-outline" size={20} />
                  </View>
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <MaterialIcons color="#9CA3AF" name="eco" size={36} />
                  <Text style={styles.emptyTitle}>No emissions tracked yet</Text>
                  <Text style={styles.emptyText}>
                    Complete a trip from the home screen to start tracking your carbon footprint.
                  </Text>
                </View>
              )}

              <View style={{ height: 32 }} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B2B45' },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  loadingBox: { padding: 48, alignItems: 'center' },
  errorBox: { padding: 32, alignItems: 'center', gap: 12 },
  errorText: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#1B2B45', fontSize: 14, fontWeight: '800' },

  heroCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 28,
    backgroundColor: '#0F1C30',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
    alignItems: 'flex-start',
  },
  heroIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  heroValue: { color: '#FFFFFF', fontSize: 56, fontWeight: '800', letterSpacing: -1.5 },
  heroUnit: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },

  body: {
    backgroundColor: '#F4F5F7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 48,
    minHeight: 360,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },

  equivCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  equivIconBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  equivTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  equivSub: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },

  gamifyHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, marginBottom: 4,
  },
  comingSoonPill: {
    backgroundColor: '#E0E7FF', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  comingSoonText: { fontSize: 11, fontWeight: '800', color: '#4338CA', letterSpacing: 0.3 },
  gamifySubtitle: { fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 16 },

  programCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 14,
    marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8,
    marginTop: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 4 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
});
