import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import polyline from '@mapbox/polyline';
import MapboxGL from '@rnmapbox/maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getFeedbackForTrip,
  getSegmentsForTrip,
  getTrip,
  type BehaviourLabel,
  type FeedbackEvent,
  type TelemetrySegment,
  type Trip,
} from '@/lib/api';

const SEGMENT_COLOR: Record<BehaviourLabel, string> = {
  smooth:     '#2ECC71',
  moderate:   '#F1C40F',
  aggressive: '#E74C3C',
};
const DEFAULT_SEGMENT_COLOR = '#9AA0A6';

function decodePolyline(encoded: string | null | undefined): [number, number][] {
  if (!encoded) return [];
  try {
    return polyline.decode(encoded).map(([lat, lng]) => [lng, lat]);
  } catch {
    return [];
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDistance(km: number | null): string {
  if (km == null) return '—';
  return `${km.toFixed(2)} km`;
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

function behaviourLabel(label: BehaviourLabel | null): string {
  if (!label) return 'No data';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shapFeatureLabel(key: string | null): string {
  if (!key) return '—';
  // shap_top_feature looks like "avg_speed_kmh" → "Avg speed kmh"
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export default function TripDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId: string }>();
  const tripId = params.tripId ?? '';
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [segments, setSegments] = useState<TelemetrySegment[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getTrip(tripId),
      getSegmentsForTrip(tripId).catch(() => [] as TelemetrySegment[]),
      getFeedbackForTrip(tripId).catch(() => [] as FeedbackEvent[]),
    ])
      .then(([t, segs, fb]) => {
        if (cancelled) return;
        setTrip(t);
        setSegments(segs.sort((a, b) => a.segment_index - b.segment_index));
        setFeedback(fb);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message ?? 'Failed to load trip');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tripId]);

  const baseCoords = useMemo(() => decodePolyline(trip?.route_polyline), [trip]);

  // Build segment polylines for rendering
  const segmentLines = useMemo(() => {
    return segments
      .filter(s => s.polyline)
      .map(s => ({
        id: s.id,
        coords: decodePolyline(s.polyline),
        color: s.behaviour_label ? SEGMENT_COLOR[s.behaviour_label] : DEFAULT_SEGMENT_COLOR,
      }))
      .filter(s => s.coords.length >= 2);
  }, [segments]);

  // Fit camera once map data is ready
  useEffect(() => {
    const coords = baseCoords.length > 0
      ? baseCoords
      : segmentLines.flatMap(s => s.coords);
    if (coords.length === 0) return;

    let minLng = coords[0][0], maxLng = coords[0][0];
    let minLat = coords[0][1], maxLat = coords[0][1];
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const timer = setTimeout(() => {
      cameraRef.current?.fitBounds(
        [maxLng, maxLat],
        [minLng, minLat],
        [80, 60, 260, 60],
        800,
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [baseCoords, segmentLines, trip]);

  const selectedIndex = selectedSegmentId
    ? segments.findIndex(s => s.id === selectedSegmentId)
    : -1;
  const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;

  const segmentFeedback = useMemo(() => {
    if (!selectedSegment) return [] as FeedbackEvent[];
    return feedback.filter(f => f.segment_id === selectedSegment.id);
  }, [feedback, selectedSegment]);

  const onSegmentTap = useCallback((segmentId: string) => {
    setSelectedSegmentId(prev => prev === segmentId ? null : segmentId);
  }, []);

  const goToPrevSegment = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedSegmentId(segments[selectedIndex - 1].id);
    }
  }, [segments, selectedIndex]);

  const goToNextSegment = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < segments.length - 1) {
      setSelectedSegmentId(segments[selectedIndex + 1].id);
    }
  }, [segments, selectedIndex]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons color="#FFFFFF" name="arrow-back" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}><ActivityIndicator color="#FFFFFF" /></View>
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons color="#FFFFFF" name="arrow-back" size={22} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <MaterialIcons color="#EF4444" name="error-outline" size={48} />
          <Text style={styles.errorText}>{error ?? 'Trip not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const originName = tripPlace(trip.origin_name, trip.origin_address, 'Origin');
  const destName = tripPlace(trip.dest_name, trip.dest_address, 'Destination');

  return (
    <View style={styles.root}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Dark}
        scaleBarEnabled={false}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [trip.origin_lng, trip.origin_lat],
            zoomLevel: 13,
          }}
        />

        {/* Base route (neutral) */}
        {baseCoords.length > 0 && (
          <MapboxGL.ShapeSource
            id="trip-route"
            shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: baseCoords } }}
          >
            <MapboxGL.LineLayer
              id="trip-route-line"
              style={{ lineColor: '#555555', lineWidth: 5, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.7 }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Segment overlays */}
        {segmentLines.map(s => {
          const isSelected = s.id === selectedSegmentId;
          return (
            <MapboxGL.ShapeSource
              key={`seg-${s.id}`}
              id={`seg-${s.id}`}
              shape={{ type: 'Feature', properties: { id: s.id }, geometry: { type: 'LineString', coordinates: s.coords } }}
              onPress={() => onSegmentTap(s.id)}
            >
              <MapboxGL.LineLayer
                id={`seg-${s.id}-line`}
                style={{
                  lineColor: s.color,
                  lineWidth: isSelected ? 10 : 6,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: isSelected ? 1 : 0.95,
                }}
              />
            </MapboxGL.ShapeSource>
          );
        })}

        {/* Origin marker */}
        <MapboxGL.PointAnnotation id="trip-origin" coordinate={[trip.origin_lng, trip.origin_lat]}>
          <View style={[styles.pin, { backgroundColor: '#1B2B45' }]}>
            <View style={styles.pinDot} />
          </View>
        </MapboxGL.PointAnnotation>

        {/* Destination marker */}
        <MapboxGL.PointAnnotation id="trip-dest" coordinate={[trip.dest_lng, trip.dest_lat]}>
          <View style={[styles.pin, { backgroundColor: '#EF4444' }]}>
            <MaterialIcons color="#FFFFFF" name="place" size={18} />
          </View>
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topWrap} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons color="#FFFFFF" name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.legend}>
            {(['smooth', 'moderate', 'aggressive'] as BehaviourLabel[]).map(b => (
              <View key={b} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SEGMENT_COLOR[b] }]} />
                <Text style={styles.legendText}>{behaviourLabel(b)}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom sheet — anchored to the bottom of the screen with white
          background extending through the home-indicator safe area. */}
      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetContent}>
          {selectedSegment ? (
            <SegmentDetail
              segment={selectedSegment}
              feedback={segmentFeedback}
              totalSegments={segments.length}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex < segments.length - 1}
              onPrev={goToPrevSegment}
              onNext={goToNextSegment}
              onClose={() => setSelectedSegmentId(null)}
            />
          ) : (
            <TripSummary
              trip={trip}
              originName={originName}
              destName={destName}
              segmentCount={segments.length}
              feedbackCount={feedback.length}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function TripSummary({
  trip, originName, destName, segmentCount, feedbackCount,
}: {
  trip: Trip;
  originName: string;
  destName: string;
  segmentCount: number;
  feedbackCount: number;
}) {
  return (
    <ScrollView>
      <Text style={styles.dateText}>{formatDate(trip.started_at)}</Text>

      <View style={styles.routeRow}>
        <View style={styles.routeIndicator}>
          <View style={[styles.routeDot, { backgroundColor: '#1B2B45' }]} />
          <View style={styles.routeBar} />
          <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.placeName} numberOfLines={1}>{originName}</Text>
          <View style={{ height: 12 }} />
          <Text style={styles.placeName} numberOfLines={1}>{destName}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <Stat label="Distance" value={formatDistance(trip.distance_km)} />
        <Stat label="Duration" value={formatDuration(trip.duration_sec)} />
        {trip.co2_kg != null && (
          <Stat label="CO₂" value={`${trip.co2_kg.toFixed(2)} kg`} accent="#16A34A" />
        )}
        {trip.energy_kwh != null && (
          <Stat label="Energy" value={`${trip.energy_kwh.toFixed(2)} kWh`} />
        )}
      </View>

      {trip.driver_profile && (
        <View style={[styles.profileChip, profileChipStyle(trip.driver_profile)]}>
          <MaterialIcons color="#FFFFFF" name="psychology" size={16} />
          <Text style={styles.profileChipText}>
            Driver profile: {String(trip.driver_profile).toUpperCase()}
          </Text>
        </View>
      )}

      <Text style={styles.hintText}>
        {segmentCount > 0
          ? `Tap any coloured segment on the map to see details · ${segmentCount} segments · ${feedbackCount} events`
          : 'No behavioural segments analysed for this trip yet.'}
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

function profileChipStyle(profile: string): { backgroundColor: string } {
  switch (profile.toLowerCase()) {
    case 'smooth':     return { backgroundColor: '#16A34A' };
    case 'aggressive': return { backgroundColor: '#DC2626' };
    default:           return { backgroundColor: '#6B7280' };
  }
}

function SegmentDetail({
  segment, feedback, totalSegments, hasPrev, hasNext, onPrev, onNext, onClose,
}: {
  segment: TelemetrySegment;
  feedback: FeedbackEvent[];
  totalSegments: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const color = segment.behaviour_label
    ? SEGMENT_COLOR[segment.behaviour_label]
    : DEFAULT_SEGMENT_COLOR;
  const startTime = new Date(segment.started_at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const endTime = new Date(segment.ended_at).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return (
    <ScrollView>
      <View style={styles.segHeader}>
        <View style={[styles.segBadge, { backgroundColor: color }]}>
          <Text style={styles.segBadgeText}>
            {behaviourLabel(segment.behaviour_label)}
          </Text>
        </View>
        <Text style={styles.segIndex}>
          Segment {segment.segment_index + 1} of {totalSegments}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <MaterialIcons color="#6B7280" name="close" size={22} />
        </TouchableOpacity>
      </View>

      <View style={styles.segNavRow}>
        <TouchableOpacity
          style={[styles.segNavBtn, !hasPrev && styles.segNavBtnDisabled]}
          onPress={onPrev}
          disabled={!hasPrev}
        >
          <MaterialIcons
            color={hasPrev ? '#111827' : '#D1D5DB'}
            name="chevron-left"
            size={22}
          />
          <Text style={[styles.segNavText, !hasPrev && styles.segNavTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segNavBtn, !hasNext && styles.segNavBtnDisabled]}
          onPress={onNext}
          disabled={!hasNext}
        >
          <Text style={[styles.segNavText, !hasNext && styles.segNavTextDisabled]}>
            Next
          </Text>
          <MaterialIcons
            color={hasNext ? '#111827' : '#D1D5DB'}
            name="chevron-right"
            size={22}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.segTime}>{startTime} → {endTime}</Text>

      <View style={styles.statsGrid}>
        <Stat label="Avg speed" value={`${segment.avg_speed_kmh.toFixed(1)} km/h`} />
        <Stat label="Idle time" value={`${segment.idle_time_pct.toFixed(0)}%`} />
        <Stat label="Braking" value={`${segment.braking_frequency.toFixed(2)}/s`} />
        <Stat label="Accel variance" value={segment.accel_variance.toFixed(2)} />
      </View>

      {segment.confidence != null && (
        <View style={styles.confidenceRow}>
          <Text style={styles.confidenceLabel}>Model confidence</Text>
          <View style={styles.confidenceBarBg}>
            <View style={[styles.confidenceBar, {
              width: `${Math.round(segment.confidence * 100)}%`,
              backgroundColor: color,
            }]} />
          </View>
          <Text style={styles.confidenceValue}>{Math.round(segment.confidence * 100)}%</Text>
        </View>
      )}

      {segment.shap_top_feature && (
        <View style={styles.shapBox}>
          <MaterialIcons color="#6B7280" name="insights" size={16} />
          <Text style={styles.shapText}>
            Top driver: <Text style={{ fontWeight: '800', color: '#111827' }}>
              {shapFeatureLabel(segment.shap_top_feature)}
            </Text>
          </Text>
        </View>
      )}

      {segment.xgboost_efficiency_label && (
        <View style={[styles.efficiencyChip,
          segment.xgboost_efficiency_label === 'optimal' ? styles.efficiencyOptimal : styles.efficiencySub,
        ]}>
          <Text style={styles.efficiencyText}>
            {segment.xgboost_efficiency_label === 'optimal' ? 'Optimal driving' : 'Suboptimal'}
          </Text>
        </View>
      )}

      {feedback.length > 0 && (
        <>
          <Text style={styles.feedbackHeader}>Feedback events</Text>
          {feedback.map(f => (
            <View key={f.id} style={styles.feedbackRow}>
              <MaterialIcons
                color={severityColor(f.severity)}
                name={severityIcon(f.severity)}
                size={18}
              />
              <Text style={styles.feedbackText} numberOfLines={3}>{f.message}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function severityColor(s: string): string {
  if (s === 'critical') return '#DC2626';
  if (s === 'warning') return '#D97706';
  return '#1D4ED8';
}

function severityIcon(s: string): 'error' | 'warning' | 'info' {
  if (s === 'critical') return 'error';
  if (s === 'warning') return 'warning';
  return 'info';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },

  topWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingTop: 8,
  },
  headerBar: { padding: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  legend: {
    marginLeft: 'auto',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },

  sheetWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  sheetContent: {
    paddingHorizontal: 16, paddingBottom: 8,
    maxHeight: 420,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', marginBottom: 12,
  },

  dateText: { fontSize: 12, color: '#6B7280', fontWeight: '700', marginBottom: 12 },

  routeRow: { flexDirection: 'row', marginBottom: 16 },
  routeIndicator: { alignItems: 'center', marginRight: 12, paddingTop: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeBar: { width: 2, height: 22, backgroundColor: '#E5E7EB', marginVertical: 2 },
  placeName: { fontSize: 14, fontWeight: '700', color: '#111827' },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginBottom: 12,
  },
  statBox: {
    minWidth: '47%', flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 4 },

  profileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 12,
  },
  profileChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  hintText: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 12 },

  // Segment detail
  segHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 6,
  },
  segBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  segBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  segIndex: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  segTime: { fontSize: 12, color: '#6B7280', marginBottom: 12 },

  segNavRow: {
    flexDirection: 'row', gap: 8,
    marginBottom: 12,
  },
  segNavBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#F3F4F6', borderRadius: 12,
  },
  segNavBtnDisabled: { backgroundColor: '#F9FAFB' },
  segNavText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  segNavTextDisabled: { color: '#D1D5DB' },

  confidenceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12,
  },
  confidenceLabel: { fontSize: 12, color: '#6B7280', width: 110 },
  confidenceBarBg: {
    flex: 1, height: 8, borderRadius: 4,
    backgroundColor: '#F3F4F6', overflow: 'hidden',
  },
  confidenceBar: { height: 8, borderRadius: 4 },
  confidenceValue: { fontSize: 12, fontWeight: '700', color: '#111827', width: 40, textAlign: 'right' },

  shapBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12, padding: 10,
    marginBottom: 12,
  },
  shapText: { fontSize: 12, color: '#6B7280', flex: 1 },

  efficiencyChip: {
    alignSelf: 'flex-start',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 12,
  },
  efficiencyOptimal: { backgroundColor: '#DCFCE7' },
  efficiencySub: { backgroundColor: '#FEE2E2' },
  efficiencyText: { fontSize: 11, fontWeight: '800' },

  feedbackHeader: {
    fontSize: 11, fontWeight: '800', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 4, marginBottom: 8,
  },
  feedbackRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12, padding: 10,
    marginBottom: 6,
  },
  feedbackText: { fontSize: 12, color: '#111827', flex: 1, lineHeight: 18 },
});
