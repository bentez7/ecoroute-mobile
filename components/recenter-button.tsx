import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function RecenterButton({ onPress, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, style]}
      hitSlop={8}
    >
      <MaterialIcons color="#1F2937" name="my-location" size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  btnPressed: {
    backgroundColor: '#F3F4F6',
    transform: [{ scale: 0.96 }],
  },
});
