import type { Card } from '../core/parser';
import type { DeckSettings } from '../state/types';
import type { GameResult } from './engine';

export interface GameProps {
  cards: Card[];
  settings: DeckSettings;
  onOver: (result: GameResult) => void;
}
