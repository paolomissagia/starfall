import type { PickedFile } from './shared';

/** Native: there is no drag and drop, so this never reports a drag. See useFileDrop.web.ts. */
export function useFileDrop(_onFile: (file: PickedFile) => void, _onError: (error: unknown) => void): boolean {
  return false;
}
