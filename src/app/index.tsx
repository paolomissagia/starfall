import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parseDeck } from '../core/parser';
import { SAMPLE_CARDS, SAMPLE_NAME } from '../core/sample';
import { pickDeckFile, type PickedFile } from '../files/pickDeckFile';
import { deleteDeck, setPending, useStore } from '../state/store';
import { confirm } from '../ui/confirm';
import { Button, Muted, Panel, T } from '../ui/kit';
import { Screen } from '../ui/Screen';
import { colors } from '../ui/theme';
import { toast } from '../ui/toast';

function importText(text: string, fallbackName: string): void {
  const result = parseDeck(text);
  if (result.cards.length === 0) {
    toast(
      result.skipped > 0
        ? 'No cards found: every row was missing a front or a back.'
        : 'No cards found. Each line needs a term and a definition separated by a tab, comma or semicolon.',
    );
    return;
  }
  setPending({ name: result.deckName || fallbackName, cards: result.cards, skipped: result.skipped });
  router.push('/import');
}

function importPicked(file: PickedFile): void {
  const fallback = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported deck';
  importText(file.text, fallback);
}

export default function Home() {
  const decks = useStore((s) => s.decks);
  const saveFailed = useStore((s) => s.saveFailed);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const dragging = useWebFileDrop(importPicked);

  useEffect(() => {
    if (saveFailed) toast('Saving failed, so new decks may be lost when you close the app.');
  }, [saveFailed]);

  const choose = async () => {
    try {
      const file = await pickDeckFile();
      if (file) importPicked(file);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const remove = async (id: string, name: string) => {
    if (await confirm(`Delete “${name}”?`, "This can't be undone.", 'Delete')) deleteDeck(id);
  };

  return (
    <Screen>
      <View style={styles.brand}>
        <View style={styles.titleRow}>
          <View style={styles.mark} />
          <T weight="bold" style={styles.title}>
            Starfall
          </T>
        </View>
        <Muted style={styles.tagline}>Words are falling from the sky. Type the answer before they reach the ground.</Muted>
      </View>

      <View style={styles.grid}>
        <Panel style={styles.col}>
          <T weight="semibold" style={styles.h2}>
            Your decks
          </T>
          {decks.length === 0 ? (
            <Muted>No decks yet. Import a file to get started, or try the sample deck.</Muted>
          ) : (
            <View style={{ gap: 8 }}>
              {decks.map((d) => (
                <View key={d.id} style={styles.deck}>
                  <Pressable
                    style={styles.deckMain}
                    accessibilityRole="button"
                    onPress={() => router.push(`/deck/${d.id}`)}
                  >
                    <T weight="semibold" numberOfLines={1}>
                      {d.name}
                    </T>
                    <Muted style={styles.small}>
                      {d.cards.length} cards{d.best ? ` · best ${d.best.toLocaleString()}` : ''}
                    </Muted>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${d.name}`}
                    onPress={() => void remove(d.id, d.name)}
                    style={styles.deleteBtn}
                    hitSlop={6}
                  >
                    <Muted style={{ fontSize: 18 }}>✕</Muted>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Panel>

        <Panel style={styles.col}>
          <T weight="semibold" style={styles.h2}>
            Add a deck
          </T>
          <Pressable
            accessibilityRole="button"
            onPress={() => void choose()}
            style={({ pressed }) => [styles.dropzone, (pressed || dragging) && styles.dropzoneActive]}
          >
            <T style={styles.dropIcon}>⇪</T>
            <T weight="semibold">{Platform.OS === 'web' ? 'Drop a file here' : 'Choose a file'}</T>
            <Muted>{Platform.OS === 'web' ? 'or click to choose one' : 'from your phone or cloud storage'}</Muted>
            <Muted style={[styles.small, { marginTop: 8 }]}>Anki plain-text export (.txt), CSV or TSV</Muted>
          </Pressable>

          <Disclosure label="Or paste your cards" open={pasteOpen} onToggle={() => setPasteOpen((o) => !o)}>
            <TextInput
              multiline
              value={pasted}
              onChangeText={setPasted}
              placeholder={'One card per line: term, then a tab (or comma), then the definition\nhola, hello\ngracias, thank you'}
              placeholderTextColor={colors.muted}
              style={styles.textarea}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Import pasted cards"
              onPress={() => (pasted.trim() ? importText(pasted, 'Pasted deck') : toast('Paste some cards first.'))}
            />
          </Disclosure>

          <Button
            variant="ghost"
            label="Try the sample deck"
            style={{ alignSelf: 'flex-start', marginTop: 8 }}
            onPress={() => {
              setPending({ name: SAMPLE_NAME, cards: SAMPLE_CARDS.map((c) => ({ ...c })), skipped: 0 });
              router.push('/import');
            }}
          />

          <Disclosure label="How do I export from Anki?" open={helpOpen} onToggle={() => setHelpOpen((o) => !o)}>
            {[
              'In Anki on your computer, open Browse and select the deck (or cards) you want.',
              'Choose File → Export (or Notes → Export Notes).',
              'Pick “Notes in Plain Text (.txt)”. Turning off “Include HTML and media references” gives the cleanest result.',
              'Import the exported file here. The first field becomes the front, the second the back.',
            ].map((step, i) => (
              <Muted key={i} style={styles.step}>
                {i + 1}. {step}
              </Muted>
            ))}
          </Disclosure>
        </Panel>
      </View>

      <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.footer}>
        <Muted style={styles.small}>Privacy policy</Muted>
      </Pressable>
    </Screen>
  );
}

function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.disclosure}>
        <Muted weight="medium">
          {open ? '▾' : '▸'} {label}
        </Muted>
      </Pressable>
      {open && <View style={{ marginTop: 8, gap: 8 }}>{children}</View>}
    </View>
  );
}

/** On web, lets the player drop a deck file anywhere on the home screen. */
function useWebFileDrop(onFile: (file: PickedFile) => void): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      try {
        const { readBrowserFile } = await import('../files/pickDeckFile.web');
        onFile(await readBrowserFile(file));
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not read that file.');
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [onFile]);
  return dragging;
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginTop: 12, marginBottom: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5a4a42',
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  title: { fontSize: 52, letterSpacing: -1.5 },
  tagline: { fontSize: 17, textAlign: 'center', maxWidth: 520, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  col: { flexGrow: 1, flexBasis: 320 },
  h2: { fontSize: 20, marginBottom: 12 },
  small: { fontSize: 13 },
  deck: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: colors.subtle },
  deckMain: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  deleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dropzone: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 26,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,177,92,0.4)',
    borderRadius: 16,
  },
  dropzoneActive: { backgroundColor: 'rgba(255,177,92,0.08)', borderColor: colors.accent },
  dropIcon: { fontSize: 28, color: colors.accent, marginBottom: 4 },
  disclosure: { paddingVertical: 6 },
  textarea: {
    minHeight: 120,
    color: colors.text,
    backgroundColor: colors.field,
    borderColor: colors.panelBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontFamily: Platform.select({ web: 'ui-monospace, monospace', default: 'monospace' }),
    fontSize: 14,
    textAlignVertical: 'top',
  },
  step: { fontSize: 14 },
  footer: { alignSelf: 'center', marginTop: 28, padding: 8 },
});
