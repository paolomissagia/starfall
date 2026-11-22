import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Card } from '../core/parser';
import type { GameResult } from '../game/engine';
import { defaultSettings, type Deck } from './types';

/**
 * A tiny app-wide store. Decks persist to AsyncStorage (localStorage on web);
 * the pending import and the last run only live in memory, to hand data
 * between screens.
 */

const KEY = 'starfall.decks.v1';

export interface PendingImport {
  name: string;
  cards: Card[];
  skipped: number;
}

export interface LastRun {
  deckId: string;
  practice: boolean;
  cards: Card[];
  result: GameResult;
  newBest: boolean;
}

interface State {
  loaded: boolean;
  decks: Deck[];
  pending: PendingImport | null;
  lastRun: LastRun | null;
  saveFailed: boolean;
}

let state: State = { loaded: false, decks: [], pending: null, lastRun: null, saveFailed: false };
const listeners = new Set<() => void>();

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export function getState(): State {
  return state;
}

let loading: Promise<void> | null = null;

export function loadDecks(): Promise<void> {
  loading ??= (async () => {
    let decks: Deck[] = [];
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(data)) {
        decks = data
          .filter((d): d is Deck => !!d && typeof d === 'object' && Array.isArray((d as Deck).cards))
          .map((d) => ({ ...d, best: d.best ?? 0, settings: { ...defaultSettings(), ...d.settings } }));
      }
    } catch {
      // Corrupt or unavailable storage: start empty.
    }
    set({ loaded: true, decks });
  })();
  return loading;
}

async function persist(decks: Deck[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(decks));
    if (state.saveFailed) set({ saveFailed: false });
  } catch {
    set({ saveFailed: true });
  }
}

function setDecks(decks: Deck[]): void {
  set({ decks });
  void persist(decks);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function addDeck(name: string, cards: Card[]): Deck {
  const deck: Deck = { id: newId(), name, cards, createdAt: Date.now(), best: 0, settings: defaultSettings() };
  setDecks([deck, ...state.decks]);
  return deck;
}

export function updateDeck(id: string, patch: Partial<Deck>): void {
  setDecks(state.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

export function deleteDeck(id: string): void {
  setDecks(state.decks.filter((d) => d.id !== id));
}

export function setPending(pending: PendingImport | null): void {
  set({ pending });
}

/** Records a finished run and updates the deck's best score. */
export function finishRun(run: Omit<LastRun, 'newBest'>): void {
  const deck = state.decks.find((d) => d.id === run.deckId);
  const newBest = !!deck && !run.practice && run.result.score > deck.best;
  if (deck && newBest) updateDeck(deck.id, { best: run.result.score });
  set({ lastRun: { ...run, newBest } });
}
