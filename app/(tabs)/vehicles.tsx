import {
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  View,
} from "react-native";
import Colors from "../../constants/Colors";
import VehicleCard from "../../components/VehicleCard";

export default function VehiclesScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Vehicles</Text>
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <VehicleCard
        name="Tesla Model 3"
        type="Electric Car"
        fuel="Electric"
        emissions="0 g/km"
        range="580 km"
        onSelect={() => Alert.alert("Selected", "Tesla Model 3 selected")}
      />

      <VehicleCard
        name="Mercedes Sprinter"
        type="Delivery Van"
        fuel="Diesel"
        emissions="195 g/km"
        range="850 km"
        onSelect={() => Alert.alert("Selected", "Mercedes Sprinter selected")}
      />

      <VehicleCard
        name="Kawasaki Ninja"
        type="Motorcycle"
        fuel="Petrol"
        emissions="105 g/km"
        range="320 km"
        onSelect={() => Alert.alert("Selected", "Kawasaki Ninja selected")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.text,
  },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});