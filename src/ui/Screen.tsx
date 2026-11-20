import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Starfield } from './Starfield';
import { colors } from './theme';

/** Scrollable menu screen with the starry background and safe-area padding. */
export function Screen({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Starfield />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.inner, narrow && styles.narrow]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  inner: { width: '100%', maxWidth: 920, alignSelf: 'center' },
  narrow: { maxWidth: 620 },
});
