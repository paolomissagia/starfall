import { useEffect, useState } from 'react';

import { readBrowserFile } from './pickDeckFile.web';
import type { PickedFile } from './shared';

/** Web: lets the player drop a deck file anywhere on the page. Returns whether a file is being dragged. */
export function useFileDrop(onFile: (file: PickedFile) => void, onError: (error: unknown) => void): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
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
        onFile(await readBrowserFile(file));
      } catch (err) {
        onError(err);
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
  }, [onFile, onError]);
  return dragging;
}
