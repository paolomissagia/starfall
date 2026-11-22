import * as DocumentPicker from 'expo-document-picker';

import { MAX_BYTES, TOO_LARGE_MESSAGE, type PickedFile } from './shared';

export async function readBrowserFile(file: File): Promise<PickedFile> {
  if (file.size > MAX_BYTES) throw new Error(TOO_LARGE_MESSAGE);
  return { name: file.name, text: await file.text() };
}

/** Web: opens the browser file dialog and reads the chosen file as text. */
export async function pickDeckFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['.txt', '.csv', '.tsv', 'text/plain', 'text/csv', 'text/tab-separated-values'],
    base64: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const file = result.assets[0].file;
  if (!file) throw new Error('Could not read that file.');
  return readBrowserFile(file);
}
