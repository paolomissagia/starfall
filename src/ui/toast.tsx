import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from './kit';
import { colors } from './theme';

let show: ((message: string) => void) | null = null;

export function toast(message: string): void {
  show?.(message);
}

/** Mount once at the root. */
export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    show = (m) => {
      setMessage(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 3200);
    };
    return () => {
      show = null;
      clearTimeout(timer);
    };
  }, []);
  if (!message) return null;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 24 }]}>
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <T>{message}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { pointerEvents: 'none', position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    maxWidth: 520,
    backgroundColor: '#1c1f44',
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
});
