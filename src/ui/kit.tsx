import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius } from './theme';

export function T({ style, weight = 'regular', ...props }: TextProps & { weight?: keyof typeof fonts }) {
  return <Text {...props} style={[styles.text, { fontFamily: fonts[weight] }, style]} />;
}

export function Muted({ style, ...props }: TextProps & { weight?: keyof typeof fonts }) {
  return <T {...props} style={[styles.muted, style]} />;
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  variant = 'secondary',
  big = false,
  style,
  ...props
}: PressableProps & { label: string; variant?: Variant; big?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        styles[variant],
        big && styles.big,
        (pressed || hovered) && styles[`${variant}Active`],
        pressed && { transform: [{ translateY: 1 }] },
        props.disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <T weight="semibold" style={[styles.buttonText, variant === 'primary' && styles.primaryText, variant === 'ghost' && styles.ghostText, big && styles.bigText]}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <T weight="medium" style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: radius,
    padding: 20,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  primaryActive: { backgroundColor: '#ffbf75' },
  secondary: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.panelBorder },
  secondaryActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  ghost: { paddingHorizontal: 8 },
  ghostActive: { backgroundColor: 'rgba(255,255,255,0.05)' },
  big: { minHeight: 54, paddingVertical: 14 },
  buttonText: { fontSize: 16 },
  primaryText: { color: colors.accentText },
  ghostText: { color: colors.muted },
  bigText: { fontSize: 18 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segment: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { borderColor: colors.accent, backgroundColor: 'rgba(255,177,92,0.14)' },
  segmentText: { fontSize: 15, textAlign: 'center' },
  segmentTextSelected: { color: '#ffe0bd' },
});
