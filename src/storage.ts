import type { Card } from './parser';

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

const KEY = 'starfall.decks.v1';

export function defaultSettings(): DeckSettings {
  return { answerWith: 'back', startLevel: 1, lenient: true };
}

export function loadDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((d): d is Deck => !!d && typeof d === 'object' && Array.isArray((d as Deck).cards))
      .map((d) => ({ ...d, best: d.best ?? 0, settings: { ...defaultSettings(), ...d.settings } }));
  } catch {
    return [];
  }
}

/** Returns false when the browser refused to store (private mode, quota). */
export function saveDecks(decks: Deck[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
