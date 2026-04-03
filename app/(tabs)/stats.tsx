import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- Dummy data based on paper metrics ---
const DRIVER_PROFILE = 'Moderate';        // XGBoost cluster: Smooth / Moderate / Aggressive
const CO2_SAVED_KG   = 18.4;             // FASTSim estimated CO₂ saved vs aggressive baseline
const ENERGY_REDUCTION = 15;             // % energy reduction vs aggressive (paper target: 15–25%)
const ECO_POINTS     = 1_840;
const POINTS_CAP     = 2_500;            // Gold tier threshold

// CO₂ thresholds per trip (~15 km) derived from FASTSim Table 2
// Smooth < 2.5 kg · Moderate 2.5–3.5 kg · Aggressive > 3.5 kg
const profileColour: Record<string, string> = {
  Smooth:     '#16A34A',   // green
  Moderate:   '#EAB308',   // yellow
  Aggressive: '#EF4444',   // red
};

const profileBg: Record<string, string> = {
  Smooth:     '#DCFCE7',
  Moderate:   '#FEF9C3',
  Aggressive: '#FEE2E2',
};

function co2Profile(kg: number): string {
  if (kg < 2.5) return 'Smooth';
  if (kg <= 3.5) return 'Moderate';
  return 'Aggressive';
}

// Behavioural feature scores from XGBoost (r values mapped to 0–100 scale)
const behaviourMetrics = [
  { label: 'Acceleration Control', value: 88, r: 0.82, colour: '#16A34A' },
  { label: 'Braking Smoothness',   value: 81, r: 0.76, colour: '#16A34A' },
  { label: 'Speed Consistency',    value: 74, r: 0.68, colour: '#EAB308' },
  { label: 'Idle Reduction',       value: 62, r: 0.45, colour: '#EAB308' },
];

// co2Emitted = actual CO₂ produced that trip (determines colour label)
const tripHistory = [
  { route: 'Home → Monash University', date: 'Today, 8:05 AM',     pts: '+90', co2Emitted: 2.1 },
  { route: 'Uni → Sunway Pyramid',     date: 'Today, 12:30 PM',    pts: '+60', co2Emitted: 2.9 },
  { route: 'Sunway → Home',            date: 'Yesterday, 6:45 PM', pts: '+85', co2Emitted: 2.2 },
  { route: 'Home → KL Sentral',        date: 'Mon, 9:00 AM',       pts: '+40', co2Emitted: 3.8 },
];

// Malaysia fuel prices (dummy, updated 26 Mar 2026)
const fuelPrices = [
  { type: 'RON95',  icon: '⛽', subsidised: 2.05, pump: 3.87 },
  { type: 'RON97',  icon: '⛽', subsidised: null,  pump: 4.35 },
  { type: 'Diesel', icon: '🚛', subsidised: 2.15, pump: 3.35 },
];

const howToEarn = [
  { icon: 'speed',        title: 'Smooth Acceleration',  desc: 'Keep acceleration variance below 0.5 m/s² per segment.' },
  { icon: 'do-not-touch', title: 'Gentle Braking',       desc: 'Fewer than 1 braking event per km improves your score.' },
  { icon: 'route',        title: 'Choose Eco Routes',    desc: 'Select the lowest CO₂ route — estimated by FASTSim.' },
  { icon: 'timer-off',    title: 'Reduce Idling',        desc: 'Minimise engine idle time to save fuel and earn bonus pts.' },
];

