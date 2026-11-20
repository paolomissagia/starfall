import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { addDeck, setPending, useStore } from '../state/store';
import { Button, Muted, Panel, T } from '../ui/kit';
import { Screen } from '../ui/Screen';
import { colors, fonts } from '../ui/theme';

const PREVIEW_ROWS = 8;

export default function ImportPreview() {
  const pending = useStore((s) => s.pending);
  const [name, setName] = useState(pending?.name ?? '');

  if (!pending) return <Redirect href="/" />;
  const { cards, skipped } = pending;

  const summary =
    `${cards.length} card${cards.length === 1 ? '' : 's'} found` +
    (skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} skipped because a side was empty` : '') +
    (cards.length > PREVIEW_ROWS ? ` · showing the first ${PREVIEW_ROWS}` : '');

  const save = () => {
    const deck = addDeck(name.trim() || pending.name, cards);
    setPending(null);
    router.replace(`/deck/${deck.id}`);
  };

  return (
    <Screen narrow>
      <Panel>
        <T weight="semibold" style={styles.h2}>
          Check your deck
        </T>
        <Muted style={styles.label}>Deck name</Muted>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={80}
          style={styles.input}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
        />
        <Muted style={{ marginVertical: 12 }}>{summary}</Muted>

        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Muted style={styles.cell}>Front</Muted>
            <Muted style={styles.cell}>Back</Muted>
          </View>
          {cards.slice(0, PREVIEW_ROWS).map((c, i) => (
            <View key={i} style={[styles.row, i === Math.min(cards.length, PREVIEW_ROWS) - 1 && { borderBottomWidth: 0 }]}>
              <T style={styles.cell}>{c.front}</T>
              <T style={styles.cell}>{c.back}</T>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button
            variant="ghost"
            label="⇄ Swap front and back"
            onPress={() => setPending({ ...pending, cards: cards.map((c) => ({ front: c.back, back: c.front })) })}
          />
          <View style={{ flex: 1 }} />
          <Button
            label="Cancel"
            onPress={() => {
              setPending(null);
              router.back();
            }}
          />
          <Button variant="primary" label="Save deck" onPress={save} />
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 20, marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 4 },
  input: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
    backgroundColor: colors.field,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  table: { borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomColor: colors.panelBorder, borderBottomWidth: 1 },
  head: { backgroundColor: 'rgba(255,255,255,0.03)' },
  cell: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 20 },
});
