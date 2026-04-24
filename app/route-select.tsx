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
  getVehicles,
  searchRoutes,
  type RouteOption,
  type Vehicle,
} from '@/lib/api';
import { setPendingDirectionsJson } from '@/lib/pending-route';

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

  const destLat   = parseFloat(params.destLat   ?? '0');
  const destLng   = parseFloat(params.destLng   ?? '0');
  const originLat = parseFloat(params.originLat ?? '0');
  const originLng = parseFloat(params.originLng ?? '0');

  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);


  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;

  // Decoded route coordinate arrays — memoised so map features are stable
  const decodedRoutes = useMemo(
    () => routes.map(r => decodePolyline(r.polyline)),
    [routes],
  );

  // Fetch routes on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingRoutes(true);
    searchRoutes({
      origin_lat: originLat,
      origin_lng: originLng,
      dest_lat: destLat,
      dest_lng: destLng,
    })
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

  // Fetch the user's vehicles and pre-select the default one
  useEffect(() => {
    let cancelled = false;
    getVehicles()
      .then((list) => {
        if (cancelled) return;
        setVehicles(list);
        const def = list.find((v) => v.is_default) ?? list[0];
        if (def) setSelectedVehicleId(def.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleStartTrip = useCallback(() => {
    if (!selectedVehicle || !routes[selectedRouteIdx]) return;
    const route = routes[selectedRouteIdx];
    setPendingDirectionsJson(route.directions_json ?? null);
    router.push({
      pathname: '/navigate',
      params: {
        polyline:      route.polyline,
        label:         route.label,
        destLat:       String(destLat),
        destLng:       String(destLng),
        originLat:     String(originLat),
        originLng:     String(originLng),
        destAddress:   params.destAddress ?? '',
        originAddress: 'Current Location',
        vehicleId:     selectedVehicle.id,
        fuelType:      selectedVehicle.vehicle_type,
        durationSec:   String(route.duration_sec),
        distanceKm:    String(route.distance_km),
      },
    });
  }, [selectedVehicle, routes, selectedRouteIdx, destLat, destLng, originLat, originLng, params.destAddress, router]);

  const selectedRoute = routes[selectedRouteIdx];

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
              <TouchableOpacity
                style={styles.vehicleRow}
                onPress={() => setShowVehiclePicker(true)}
                disabled={vehicles.length === 0}
              >
                <View style={styles.vehicleIcon}>
                  <MaterialIcons color="#1B2B45" name="directions-car" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  {selectedVehicle ? (
                    <>
                      <Text style={styles.vehicleName}>
                        {selectedVehicle.make} {selectedVehicle.model}
                      </Text>
                      <Text style={styles.vehicleVariant}>
                        {selectedVehicle.year} · {selectedVehicle.vehicle_type}
                        {selectedVehicle.is_default ? ' · Default' : ''}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.vehiclePlaceholder}>
                      {vehicles.length === 0 ? 'No vehicles — add one in your profile' : 'Select your vehicle'}
                    </Text>
                  )}
                </View>
                {vehicles.length > 1 && (
                  <MaterialIcons color="#9CA3AF" name="chevron-right" size={22} />
                )}
              </TouchableOpacity>

              {/* Go now CTA */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.ctaBtn, !selectedVehicle && styles.ctaBtnDisabled]}
                onPress={handleStartTrip}
                disabled={!selectedVehicle}
              >
                <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
                <Text style={styles.ctaText}>Go now</Text>
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

          <FlatList
            data={vehicles}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const active = item.id === selectedVehicleId;
              return (
                <TouchableOpacity
                  style={[styles.vehicleOption, active && styles.vehicleOptionActive]}
                  onPress={() => {
                    setSelectedVehicleId(item.id);
                    setShowVehiclePicker(false);
                  }}
                >
                  <View style={styles.vehicleIcon}>
                    <MaterialIcons color="#1B2B45" name="directions-car" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>{item.make} {item.model}</Text>
                    <Text style={styles.vehicleVariant}>
                      {item.year} · {item.vehicle_type}
                      {item.is_default ? ' · Default' : ''}
                    </Text>
                  </View>
                  {active && <MaterialIcons color="#1B2B45" name="check" size={22} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyVehicles}>
                You have no vehicles yet. Add one in your profile to start a trip.
              </Text>
            }
          />
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
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },

  vehicleOption: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  vehicleOptionActive: { borderColor: '#1B2B45', borderWidth: 2 },
  emptyVehicles: {
    fontSize: 14, color: '#6B7280', textAlign: 'center',
    paddingVertical: 40, paddingHorizontal: 20, lineHeight: 20,
  },
});
