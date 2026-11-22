import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Canvas, createPicture, Picture, useFont, type SkFont } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type HostInstance,
  type LayoutChangeEvent,
  type TextInputInstance,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Muted, T } from '../ui/kit';
import { colors, fonts as uiFonts } from '../ui/theme';
import { Engine, TEXT_SIZE, type HudState } from './engine';
import { Renderer, type Fonts } from './renderer';
import type { GameProps } from './types';

export default function GameView(props: GameProps) {
  const text = useFont(SpaceGrotesk_600SemiBold, TEXT_SIZE);
  const small = useFont(SpaceGrotesk_600SemiBold, 11);
  const score = useFont(SpaceGrotesk_700Bold, 18);
  if (!text || !small || !score) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return <Playfield {...props} fonts={{ text, small, score }} />;
}

const isNative = Platform.OS !== 'web';
const ANSWER_PLACEHOLDER = 'Type the answer';
const CORRECTION_PLACEHOLDER = 'Type it to continue';

function Playfield({ cards, settings, onOver, fonts }: GameProps & { fonts: Fonts }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInputInstance>(null);
  const [answer, setAnswer] = useState('');
  const [correction, setCorrection] = useState<{ prompt: string; answer: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [levelText, setLevelText] = useState('');
  const [levelAnim] = useState(() => new Animated.Value(0));
  const [shakeAnim] = useState(() => new Animated.Value(0));

  // The engine lives for the whole run; handlers are (re)attached in an effect below.
  const [engine] = useState(
    () =>
      new Engine(
        { cards, answerWith: settings.answerWith, startLevel: settings.startLevel, lenient: settings.lenient },
        (s) => measureWidth(fonts.text, s),
      ),
  );
  const [hud, setHud] = useState<HudState>(() => engine.hud());

  useEffect(() => {
    engine.listen({
      hud: setHud,
      correction: (prompt, ans) => setCorrection({ prompt, answer: ans }),
      correctionDone: () => setCorrection(null),
      levelUp: (level) => {
        setLevelText(`Level ${level}`);
        levelAnim.setValue(0);
        Animated.timing(levelAnim, { toValue: 1, duration: 1600, useNativeDriver: isNative }).start();
      },
      feedback: (kind) => {
        if (!isNative) return;
        if (kind === 'impact') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        else if (kind === 'wrong') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (kind === 'correct') void Haptics.selectionAsync();
      },
      over: onOver,
    });
  }, [engine, levelAnim, onOver]);

  const picture = useSharedValue(createPicture(() => {}));

  // Game loop: simulate, then record a new picture for the Skia canvas.
  useEffect(() => {
    const renderer = new Renderer(fonts);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      engine.update(dt);
      if (engine.w > 0) picture.value = renderer.draw(engine);
      if (engine.state !== 'over') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [engine, fonts, picture]);

  const pause = () => {
    engine.pause();
    setPaused(engine.paused);
  };
  const resume = () => {
    engine.resume();
    setPaused(false);
    inputRef.current?.focus();
  };
  const onBackground = useEffectEvent(pause);
  const onTogglePause = useEffectEvent(() => (engine.paused ? resume() : pause()));

  // Pause when the app goes to the background or the tab is hidden.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') onBackground();
    });
    return () => sub.remove();
  }, []);

  // Android back button pauses instead of leaving mid-run.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onTogglePause();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Esc pauses on web/desktop.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onTogglePause();
      }
    };
    // Capture phase: the focused answer box stops keydown from bubbling up to window.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // The play area and the answer box are measured separately; the planet sits just above the box.
  const layout = useRef({ width: 0, height: 0, floor: 0 });
  const relayout = () => {
    const { width, height, floor } = layout.current;
    engine.resize(width, height, floor || height);
  };
  const onLayout = (e: LayoutChangeEvent) => {
    layout.current.width = e.nativeEvent.layout.width;
    layout.current.height = e.nativeEvent.layout.height;
    relayout();
  };
  const onAnswerLayout = (e: LayoutChangeEvent) => {
    layout.current.floor = e.nativeEvent.layout.y;
    relayout();
  };

  const fieldRef = useRef<HostInstance>(null);
  const onPressCanvas = (e: GestureResponderEvent) => {
    inputRef.current?.focus();
    if (Platform.OS !== 'web') {
      engine.peek(e.nativeEvent.locationX, e.nativeEvent.locationY);
      return;
    }
    // On web, touch events don't carry view-relative coordinates; derive them from page coordinates.
    const { pageX, pageY } = e.nativeEvent;
    fieldRef.current?.measureInWindow((x, y) => engine.peek(pageX - x, pageY - y));
  };

  const submit = () => {
    const result = engine.submit(answer);
    if (result === 'correct') {
      setAnswer('');
    } else if (result === 'wrong') {
      shakeAnim.setValue(0);
      Animated.sequence(
        [8, -8, 6, -6, 0].map((toValue) =>
          Animated.timing(shakeAnim, { toValue, duration: 55, useNativeDriver: isNative }),
        ),
      ).start();
    }
    // Keep the keyboard up for the next answer.
    inputRef.current?.focus();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      {/* KeyboardAvoidingView pads itself, but absolute children ignore padding (they sit on the padding
          box). This in-flow view is what actually shrinks, so everything below is laid out inside it. */}
      <View style={styles.stage}>
        <View
          ref={fieldRef}
          style={StyleSheet.absoluteFill}
          onLayout={onLayout}
          onStartShouldSetResponder={() => true}
          onResponderGrant={onPressCanvas}
        >
          <Canvas style={styles.canvas}>
            <Picture picture={picture} />
          </Canvas>
        </View>

        <View style={[styles.hud, { paddingTop: insets.top + 10 }]}>
          <HudItem label="Score" value={hud.score.toLocaleString()} />
          <View>
            <HudItem label="Level" value={String(hud.level)} />
            <View style={styles.levelBar}>
              <View style={[styles.levelFill, { width: `${Math.round(hud.levelProgress * 100)}%` }]} />
            </View>
          </View>
          <HudItem label="Streak" value={hud.streak > 1 ? `×${hud.streak}` : String(hud.streak)} />
          <View>
            <Muted style={styles.hudLabel}>SHIELDS</Muted>
            <View style={styles.shields}>
              {Array.from({ length: hud.maxLives }, (_, i) => (
                <View key={i} style={[styles.shield, i >= hud.lives && styles.shieldLost]} />
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pause"
            onPress={pause}
            style={styles.pauseBtn}
            hitSlop={8}
          >
            <T weight="bold" style={{ fontSize: 13 }}>
              ❚❚
            </T>
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.levelUp,
            {
              opacity: levelAnim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { scale: levelAnim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0.8, 1.05, 1, 1] }) },
                { translateY: levelAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, -20] }) },
              ],
            },
          ]}
        >
          <T weight="bold" style={styles.levelUpText}>
            {levelText}
          </T>
        </Animated.View>

        {correction && !paused && (
          <View style={[styles.overlay, styles.passThrough]}>
            <View style={styles.card}>
              <T weight="semibold" style={[styles.eyebrow, { color: colors.danger }]}>
                IMPACT!
              </T>
              <T weight="semibold" style={styles.correctionPrompt}>
                {correction.prompt}
              </T>
              <Muted style={styles.center}>The answer was</Muted>
              <T weight="bold" style={styles.correctionAnswer}>
                {correction.answer}
              </T>
              <Muted style={[styles.center, { fontSize: 14 }]}>Type it below to continue.</Muted>
            </View>
          </View>
        )}

        {paused && (
          <View style={styles.overlay}>
            <View style={styles.card}>
              <T weight="semibold" style={styles.pausedTitle}>
                Paused
              </T>
              <View style={styles.pauseActions}>
                <Button variant="primary" label="Resume" onPress={resume} />
                <Button
                  label="End run"
                  onPress={() => {
                    setPaused(false);
                    engine.quit();
                  }}
                />
              </View>
            </View>
          </View>
        )}

        <Animated.View
          onLayout={onAnswerLayout}
          style={[
            styles.answerWrap,
            { bottom: Math.max(insets.bottom, 12) + 8, transform: [{ translateX: shakeAnim }] },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={answer}
            onChangeText={setAnswer}
            onSubmitEditing={submit}
            submitBehavior="submit"
            autoFocus
            placeholder={correction ? CORRECTION_PLACEHOLDER : ANSWER_PLACEHOLDER}
            placeholderTextColor="rgba(154,160,200,0.8)"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            importantForAutofill="no"
            returnKeyType="send"
            enterKeyHint="send"
            accessibilityLabel="Your answer"
            style={[styles.answer, correction && styles.answerCorrecting]}
          />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

function HudItem({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Muted style={styles.hudLabel}>{label.toUpperCase()}</Muted>
      <T weight="bold" style={styles.hudValue}>
        {value}
      </T>
    </View>
  );
}

/** Advance width of a line of text (what layout needs, unlike glyph bounds). */
function measureWidth(font: SkFont, s: string): number {
  if (!s) return 0;
  const widths = font.getGlyphWidths(font.getGlyphIDs(s));
  let total = 0;
  for (const w of widths) total += w;
  return total;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  stage: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  passThrough: { pointerEvents: 'none' },
  // Skia's web Canvas needs a single style object (no arrays).
  canvas: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
  hud: {
    pointerEvents: 'box-none',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    // Rocks enter from underneath the HUD instead of passing through its text.
    backgroundColor: 'rgba(5, 6, 15, 0.86)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(140, 150, 255, 0.10)',
  },
  hudLabel: { fontSize: 11, letterSpacing: 1.3 },
  hudValue: { fontSize: 20, fontVariant: ['tabular-nums'] },
  levelBar: { width: 48, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 2, overflow: 'hidden' },
  levelFill: { height: '100%', backgroundColor: colors.teal },
  shields: { flexDirection: 'row', gap: 5, paddingTop: 6 },
  shield: {
    width: 14,
    height: 17,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.teal,
  },
  shieldLost: { backgroundColor: 'rgba(255,255,255,0.15)' },
  pauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelUp: { pointerEvents: 'none', position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  levelUpText: {
    fontSize: 44,
    color: colors.teal,
    textShadowColor: 'rgba(79,214,196,0.6)',
    textShadowRadius: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,6,15,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingBottom: 110,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
  },
  eyebrow: { letterSpacing: 2, fontSize: 12 },
  center: { textAlign: 'center' },
  correctionPrompt: { fontSize: 22, textAlign: 'center', marginTop: 8, marginBottom: 12 },
  correctionAnswer: { fontSize: 26, color: colors.accent, textAlign: 'center', marginVertical: 8 },
  pausedTitle: { fontSize: 24, marginBottom: 16 },
  pauseActions: { flexDirection: 'row', gap: 10 },
  answerWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  answer: {
    width: '100%',
    maxWidth: 560,
    color: colors.text,
    fontFamily: uiFonts.medium,
    fontSize: 19,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(170,245,255,0.45)',
    backgroundColor: 'rgba(5,10,25,0.88)',
  },
  answerCorrecting: { borderColor: colors.accent },
});
