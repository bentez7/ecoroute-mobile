import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { api, type Vehicle } from '@/lib/api';

export default function ProfileScreen() {
  const { user, logout, updateProfile } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      setVehiclesLoading(true);
      const list = await api.vehicles.list();
      setVehicles(list);
    } catch (err) {
      console.warn('[profile] getVehicles failed', err);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadVehicles();
  }, [loadVehicles]));

  const handleSaveName = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Display name cannot be empty.');
      return;
    }
    try {
      setSavingName(true);
      await updateProfile({ display_name: trimmed });
      setEditingName(false);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Unknown error');
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, updateProfile]);

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await api.vehicles.setDefault(id);
      await loadVehicles();
    } catch (err: any) {
      Alert.alert('Could not set default', err?.message ?? 'Unknown error');
    }
  }, [loadVehicles]);

  const handleDelete = useCallback((vehicle: Vehicle) => {
    Alert.alert(
      'Delete vehicle?',
      `${vehicle.make} ${vehicle.model} will be removed from your garage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.vehicles.delete(vehicle.id);
              setVehicles((vs) => vs.filter((v) => v.id !== vehicle.id));
            } catch (err: any) {
              Alert.alert('Delete failed', err?.message ?? 'Unknown error');
            }
          },
        },
      ],
    );
  }, []);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <MaterialIcons color="#C8D4E4" name="logout" size={20} />
          </TouchableOpacity>
        </View>

        {/* Name / Email card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Display Name</Text>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <TouchableOpacity
                style={styles.nameSaveBtn}
                onPress={handleSaveName}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialIcons color="#FFFFFF" name="check" size={20} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nameCancelBtn}
                onPress={() => { setNameDraft(user.display_name ?? ''); setEditingName(false); }}
                disabled={savingName}
              >
                <MaterialIcons color="#6B7280" name="close" size={20} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => { setNameDraft(user.display_name ?? ''); setEditingName(true); }}
            >
              <Text style={styles.nameText} numberOfLines={1}>
                {user.display_name ?? 'Add your name'}
              </Text>
              <MaterialIcons color="#9CA3AF" name="edit" size={18} />
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>Email</Text>
          <Text style={styles.emailText}>{user.email ?? '—'}</Text>
        </View>

        {/* Vehicles */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Vehicles</Text>
          {vehicles.length > 0 && (
            <Text style={styles.sectionCount}>{vehicles.length}</Text>
          )}
        </View>

        {vehiclesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#1B2B45" />
          </View>
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialIcons color="#CBD5E1" name="directions-car" size={40} />
            <Text style={styles.emptyText}>
              No vehicles yet. Add one when you start your next trip.
            </Text>
          </View>
        ) : (
          vehicles.map((v) => (
            <View key={v.id} style={styles.vehicleCard}>
              <View style={styles.vehicleIcon}>
                <MaterialIcons color="#1B2B45" name="directions-car" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.vehicleTitleRow}>
                  <Text style={styles.vehicleTitle} numberOfLines={1}>
                    {v.make} {v.model}
                  </Text>
                  {v.is_default && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.vehicleSub}>
                  {v.year} · {v.vehicle_type} · {v.drivetrain_type}
                </Text>
                <Text style={styles.vehicleMeta}>
                  {v.vehicle_mass_kg.toFixed(0)} kg
                </Text>
                <View style={styles.vehicleActions}>
                  {!v.is_default && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleSetDefault(v.id)}
                    >
                      <MaterialIcons color="#1B2B45" name="star-outline" size={16} />
                      <Text style={styles.actionText}>Set default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => handleDelete(v)}
                  >
                    <MaterialIcons color="#DC2626" name="delete-outline" size={16} />
                    <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#1B2B45' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  scrollContent: { paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginTop: 12, marginBottom: 20,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12,
  },
  nameText:  { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  emailText: { fontSize: 15, color: '#374151', fontWeight: '500' },

  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: '#111827',
    borderBottomWidth: 1, borderBottomColor: '#D1D5DB',
    paddingVertical: 4,
  },
  nameSaveBtn: {
    backgroundColor: '#1B2B45', borderRadius: 10,
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  nameCancelBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 10,
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 14 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginHorizontal: 20, marginBottom: 10,
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  sectionCount: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '600' },

  emptyBox: {
    alignItems: 'center', padding: 32, gap: 10,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF', borderRadius: 16,
  },
  emptyText: {
    color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 20,
  },

  vehicleCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 14,
    flexDirection: 'row', gap: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  vehicleIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2,
  },
  vehicleTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },
  vehicleSub:   { fontSize: 13, color: '#6B7280', textTransform: 'capitalize' },
  vehicleMeta:  { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  defaultBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },

  vehicleActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  actionBtnDanger:  { backgroundColor: '#FEE2E2' },
  actionText:       { fontSize: 12, fontWeight: '700', color: '#1B2B45' },
  actionTextDanger: { color: '#DC2626' },
});
