import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

/** A static, cheap starry backdrop for the menu screens. */
export const Starfield = memo(function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%` as const,
        top: `${Math.random() * 100}%` as const,
        size: Math.random() < 0.15 ? 2 : 1,
        opacity: 0.25 + Math.random() * 0.6,
      })),
    [],
  );
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      {stars.map((s) => (
        <View
          key={s.key}
          style={[styles.star, { left: s.left, top: s.top, width: s.size, height: s.size, opacity: s.opacity }]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg, overflow: 'hidden', pointerEvents: 'none' },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#ffffff' },
});
