import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Colors from "../constants/Colors";

type VehicleCardProps = {
  name: string;
  type: string;
  fuel: string;
  emissions: string;
  range: string;
  onSelect?: () => void;
};

export default function VehicleCard({
  name,
  type,
  fuel,
  emissions,
  range,
  onSelect,
}: VehicleCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.vehicleName}>{name}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{fuel}</Text>
        </View>
      </View>

      <Text style={styles.vehicleType}>{type}</Text>

      <View style={styles.divider} />

      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.label}>Emissions</Text>
          <Text style={styles.value}>{emissions}</Text>
        </View>

        <View>
          <Text style={styles.label}>Range</Text>
          <Text style={styles.value}>{range}</Text>
        </View>

        <TouchableOpacity onPress={onSelect}>
          <Text style={styles.selectText}>Select</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vehicleName: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
  },
  vehicleType: {
    color: Colors.subtext,
    marginTop: 6,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 18,
  },
  label: {
    color: Colors.subtext,
    fontSize: 14,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
    color: Colors.text,
  },
  selectText: {
    fontSize: 18,
    color: Colors.primary,
    fontWeight: "600",
  },
  tag: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: "600",
  },
});