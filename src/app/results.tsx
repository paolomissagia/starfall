import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useStore } from '../state/store';
import { Button, Muted, Panel, T } from '../ui/kit';
import { Screen } from '../ui/Screen';
import { colors } from '../ui/theme';

export default function Results() {
  const run = useStore((s) => s.lastRun);
  const deck = useStore((s) => s.decks.find((d) => d.id === run?.deckId));
  if (!run || !deck) return <Redirect href="/" />;

  const { result } = run;
  const accuracy = result.attempts ? `${Math.round((result.correct / result.attempts) * 100)}%` : '—';
  const time = `${Math.floor(result.durationSec / 60)}:${String(result.durationSec % 60).padStart(2, '0')}`;
  const subtitle = run.practice
    ? 'Practice run'
    : run.newBest
      ? '★ New best score!'
      : deck.best
        ? `Best: ${deck.best.toLocaleString()}`
        : '';

  return (
    <Screen narrow>
      <Panel>
        <T weight="semibold" style={styles.eyebrow}>
          RUN COMPLETE
        </T>
        <T weight="bold" style={styles.score}>
          {result.score.toLocaleString()}
        </T>
        {!!subtitle && <Muted style={styles.center}>{subtitle}</Muted>}

        <View style={styles.stats}>
          {[
            ['Level', String(result.level)],
            ['Accuracy', accuracy],
            ['Best streak', String(result.bestStreak)],
            ['Time', time],
          ].map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Muted style={styles.statLabel}>{label.toUpperCase()}</Muted>
              <T weight="bold" style={styles.statValue}>
                {value}
              </T>
            </View>
          ))}
        </View>

        {result.missed.length > 0 && (
          <>
            <T weight="semibold" style={styles.h3}>
              To review
            </T>
            <View style={styles.missed}>
              {result.missed.map((m, i) => (
                <View key={i} style={[styles.missedRow, i === result.missed.length - 1 && { borderBottomWidth: 0 }]}>
                  <T style={{ flexShrink: 1 }}>{m.prompt}</T>
                  <Muted>→</Muted>
                  <T weight="bold" style={{ color: colors.accent, flexShrink: 1 }}>
                    {m.answer}
                  </T>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.actions}>
          <Button variant="ghost" label="← Decks" onPress={() => router.dismissTo('/')} />
          <View style={{ flex: 1 }} />
          {result.missed.length > 0 && (
            <Button
              label={`Practice missed (${result.missed.length})`}
              onPress={() => router.replace(`/play/${deck.id}?mode=missed`)}
            />
          )}
          <Button
            variant="primary"
            label="Play again"
            onPress={() => router.replace(`/play/${deck.id}${run.practice ? '?mode=repeat' : ''}`)}
          />
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.accent, textAlign: 'center', letterSpacing: 2, fontSize: 13 },
  score: { fontSize: 64, textAlign: 'center', letterSpacing: -2, lineHeight: 72 },
  center: { textAlign: 'center', marginBottom: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  stat: { flexGrow: 1, flexBasis: 110, backgroundColor: colors.subtle, borderRadius: 12, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 12, letterSpacing: 1.2 },
  statValue: { fontSize: 22 },
  h3: { fontSize: 17, marginTop: 22, marginBottom: 8 },
  missed: { borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 10 },
  missedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomColor: colors.panelBorder,
    borderBottomWidth: 1,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 22 },
});
