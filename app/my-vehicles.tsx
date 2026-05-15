import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createVehicle,
  deleteVehicle,
  getVehicleMakes,
  getVehicleModels,
  getVehicleVariants,
  getUserVehicles,
  setDefaultVehicle,
  type Vehicle,
  type VehicleVariant,
} from '@/lib/api';

export default function MyVehiclesScreen() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserVehicles();
      setVehicles(data);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadVehicles();
  }, [loadVehicles]));

  const onDelete = useCallback((v: Vehicle) => {
    Alert.alert(
      'Delete vehicle?',
      `${v.make} ${v.model} (${v.year}) will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteVehicle(v.id);
              await loadVehicles();
            } catch (e) {
              Alert.alert('Error', (e as Error).message ?? 'Failed to delete');
            }
          },
        },
      ],
    );
  }, [loadVehicles]);

  const onSetDefault = useCallback(async (v: Vehicle) => {
    if (v.is_default) return;
    try {
      await setDefaultVehicle(v.id);
      await loadVehicles();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Failed to set default');
    }
  }, [loadVehicles]);

  const renderVehicle = useCallback(({ item }: { item: Vehicle }) => (
    <View style={styles.vehicleCard}>
      <View style={styles.vehicleHead}>
        <View style={styles.iconBox}>
          <MaterialIcons color="#1B2B45" name="directions-car" size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.vehicleName}>{item.make} {item.model}</Text>
          <Text style={styles.vehicleMeta}>
            {item.year} · {item.vehicle_type}
          </Text>
        </View>
        {item.is_default && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultText}>Default</Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, item.is_default && styles.actionBtnDisabled]}
          onPress={() => onSetDefault(item)}
          disabled={item.is_default}
        >
          <MaterialIcons
            color={item.is_default ? '#9CA3AF' : '#1B2B45'}
            name="star"
            size={18}
          />
          <Text style={[styles.actionText, item.is_default && { color: '#9CA3AF' }]}>
            {item.is_default ? 'Default' : 'Set default'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item)}>
          <MaterialIcons color="#DC2626" name="delete-outline" size={18} />
        </TouchableOpacity>
      </View>
    </View>
  ), [onDelete, onSetDefault]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons color="#111827" name="arrow-back" size={22} />
        </TouchableOpacity>
        <Text style={styles.title}>My Vehicles</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1B2B45" /></View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons color="#DC2626" name="error-outline" size={40} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadVehicles}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          renderItem={renderVehicle}
          contentContainerStyle={vehicles.length === 0 ? styles.listEmpty : styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons color="#CBD5E1" name="directions-car" size={48} />
              <Text style={styles.emptyText}>No vehicles saved yet.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <MaterialIcons color="#FFFFFF" name="add" size={20} />
        <Text style={styles.addBtnText}>Add Vehicle</Text>
      </TouchableOpacity>

      <AddVehicleModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); loadVehicles(); }}
      />
    </SafeAreaView>
  );
}

function AddVehicleModal({
  visible, onClose, onAdded,
}: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);

  const [selectedMake, setSelectedMake] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<VehicleVariant | null>(null);

  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedMake(null);
    setSelectedModel(null);
    setSelectedVariant(null);
    setLoadingMakes(true);
    getVehicleMakes().then(setMakes).catch(() => setMakes([])).finally(() => setLoadingMakes(false));
  }, [visible]);

  useEffect(() => {
    if (!selectedMake) { setModels([]); return; }
    setSelectedModel(null);
    setSelectedVariant(null);
    setLoadingModels(true);
    getVehicleModels(selectedMake)
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [selectedMake]);

  useEffect(() => {
    if (!selectedMake || !selectedModel) { setVariants([]); return; }
    setSelectedVariant(null);
    setLoadingVariants(true);
    getVehicleVariants(selectedMake, selectedModel)
      .then(setVariants)
      .catch(() => setVariants([]))
      .finally(() => setLoadingVariants(false));
  }, [selectedMake, selectedModel]);

  const submit = useCallback(async () => {
    if (!selectedMake || !selectedModel || !selectedVariant) return;
    setSubmitting(true);
    try {
      await createVehicle({
        make: selectedMake,
        model: selectedModel,
        year: selectedVariant.year,
        vehicle_type: selectedVariant.vehicle_type,
        vehicle_mass_kg: selectedVariant.vehicle_mass_kg,
        drivetrain_type: selectedVariant.drivetrain_type,
      });
      onAdded();
    } catch (e) {
      Alert.alert('Error', (e as Error).message ?? 'Failed to add vehicle');
    } finally {
      setSubmitting(false);
    }
  }, [selectedMake, selectedModel, selectedVariant, onAdded]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Vehicle</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons color="#111827" name="close" size={24} />
          </TouchableOpacity>
        </View>

        <View style={styles.columns}>
          {/* Make */}
          <View style={styles.column}>
            <Text style={styles.colLabel}>Make</Text>
            {loadingMakes ? (
              <ActivityIndicator size="small" color="#9CA3AF" style={{ marginTop: 12 }} />
            ) : (
              <ScrollView>
                {makes.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.colRow, selectedMake === m && styles.colRowActive]}
                    onPress={() => setSelectedMake(m)}
                  >
                    <Text style={[styles.colRowText, selectedMake === m && styles.colRowTextActive]} numberOfLines={1}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Model */}
          <View style={styles.column}>
            <Text style={styles.colLabel}>Model</Text>
            {!selectedMake ? (
              <Text style={styles.colHint}>Pick a make first</Text>
            ) : loadingModels ? (
              <ActivityIndicator size="small" color="#9CA3AF" style={{ marginTop: 12 }} />
            ) : (
              <ScrollView>
                {models.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.colRow, selectedModel === m && styles.colRowActive]}
                    onPress={() => setSelectedModel(m)}
                  >
                    <Text style={[styles.colRowText, selectedModel === m && styles.colRowTextActive]} numberOfLines={1}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Variant */}
          <View style={styles.column}>
            <Text style={styles.colLabel}>Variant</Text>
            {!selectedModel ? (
              <Text style={styles.colHint}>Pick a model first</Text>
            ) : loadingVariants ? (
              <ActivityIndicator size="small" color="#9CA3AF" style={{ marginTop: 12 }} />
            ) : (
              <ScrollView>
                {variants.map((v, i) => {
                  const active = selectedVariant === v;
                  return (
                    <TouchableOpacity
                      key={`${v.variant}-${v.year}-${i}`}
                      style={[styles.colRow, active && styles.colRowActive]}
                      onPress={() => setSelectedVariant(v)}
                    >
                      <Text style={[styles.colRowText, active && styles.colRowTextActive]} numberOfLines={1}>
                        {v.variant} ({v.year})
                      </Text>
                      <Text style={styles.colRowSub} numberOfLines={1}>{v.vehicle_type} · {v.drivetrain_type}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.submitBtn, (!selectedVariant || submitting) && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!selectedVariant || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Add Vehicle</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },

  list: { padding: 16, paddingBottom: 100 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  center: { alignItems: 'center', padding: 32, gap: 12 },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  emptyText: { color: '#64748B', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  vehicleHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  vehicleMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  defaultBadge: { backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  defaultText: { color: '#16A34A', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionText: { color: '#1B2B45', fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },

  addBtn: {
    position: 'absolute', bottom: 32, left: 16, right: 16,
    backgroundColor: '#1B2B45',
    borderRadius: 14, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },

  columns: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, borderRightWidth: 1, borderRightColor: '#F3F4F6', padding: 12 },
  colLabel: {
    fontSize: 11, fontWeight: '800', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  colHint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  colRow: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  colRowActive: { backgroundColor: '#EFF6FF' },
  colRowText: { fontSize: 13, color: '#111827', fontWeight: '600' },
  colRowTextActive: { color: '#1B2B45', fontWeight: '800' },
  colRowSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  modalFooter: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  submitBtn: {
    backgroundColor: '#1B2B45',
    borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
