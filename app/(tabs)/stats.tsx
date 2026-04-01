import { View, Text, StyleSheet } from "react-native";
import Colors from "../../constants/Colors";

export default function StatsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Eco Stats</Text>
      <Text style={styles.subtitle}>
        Your carbon savings and travel insights will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.subtext,
    textAlign: "center",
  },
});