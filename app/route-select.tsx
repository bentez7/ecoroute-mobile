import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import polyline from '@mapbox/polyline';
import MapboxGL from '@rnmapbox/maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createTrip,
  createVehicle,
  getVehicleMakes,
  getVehicleModels,
  getVehicleVariants,
  searchRoutes,
  type RouteOption,
  type VehicleVariant,
} from '@/lib/api';

type ConfirmedVehicle = {
  make: string;
  model: string;
  variant: VehicleVariant;
  vehicleId?: string;
};

const ROUTE_COLOR: Record<string, string> = {
  eco:      '#16A34A',
  balanced: '#7C3AED',
  fastest:  '#64748B',
};

const ROUTE_ICON: Record<string, string> = {
  eco:      'eco',
  balanced: 'alt-route',
  fastest:  'bolt',
};

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m} min`;
}

function decodePolyline(encoded: string | null | undefined): [number, number][] {
  if (!encoded) return [];
  try {
    // @mapbox/polyline returns [lat, lng]; GeoJSON needs [lng, lat]
    return polyline.decode(encoded).map(([lat, lng]) => [lng, lat]);
  } catch {
    return [];
  }
}

export default function RouteSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    destName:    string;
    destAddress: string;
    destLat:     string;
    destLng:     string;
    originLat:   string;
    originLng:   string;
  }>();

  const destLat   = parseFloat(params.destLat   ?? '');
  const destLng   = parseFloat(params.destLng   ?? '');
  const originLat = parseFloat(params.originLat ?? '');
  const originLng = parseFloat(params.originLng ?? '');

  const coordsValid =
    Number.isFinite(destLat) && Number.isFinite(destLng) &&
    Number.isFinite(originLat) && Number.isFinite(originLng);

  if (!coordsValid) {
    console.warn('[route-select] invalid coords from params:', params);
  }

  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [makes, setMakes] = useState<string[]>([]);
  const [selectedMake, setSelectedMake] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<VehicleVariant | null>(null);
  const [confirmedVehicle, setConfirmedVehicle] = useState<ConfirmedVehicle | null>(null);

  const [startingTrip, setStartingTrip] = useState(false);

  // Decoded route coordinate arrays — memoised so map features are stable
  const decodedRoutes = useMemo(
    () => routes.map(r => decodePolyline(r.polyline)),
    [routes],
  );

  // Fetch routes on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingRoutes(true);
    searchRoutes(originLat, originLng, destLat, destLng)
      .then(results => {
        if (cancelled) return;
        setRoutes(results);
        setSelectedRouteIdx(0);
      })
      .catch(() => { if (!cancelled) setRoutes([]); })
      .finally(() => { if (!cancelled) setLoadingRoutes(false); });
    return () => { cancelled = true; };
  }, [originLat, originLng, destLat, destLng]);

  // Fit camera to the selected route
  useEffect(() => {
    const coords = decodedRoutes[selectedRouteIdx];
    if (!coords || coords.length === 0) return;

    let minLng = coords[0][0], maxLng = coords[0][0];
    let minLat = coords[0][1], maxLat = coords[0][1];
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    cameraRef.current?.fitBounds(
      [maxLng, maxLat],
      [minLng, minLat],
      [80, 60, 260, 60],
      800,
    );
  }, [selectedRouteIdx, decodedRoutes]);

  // Vehicle picker data
  useEffect(() => {
    if (showVehiclePicker && makes.length === 0) {
      getVehicleMakes().then(setMakes).catch(() => {});
    }
  }, [showVehiclePicker, makes.length]);

  useEffect(() => {
    if (!selectedMake) return;
    setModels([]); setSelectedModel(null);
    setVariants([]); setSelectedVariant(null);
    getVehicleModels(selectedMake).then(setModels).catch(() => {});
  }, [selectedMake]);

  useEffect(() => {
    if (!selectedMake || !selectedModel) return;
    setVariants([]); setSelectedVariant(null);
    getVehicleVariants(selectedMake, selectedModel).then(setVariants).catch(() => {});
  }, [selectedMake, selectedModel]);

  const handleConfirmVehicle = useCallback(() => {
    if (!selectedMake || !selectedModel || !selectedVariant) return;
    setConfirmedVehicle({ make: selectedMake, model: selectedModel, variant: selectedVariant });
    setShowVehiclePicker(false);
  }, [selectedMake, selectedModel, selectedVariant]);

  const handleStartTrip = useCallback(async () => {
    if (!confirmedVehicle || !routes[selectedRouteIdx]) return;
    setStartingTrip(true);
    try {
      let vehicleId = confirmedVehicle.vehicleId;
      if (!vehicleId) {
        const vehicle = await createVehicle({
          make:            confirmedVehicle.make,
          model:           confirmedVehicle.model,
          year:            confirmedVehicle.variant.year,
          vehicle_type:    confirmedVehicle.variant.vehicle_type,
          vehicle_mass_kg: confirmedVehicle.variant.vehicle_mass_kg,
          drivetrain_type: confirmedVehicle.variant.drivetrain_type,
        });
        vehicleId = vehicle.id;
      }

      await createTrip({
        vehicle_id:     vehicleId,
        started_at:     new Date().toISOString(),
        origin_lat:     originLat,
        origin_lng:     originLng,
        dest_lat:       destLat,
        dest_lng:       destLng,
        fuel_type:      confirmedVehicle.variant.vehicle_type,
        origin_address: 'Current Location',
        dest_address:   params.destAddress,
        route_polyline: routes[selectedRouteIdx]?.polyline,
      });

      router.back();
    } catch (err: any) {
      console.error('[Trip] Error:', err.response?.data ?? err.message);
    } finally {
      setStartingTrip(false);
    }
  }, [confirmedVehicle, routes, selectedRouteIdx, originLat, originLng, destLat, destLng, params.destAddress, router]);

  const selectedRoute = routes[selectedRouteIdx];

  if (!coordsValid) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' }}>
          Couldn&apos;t open this destination
        </Text>
        <Text style={{ marginTop: 8, color: '#6B7280', textAlign: 'center' }}>
          The selected place is missing location data. Please pick another.
        </Text>
        <TouchableOpacity
          style={[styles.ctaBtn, { marginTop: 24, paddingHorizontal: 24 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.ctaText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Map */}
      <MapboxGL.MapView style={StyleSheet.absoluteFill} styleURL={MapboxGL.StyleURL.Street}>
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [originLng, originLat], zoomLevel: 12 }}
        />

        {/* Non-selected routes first (drawn underneath) */}
        {decodedRoutes.map((coords, i) => {
          if (i === selectedRouteIdx || coords.length === 0) return null;
          const label = routes[i]?.label ?? 'balanced';
          return (
            <MapboxGL.ShapeSource
              key={`route-bg-${i}`}
              id={`route-bg-${i}`}
              shape={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }}
            >
              <MapboxGL.LineLayer
                id={`route-bg-${i}-layer`}
                style={{
                  lineColor: ROUTE_COLOR[label] ?? '#64748B',
                  lineWidth: 4,
                  lineOpacity: 0.35,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </MapboxGL.ShapeSource>
          );
        })}

        {/* Selected route on top */}
        {selectedRoute && decodedRoutes[selectedRouteIdx]?.length > 0 && (
          <MapboxGL.ShapeSource
            id="route-selected"
            shape={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: decodedRoutes[selectedRouteIdx] },
            }}
          >
            <MapboxGL.LineLayer
              id="route-selected-layer"
              style={{
                lineColor: ROUTE_COLOR[selectedRoute.label] ?? '#1B2B45',
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Origin marker */}
        <MapboxGL.PointAnnotation id="origin" coordinate={[originLng, originLat]}>
          <View style={[styles.pin, { backgroundColor: '#1B2B45' }]}>
            <View style={styles.pinDot} />
          </View>
        </MapboxGL.PointAnnotation>

        {/* Destination marker */}
        <MapboxGL.PointAnnotation id="destination" coordinate={[destLng, destLat]}>
          <View style={[styles.pin, { backgroundColor: '#EF4444' }]}>
            <MaterialIcons color="#FFFFFF" name="place" size={18} />
          </View>
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topBarWrap} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons color="#111827" name="arrow-back" size={22} />
          </TouchableOpacity>
          <View style={styles.topBarText}>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              Your location → {params.destName ?? 'Destination'}
            </Text>
            <Text style={styles.topBarSub} numberOfLines={1}>{params.destAddress}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Bottom sheet */}
      <SafeAreaView edges={['bottom']} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {loadingRoutes ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#1B2B45" />
              <Text style={styles.loadingText}>Finding routes...</Text>
            </View>
          ) : routes.length === 0 ? (
            <Text style={styles.noRoutes}>Route service unavailable</Text>
          ) : (
            <>
              {/* Route chips */}
              <View style={styles.chipRow}>
                {routes.map((r, i) => (
                  <TouchableOpacity
                    key={`${r.label}-${i}`}
                    activeOpacity={0.85}
                    style={[
                      styles.chip,
                      selectedRouteIdx === i && { borderColor: ROUTE_COLOR[r.label] ?? '#1B2B45', borderWidth: 2 },
                    ]}
                    onPress={() => setSelectedRouteIdx(i)}
                  >
                    <View style={[styles.chipIcon, { backgroundColor: (ROUTE_COLOR[r.label] ?? '#64748B') + '22' }]}>
                      <MaterialIcons
                        color={ROUTE_COLOR[r.label] ?? '#64748B'}
                        name={(ROUTE_ICON[r.label] ?? 'alt-route') as never}
                        size={18}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chipTime}>{formatDuration(r.duration_sec)}</Text>
                      <Text style={styles.chipMeta}>
                        {r.distance_km.toFixed(1)} km
                        {r.energy_kwh != null ? ` · ${(r.energy_kwh * 0.2496).toFixed(1)} kg CO₂` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Selected route detail */}
              {selectedRoute && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailTitle}>
                    {selectedRoute.label.charAt(0).toUpperCase() + selectedRoute.label.slice(1)} Route
                  </Text>
                  {selectedRoute.label === 'eco' && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Most Eco</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Vehicle row */}
              <TouchableOpacity style={styles.vehicleRow} onPress={() => setShowVehiclePicker(true)}>
                <View style={styles.vehicleIcon}>
                  <MaterialIcons color="#1B2B45" name="directions-car" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  {confirmedVehicle ? (
                    <>
                      <Text style={styles.vehicleName}>{confirmedVehicle.make} {confirmedVehicle.model}</Text>
                      <Text style={styles.vehicleVariant}>
                        {confirmedVehicle.variant.variant} · {confirmedVehicle.variant.year}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.vehiclePlaceholder}>Select your vehicle</Text>
                  )}
                </View>
                <MaterialIcons color="#9CA3AF" name="chevron-right" size={22} />
              </TouchableOpacity>

              {/* Go now CTA */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.ctaBtn, (!confirmedVehicle || startingTrip) && styles.ctaBtnDisabled]}
                onPress={handleStartTrip}
                disabled={!confirmedVehicle || startingTrip}
              >
                {startingTrip ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
                    <Text style={styles.ctaText}>Go now</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>

      {/* Vehicle picker modal */}
      <Modal
        visible={showVehiclePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowVehiclePicker(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Vehicle</Text>
            <TouchableOpacity onPress={() => setShowVehiclePicker(false)}>
              <MaterialIcons color="#111827" name="close" size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Make</Text>
              <FlatList
                data={makes}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, selectedMake === item && styles.pickerItemActive]}
                    onPress={() => setSelectedMake(item)}
                  >
                    <Text
                      style={[styles.pickerItemText, selectedMake === item && styles.pickerItemTextActive]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Model</Text>
              <FlatList
                data={models}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, selectedModel === item && styles.pickerItemActive]}
                    onPress={() => setSelectedModel(item)}
                  >
                    <Text
                      style={[styles.pickerItemText, selectedModel === item && styles.pickerItemTextActive]}
                      numberOfLines={1}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.pickerEmpty}>{selectedMake ? 'Loading...' : 'Pick a make'}</Text>
                }
              />
            </View>

            <View style={styles.pickerColumn}>
              <Text style={styles.pickerLabel}>Variant</Text>
              <FlatList
                data={variants}
                keyExtractor={(item) => item.variant}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, selectedVariant?.variant === item.variant && styles.pickerItemActive]}
                    onPress={() => setSelectedVariant(item)}
                  >
                    <Text
                      style={[styles.pickerItemText, selectedVariant?.variant === item.variant && styles.pickerItemTextActive]}
                      numberOfLines={2}
                    >
                      {item.variant}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.pickerEmpty}>{selectedModel ? 'Loading...' : 'Pick a model'}</Text>
                }
              />
            </View>
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (!selectedMake || !selectedModel || !selectedVariant) && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirmVehicle}
              disabled={!selectedMake || !selectedModel || !selectedVariant}
            >
              <Text style={styles.confirmBtnText}>Confirm Vehicle</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E5E7EB' },

  // Top bar
  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 16, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  topBarText:  { flex: 1 },
  topBarTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  topBarSub:   { fontSize: 12, color: '#6B7280', marginTop: 2 },

  // Pins
  pin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },

  // Bottom sheet
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10, paddingHorizontal: 16, paddingBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', marginBottom: 12,
  },

  loadingBox: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    justifyContent: 'center', paddingVertical: 30,
  },
  loadingText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  noRoutes:    { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingVertical: 30 },

  // Route chips (horizontal row of 3)
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 14, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  chipIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  chipTime: { fontSize: 14, fontWeight: '800', color: '#111827' },
  chipMeta: { fontSize: 10, color: '#6B7280', marginTop: 1 },

  // Detail row
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  detailTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  badge:       { backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:   { color: '#16A34A', fontSize: 11, fontWeight: '700' },

  // Vehicle
  vehicleRow: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14, padding: 12,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  vehicleIcon: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  vehicleName:        { fontSize: 14, fontWeight: '700', color: '#111827' },
  vehicleVariant:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  vehiclePlaceholder: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },

  // CTA
  ctaBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 14, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },

  // Modal
  modalSafe:   { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  pickerContainer: { flex: 1, flexDirection: 'row', paddingHorizontal: 8 },
  pickerColumn:    { flex: 1, paddingHorizontal: 4 },
  pickerLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 8, paddingVertical: 10,
  },
  pickerItem: {
    paddingHorizontal: 10, paddingVertical: 11,
    borderRadius: 10, marginBottom: 4,
  },
  pickerItemActive:    { backgroundColor: '#1B2B45' },
  pickerItemText:      { fontSize: 13, color: '#374151', fontWeight: '500' },
  pickerItemTextActive:{ color: '#FFFFFF', fontWeight: '700' },
  pickerEmpty:         { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingTop: 20 },
  modalFooter:         { padding: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  confirmBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
