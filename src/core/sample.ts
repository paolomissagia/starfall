import type { Card } from './parser';

export const SAMPLE_NAME = 'Spanish basics';

const PAIRS: [string, string][] = [
  ['hola', 'hello'],
  ['adiós', 'goodbye'],
  ['gracias', 'thank you'],
  ['por favor', 'please'],
  ['sí', 'yes'],
  ['agua', 'water'],
  ['casa', 'house'],
  ['perro', 'dog'],
  ['gato', 'cat'],
  ['libro', 'book'],
  ['rojo', 'red'],
  ['verde', 'green'],
  ['grande', 'big'],
  ['pequeño', 'small'],
  ['comer', '(to) eat'],
  ['beber', '(to) drink'],
  ['dormir', '(to) sleep'],
  ['mañana', 'tomorrow; morning'],
  ['ayer', 'yesterday'],
  ['siempre', 'always'],
  ['nunca', 'never'],
  ['amigo', 'friend'],
  ['ciudad', 'city'],
  ['estrella', 'star'],
];

export const SAMPLE_CARDS: Card[] = PAIRS.map(([front, back]) => ({ front, back }));
