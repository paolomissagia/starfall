import { describe, expect, it } from 'vitest';
import { isCorrect, withinOneEdit } from './answer';

describe('isCorrect (lenient)', () => {
  const ok = (input: string, answer: string) => isCorrect(input, answer, true);

  it('ignores case, accents, punctuation and spacing', () => {
    expect(ok('  Adios ', 'adiós')).toBe(true);
    expect(ok('thank you!', 'Thank you')).toBe(true);
    expect(ok('pequeno', 'pequeño')).toBe(true);
  });

  it('accepts alternatives and optional parentheses', () => {
    expect(ok('morning', 'tomorrow; morning')).toBe(true);
    expect(ok('tomorrow', 'tomorrow; morning')).toBe(true);
    expect(ok('big', 'big, large')).toBe(true);
    expect(ok('eat', '(to) eat')).toBe(true);
    expect(ok('to eat', '(to) eat')).toBe(true);
  });

  it('forgives one typo only on longer answers', () => {
    expect(ok('estrela', 'estrella')).toBe(true);
    expect(ok('gat', 'gato')).toBe(false);
    expect(ok('estrrela', 'estrella')).toBe(false);
  });

  it('rejects empty and wrong answers', () => {
    expect(ok('', 'hola')).toBe(false);
    expect(ok('   ', 'hola')).toBe(false);
    expect(ok('adios', 'hola')).toBe(false);
  });

  it('handles symbol-only answers', () => {
    expect(ok('+', '+')).toBe(true);
    expect(ok('-', '+')).toBe(false);
  });
});

describe('isCorrect (strict)', () => {
  it('requires exact text apart from whitespace', () => {
    expect(isCorrect(' adiós ', 'adiós', false)).toBe(true);
    expect(isCorrect('adios', 'adiós', false)).toBe(false);
    expect(isCorrect('Adiós', 'adiós', false)).toBe(false);
  });
});

describe('withinOneEdit', () => {
  it('detects single edits', () => {
    expect(withinOneEdit('abc', 'abc')).toBe(true);
    expect(withinOneEdit('abc', 'abd')).toBe(true);
    expect(withinOneEdit('abc', 'ab')).toBe(true);
    expect(withinOneEdit('abc', 'xabc')).toBe(true);
    expect(withinOneEdit('abc', 'acb')).toBe(false);
    expect(withinOneEdit('abc', 'a')).toBe(false);
  });
});
