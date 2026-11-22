export interface PickedFile {
  name: string;
  text: string;
}

export const MAX_BYTES = 10 * 1024 * 1024;
export const TOO_LARGE_MESSAGE = 'That file is larger than 10 MB. Is it really a text export?';
