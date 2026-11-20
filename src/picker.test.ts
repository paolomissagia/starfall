import { describe, expect, it } from 'vitest';
import { Picker } from './picker';

describe('Picker', () => {
  it('never picks a card that is on screen', () => {
    const p = new Picker(3);
    for (let i = 0; i < 50; i++) expect(p.next(new Set([0, 1]))).toBe(2);
  });

  it('brings a missed card back after two spawns', () => {
    const p = new Picker(10, () => 0.5);
    const first = p.next(new Set());
    p.miss(first);
    p.next(new Set());
    expect(p.next(new Set())).toBe(first);
  });

  it('avoids immediate repeats when the deck allows it', () => {
    const p = new Picker(4);
    let last = -1;
    for (let i = 0; i < 100; i++) {
      const n = p.next(new Set());
      expect(n).not.toBe(last);
      last = n;
    }
  });

  it('works with a single card', () => {
    const p = new Picker(1);
    expect(p.next(new Set())).toBe(0);
    expect(p.next(new Set())).toBe(0);
  });
});
