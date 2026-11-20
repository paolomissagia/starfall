import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button, Muted, Panel, T } from '../ui/kit';
import { Screen } from '../ui/Screen';

const UPDATED = '20 November 2026';

const SECTIONS: [string, string][] = [
  [
    'The short version',
    'Starfall does not collect, send or sell any personal data. It has no accounts, no ads, no analytics and no tracking.',
  ],
  [
    'Your decks stay on your device',
    'Decks you import, your settings and your best scores are stored only on your device (app storage on Android and iOS, browser storage on the web). They are never uploaded to a server. Uninstalling the app or clearing your browser data deletes them.',
  ],
  [
    'Files you import',
    'When you choose a deck file, Starfall reads it on your device to create the deck. The file is not uploaded or shared.',
  ],
  [
    'Permissions',
    'The Android app asks for no special permissions. It uses vibration for game feedback and keeps the screen awake while you play.',
  ],
  [
    'Website hosting',
    'The web version is hosted on Vercel. Like any web host, Vercel may process standard technical data such as IP addresses in server logs to deliver and protect the site. Starfall itself does not use this data.',
  ],
  [
    'Children',
    'Starfall does not knowingly collect information from anyone, including children.',
  ],
  [
    'Changes',
    'If this policy changes, the new version will be posted on this page with a new date.',
  ],
  [
    'Contact',
    'Questions about this policy can be raised at github.com/paolomissagia/starfall/issues.',
  ],
];

export default function Privacy() {
  return (
    <Screen narrow>
      <Panel>
        <Button
          variant="ghost"
          label="← Back"
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <T weight="bold" style={styles.title}>
          Privacy policy
        </T>
        <Muted style={styles.updated}>Last updated {UPDATED}</Muted>
        {SECTIONS.map(([heading, body]) => (
          <T key={heading} style={styles.section}>
            <T weight="semibold">{heading}</T>
            {'\n'}
            <Muted>{body}</Muted>
          </T>
        ))}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', marginLeft: -8, marginTop: -8, marginBottom: 6 },
  title: { fontSize: 26 },
  updated: { fontSize: 13, marginBottom: 8 },
  section: { marginTop: 14, lineHeight: 23 },
});
