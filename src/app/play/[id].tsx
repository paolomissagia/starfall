import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import type { Card } from '../../core/parser';
import Game from '../../game/Game';
import type { GameResult } from '../../game/engine';
import { finishRun, getState, useStore } from '../../state/store';

/**
 * /play/:id            full deck
 * /play/:id?mode=missed  only the cards missed in the last run
 * /play/:id?mode=repeat  the same cards as the last run (replaying a practice run)
 */
export default function Play() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const deck = useStore((s) => s.decks.find((d) => d.id === id));

  // Decide the card set once per visit; later store updates (e.g. a new best) mustn't restart the run.
  const run = useMemo(() => {
    if (!deck) return null;
    const last = getState().lastRun;
    if (mode === 'missed' && last?.deckId === deck.id && last.result.missed.length) {
      return { cards: unique(last.result.missed.map((m) => m.card)), practice: true };
    }
    if (mode === 'repeat' && last?.deckId === deck.id) {
      return { cards: last.cards, practice: last.practice };
    }
    return { cards: deck.cards, practice: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id, mode]);

  if (!deck || !run) return <Redirect href="/" />;

  const onOver = (result: GameResult) => {
    finishRun({ deckId: deck.id, practice: run.practice, cards: run.cards, result });
    router.replace('/results');
  };

  return <Game cards={run.cards} settings={deck.settings} onOver={onOver} />;
}

function unique(cards: Card[]): Card[] {
  return [...new Set(cards)];
}
