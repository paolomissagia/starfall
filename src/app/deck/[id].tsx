import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { updateDeck, useStore } from '../../state/store';
import type { AnswerWith, DeckSettings } from '../../state/types';
import { Button, Muted, Panel, Segmented, T } from '../../ui/kit';
import { Screen } from '../../ui/Screen';
import { colors } from '../../ui/theme';

export default function DeckSetup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deck = useStore((s) => s.decks.find((d) => d.id === id));
  if (!deck) return <Redirect href="/" />;

  const s = deck.settings;
  const change = (patch: Partial<DeckSettings>) => updateDeck(deck.id, { settings: { ...s, ...patch } });

  return (
    <Screen narrow>
      <Panel>
        <Button
          variant="ghost"
          label="← Decks"
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <T weight="semibold" style={styles.title}>
          {deck.name}
        </T>
        <Muted>
          {deck.cards.length} cards{deck.best ? ` · best score ${deck.best.toLocaleString()}` : ''}
        </Muted>

        <Muted style={styles.legend}>What falls, and what you type</Muted>
        <Segmented<AnswerWith>
          value={s.answerWith}
          onChange={(answerWith) => change({ answerWith })}
          options={[
            { value: 'back', label: 'See front, type back' },
            { value: 'front', label: 'See back, type front' },
            { value: 'mixed', label: 'Mixed' },
          ]}
        />

        <Muted style={styles.legend}>Starting speed</Muted>
        <Segmented<number>
          value={s.startLevel}
          onChange={(startLevel) => change({ startLevel })}
          options={[
            { value: 1, label: 'Gentle' },
            { value: 3, label: 'Brisk' },
            { value: 6, label: 'Frantic' },
          ]}
        />

        <Pressable
          style={styles.toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: s.lenient }}
          onPress={() => change({ lenient: !s.lenient })}
        >
          <View style={[styles.check, s.lenient && styles.checkOn]}>{s.lenient && <T style={styles.tick}>✓</T>}</View>
          <View style={{ flex: 1 }}>
            <T weight="semibold">Forgiving answers</T>
            <Muted style={styles.small}>
              Ignore capitals, accents and punctuation, accept one typo, and accept any one of several answers separated
              by “,” or “;”.
            </Muted>
          </View>
        </Pressable>

        <Button variant="primary" big label="Launch ▸" onPress={() => router.push(`/play/${deck.id}`)} />
        <Muted style={styles.hint}>
          Press Enter to submit an answer. Stuck? Tap a rock to peek at the answer (half points, and it goes on your
          review list).
        </Muted>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginLeft: -8, marginTop: -8, marginBottom: 6 },
  title: { fontSize: 24, marginBottom: 2 },
  legend: { fontSize: 13, marginTop: 20, marginBottom: 8 },
  toggle: { flexDirection: 'row', gap: 12, marginTop: 22, marginBottom: 18, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.panelBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: colors.accentText, fontSize: 15, lineHeight: 18 },
  small: { fontSize: 14 },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 12 },
});
