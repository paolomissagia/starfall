import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../ui/theme';
import type { GameProps } from './types';

/**
 * Web: Skia runs on CanvasKit (WebAssembly), which must finish loading before
 * any Skia module is evaluated, so the game view is loaded lazily after it.
 * canvaskit.wasm is copied into public/ by `setup-skia-web` (see package.json).
 */
export default function Game(props: GameProps) {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `/${file}` }}
      getComponent={() => import('./GameView')}
      componentProps={props}
      fallback={
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
