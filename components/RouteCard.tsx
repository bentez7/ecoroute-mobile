import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Colors from "../constants/Colors";

type RouteCardProps = {
  title: string;
  details: string;
  badge?: string;
  active?: boolean;
  onPress?: () => void;
};

export default function RouteCard({
  title,
  details,
  badge,
  active = false,
  onPress,
}: RouteCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.activeCard]}
      onPress={onPress}
    >
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.details}>{details}</Text>
        </View>

        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeCard: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 8,
  },
  details: {
    color: Colors.subtext,
    fontSize: 15,
  },
  badge: {
    backgroundColor: Colors.ecoGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: Colors.ecoGreenText,
    fontWeight: "600",
    fontSize: 12,
  },
});