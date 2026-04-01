import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import Colors from "../../constants/Colors";
import RouteCard from "../../components/RouteCard";

export default function MapScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>EcoRoute</Text>
        <Text style={styles.subtitle}>Carbon-smart navigation</Text>
      </View>

      <ImageBackground
        source={{
          uri: "https://images.unsplash.com/photo-1524661135-423995f22d0b",
        }}
        style={styles.hero}
      >
        <View style={styles.inputCard}>
          <Text style={styles.label}>From</Text>
          <Text style={styles.value}>Current Location</Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.label}>To</Text>
          <Text style={styles.value}>123 Business Park, City Center</Text>
        </View>
      </ImageBackground>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Choose Your Route</Text>

        <RouteCard
          title="Eco Route"
          details="28 min   •   15.2 km   •   2.8 kg CO₂"
          badge="-35% CO₂"
          active
        />

        <RouteCard
          title="Fastest Route"
          details="22 min   •   18.5 km   •   4.3 kg CO₂"
        />

        <RouteCard
          title="Shortest Route"
          details="25 min   •   14.8 km   •   3.2 kg CO₂"
          badge="-25% CO₂"
        />

        <TouchableOpacity style={styles.startButton}>
          <Text style={styles.startButtonText}>Start Navigation</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  logo: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#D1D5DB",
    marginTop: 4,
    fontSize: 14,
  },
  hero: {
    padding: 15,
    gap: 12,
    height: 260,
    justifyContent: "flex-start",
  },
  inputCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  label: {
    color: Colors.subtext,
    fontSize: 13,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  content: {
    padding: 16,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 18,
    color: Colors.text,
  },
  startButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});