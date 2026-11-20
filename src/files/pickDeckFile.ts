import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedFile {
  name: string;
  text: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Native (Android/iOS): opens the system file picker and reads the chosen file as text. */
export async function pickDeckFile(): Promise<PickedFile | null> {
  // '*/*' because Android often labels .txt/.tsv exports with odd or missing MIME types.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BYTES) throw new Error('That file is larger than 10 MB. Is it really a text export?');
  const text = await new File(asset.uri).text();
  return { name: asset.name, text };
}