export default function StatsScreen() {
  const ringPct = ECO_POINTS / POINTS_CAP;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <MaterialIcons name="eco" size={16} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>EcoRoute</Text>
              <Text style={styles.headerSub}>Carbon-smart navigation</Text>
            </View>
          </View>
        </View>

        {/* ── Driver Profile + CO₂ Hero Card ── */}
        <View style={styles.heroCard}>

          {/* Profile pills */}
          <View style={styles.profilePills}>
            {['Smooth', 'Moderate', 'Aggressive'].map((p) => (
              <View
                key={p}
                style={[
                  styles.pill,
                  DRIVER_PROFILE === p
                    ? { backgroundColor: profileColour[p] }
                    : styles.pillInactive,
                ]}>
                <Text style={[styles.pillText, DRIVER_PROFILE !== p && styles.pillTextInactive]}>
                  {p}
                </Text>
              </View>
            ))}
          </View>

          {/* CO₂ + Ring row */}
          <View style={styles.heroRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>CO₂ Saved This Month</Text>
              <Text style={styles.heroValue}>{CO2_SAVED_KG} kg</Text>
              <Text style={styles.heroSub}>
                ↓ {ENERGY_REDUCTION}% energy vs aggressive baseline
              </Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>🌱 ≈ 1 tree planted</Text>
              </View>
            </View>

            {/* Circular ring */}
            <View style={styles.ring}>
              <View style={[styles.ringInner, { borderColor: profileColour[DRIVER_PROFILE] }]}>
                <MaterialIcons name="eco" size={20} color="#FFFFFF" />
                <Text style={styles.ringPct}>{Math.round(ringPct * 100)}%</Text>
                <Text style={styles.ringLabel}>to Gold</Text>
              </View>
            </View>
          </View>

          {/* Eco points row */}
          <View style={styles.pointsRow}>
            <View>
              <Text style={styles.pointsLabel}>Eco Points</Text>
              <Text style={styles.pointsValue}>{ECO_POINTS.toLocaleString()} pts</Text>
            </View>
            <Text style={styles.pointsRemain}>
              {(POINTS_CAP - ECO_POINTS).toLocaleString()} pts to Gold
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(ringPct * 100, 100)}%` }]} />
          </View>

          {/* Redeem */}
          <TouchableOpacity style={styles.redeemBtn} activeOpacity={0.88}>
            <Text style={styles.redeemText}>Redeem Points</Text>
          </TouchableOpacity>
        </View>

        {/* ── Body ── */}
        <View style={styles.body}>

          {/* Behaviour Scores */}
          <Text style={styles.sectionTitle}>Driving Behaviour Scores</Text>
          <Text style={styles.sectionSub}>
            Powered by XGBoost · Features from 60-second trip segments
          </Text>
          <View style={styles.card}>
            {behaviourMetrics.map((m) => (
              <View key={m.label} style={styles.metricRow}>
                <View style={styles.metricTop}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={styles.metricScore}>{m.value}/100</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${m.value}%`, backgroundColor: m.colour }]} />
                </View>
                <Text style={styles.metricR}>Correlation r = {m.r} (p &lt; 0.001)</Text>
              </View>
            ))}
          </View>

          {/* Trip History */}
          <Text style={styles.sectionTitle}>Recent Trips</Text>
          {tripHistory.map((t, i) => {
            const profile = co2Profile(t.co2Emitted);
            return (
              <View key={i} style={styles.tripCard}>
                <View style={styles.tripLeft}>
                  <Text style={styles.tripRoute}>{t.route}</Text>
                  <Text style={styles.tripDate}>
                    {t.date}  ·  {t.co2Emitted} kg CO₂
                  </Text>
                </View>
                <View style={styles.tripRight}>
                  <Text style={styles.tripPts}>{t.pts} pts</Text>
                  <View style={[styles.tripProfile, { backgroundColor: profileBg[profile] }]}>
                    <Text style={[styles.tripProfileText, { color: profileColour[profile] }]}>
                      {profile}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Fuel Prices */}
          <Text style={styles.sectionTitle}>Fuel Prices</Text>
          <Text style={styles.sectionSub}>Last updated 26 Mar 2026</Text>
          {fuelPrices.map((f) => (
            <View key={f.type} style={styles.fuelCard}>
              <View style={styles.fuelBadge}>
                <Text style={styles.fuelBadgeIcon}>{f.icon}</Text>
                <Text style={styles.fuelBadgeText}>{f.type}</Text>
              </View>
              <View style={styles.fuelPriceRow}>
                {f.subsidised !== null && (
                  <View style={styles.fuelPriceBox}>
                    <Text style={styles.fuelPriceLabel}>Subsidised price</Text>
                    <Text style={styles.fuelPriceValue}>RM{f.subsidised.toFixed(2)}/L</Text>
                  </View>
                )}
                <View style={[styles.fuelPriceBox, f.subsidised !== null && styles.fuelPriceBorder]}>
                  <Text style={styles.fuelPriceLabel}>Pump Price</Text>
                  <Text style={styles.fuelPriceValue}>RM{f.pump.toFixed(2)}/L</Text>
                </View>
              </View>
            </View>
          ))}

          {/* Fuel saving tip */}
          <View style={styles.tipCard}>
            <Text style={styles.tipText}>
              💡 Smooth driving saves up to <Text style={styles.tipHighlight}>RM1.22</Text> per trip on RON95 compared to aggressive driving — based on FASTSim energy estimates.
            </Text>
          </View>

          {/* How to earn */}
          <Text style={styles.sectionTitle}>How to Earn Points</Text>
          {howToEarn.map((s, i) => (
            <View key={i} style={styles.howRow}>
              <View style={styles.howIcon}>
                <MaterialIcons name={s.icon as never} size={22} color="#1B2B45" />
              </View>
              <View style={styles.howInfo}>
                <Text style={styles.howTitle}>{s.title}</Text>
                <Text style={styles.howDesc}>{s.desc}</Text>
              </View>
            </View>
          ))}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const RING_SIZE = 96;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B2B45' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBadge: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  // Hero card
  heroCard: {
    backgroundColor: '#1B2B45',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  profilePills: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  pill: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  pillInactive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  pillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  pillTextInactive: { color: 'rgba(255,255,255,0.4)' },

  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  heroLeft: { flex: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 },
  heroValue: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  heroSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  heroBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  heroBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringInner: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  ringPct: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  ringLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  pointsLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  pointsValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  pointsRemain: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },

  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: { height: '100%', backgroundColor: '#22C55E', borderRadius: 999 },

  redeemBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemText: { color: '#1B2B45', fontSize: 16, fontWeight: '800' },

  // Body
  body: {
    backgroundColor: '#F4F5F7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 48,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#9CA3AF', marginBottom: 14 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metricRow: { marginBottom: 16 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metricLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  metricScore: { fontSize: 14, fontWeight: '800', color: '#111827' },
  barTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 999, overflow: 'hidden', marginBottom: 4 },
  barFill: { height: '100%', borderRadius: 999 },
  metricR: { fontSize: 11, color: '#9CA3AF' },

  // Trip cards
  tripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tripLeft: { flex: 1 },
  tripRoute: { fontSize: 14, fontWeight: '700', color: '#111827' },
  tripDate: { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  tripRight: { alignItems: 'flex-end', gap: 6 },
  tripPts: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  tripProfile: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tripProfileText: { fontSize: 11, fontWeight: '700' },

  // Fuel prices
  fuelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  fuelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
    marginBottom: 14,
  },
  fuelBadgeIcon: { fontSize: 14 },
  fuelBadgeText: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  fuelPriceRow: { flexDirection: 'row' },
  fuelPriceBox: { flex: 1 },
  fuelPriceBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    paddingLeft: 16,
  },
  fuelPriceLabel: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  fuelPriceValue: { fontSize: 20, fontWeight: '800', color: '#111827' },

  // Tip card
  tipCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
  },
  tipText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  tipHighlight: { fontWeight: '800', color: '#16A34A' },

  // How to earn
  howRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  howIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8EDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howInfo: { flex: 1 },
  howTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 3 },
  howDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
});
