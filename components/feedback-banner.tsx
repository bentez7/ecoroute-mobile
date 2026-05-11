import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import type { FeedbackEvent, FeedbackSeverity } from '@/lib/api';

interface Props {
  items: FeedbackEvent[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3500;

const STYLE_BY_SEVERITY: Record<
  FeedbackSeverity | 'eco_praise',
  { bg: string; fg: string; icon: keyof typeof MaterialIcons.glyphMap }
> = {
  info: { bg: '#1D4ED8', fg: '#FFFFFF', icon: 'info' },
  warning: { bg: '#D97706', fg: '#FFFFFF', icon: 'warning' },
  critical: { bg: '#DC2626', fg: '#FFFFFF', icon: 'error' },
  eco_praise: { bg: '#15803D', fg: '#FFFFFF', icon: 'eco' },
};

// Fallback severity per event_type when the backend hasn't populated the
// `severity` column. Hard-driving feedback defaults to warning, ambient
// nudges to info — matches what the backend will set explicitly once the
// FeedbackEventService is updated.
const DEFAULT_SEVERITY_BY_EVENT_TYPE: Record<string, FeedbackSeverity> = {
  harsh_accel:    'warning',
  harsh_brake:    'warning',
  idling:         'info',
  speed_variance: 'info',
};

function effectiveSeverity(evt: FeedbackEvent): FeedbackSeverity {
  return evt.severity ?? DEFAULT_SEVERITY_BY_EVENT_TYPE[evt.event_type] ?? 'info';
}

function styleFor(evt: FeedbackEvent) {
  if (evt.event_type === 'eco_praise') return STYLE_BY_SEVERITY.eco_praise;
  return STYLE_BY_SEVERITY[effectiveSeverity(evt)] ?? STYLE_BY_SEVERITY.info;
}

export function FeedbackBanner({ items, onDismiss }: Props) {
  const top = items[0];
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!top) return;
    if (lastIdRef.current === top.id) return;
    lastIdRef.current = top.id;

    const sev = effectiveSeverity(top);

    if (sev === 'critical') {
      Vibration.vibrate(200);
    }

    if (sev === 'info' || top.event_type === 'eco_praise') {
      const t = setTimeout(() => onDismiss(top.id), AUTO_DISMISS_MS);
      return () => clearTimeout(t);
    }
  }, [top, onDismiss]);

  if (!top) return null;

  const s = styleFor(top);
  const sev = effectiveSeverity(top);
  const isSticky = sev === 'warning' || sev === 'critical';

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        style={[styles.banner, { backgroundColor: s.bg }]}
        onPress={() => onDismiss(top.id)}
      >
        <MaterialIcons color={s.fg} name={s.icon} size={20} />
        <Text style={[styles.text, { color: s.fg }]} numberOfLines={2}>
          {top.message}
        </Text>
        {isSticky ? (
          <MaterialIcons color={s.fg} name="close" size={18} />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 100,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '600' },
});
