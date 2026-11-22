import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { MAX_BYTES, TOO_LARGE_MESSAGE, type PickedFile } from './shared';

/** Native (Android/iOS): opens the system file picker and reads the chosen file as text. */
export async function pickDeckFile(): Promise<PickedFile | null> {
  // '*/*' because Android often labels .txt/.tsv exports with odd or missing MIME types.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BYTES) throw new Error(TOO_LARGE_MESSAGE);
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}
