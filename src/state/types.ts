import type { Card } from '../core/parser';

export type AnswerWith = 'back' | 'front' | 'mixed';

export interface DeckSettings {
  answerWith: AnswerWith;
  startLevel: number;
  lenient: boolean;
}

export interface Deck {
  id: string;
  name: string;
  cards: Card[];
  createdAt: number;
  best: number;
  settings: DeckSettings;
}

export function defaultSettings(): DeckSettings {
  return { answerWith: 'back', startLevel: 1, lenient: true };
}
