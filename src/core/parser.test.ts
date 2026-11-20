import { describe, expect, it } from 'vitest';
import { cleanField, parseDeck } from './parser';

describe('parseDeck', () => {
  it('parses a modern Anki plain-text export with headers', () => {
    const text = [
      '#separator:tab',
      '#html:true',
      '#notetype column:1',
      '#deck column:2',
      '#tags column:5',
      'Basic\tLanguages::Spanish\thola\thello\tgreeting',
      'Basic\tLanguages::Spanish\t"<b>gracias</b>"\tthank&nbsp;you<br>thanks\t',
    ].join('\n');
    const result = parseDeck(text);
    expect(result.deckName).toBe('Spanish');
    expect(result.cards).toEqual([
      { front: 'hola', back: 'hello' },
      { front: 'gracias', back: 'thank you thanks' },
    ]);
  });

  it('auto-detects tab, semicolon and comma separators', () => {
    expect(parseDeck('a\tb\nc\td').cards).toHaveLength(2);
    expect(parseDeck('a;b\nc;d').cards[1]).toEqual({ front: 'c', back: 'd' });
    expect(parseDeck('a,b\nc,d').cards[0]).toEqual({ front: 'a', back: 'b' });
  });

  it('prefers tab over commas inside the text', () => {
    const { cards } = parseDeck('big, large\tgrande\nsmall, little\tpequeño');
    expect(cards[0]).toEqual({ front: 'big, large', back: 'grande' });
  });

  it('handles quoted fields with separators, escaped quotes and newlines', () => {
    const { cards } = parseDeck('"one, two",uno y dos\n"say ""hi""","line 1\nline 2"');
    expect(cards).toEqual([
      { front: 'one, two', back: 'uno y dos' },
      { front: 'say "hi"', back: 'line 1 line 2' },
    ]);
  });

  it('honours a named #separator header', () => {
    const { cards } = parseDeck('#separator:Semicolon\na;b, c');
    expect(cards).toEqual([{ front: 'a', back: 'b, c' }]);
  });

  it('skips rows missing a side and ignores blank lines', () => {
    const result = parseDeck('a\tb\n\n\tonly back\nonly front\n\r\nc\td\r\n');
    expect(result.cards).toHaveLength(2);
    expect(result.skipped).toBe(2);
  });

  it('strips a BOM and Windows line endings', () => {
    expect(parseDeck('﻿a\tb\r\nc\td\r\n').cards).toEqual([
      { front: 'a', back: 'b' },
      { front: 'c', back: 'd' },
    ]);
  });
});

describe('cleanField', () => {
  it('removes media, cloze markup and tags', () => {
    expect(cleanField('[sound:hola.mp3]hola <img src="x.png">')).toBe('hola');
    expect(cleanField('{{c1::Paris::city}} is the capital')).toBe('Paris is the capital');
    expect(cleanField('<div>a</div><div>b</div>')).toBe('a b');
  });

  it('decodes entities', () => {
    expect(cleanField('Tom &amp; Jerry &#233;t&eacute;')).toBe('Tom & Jerry ét&eacute;');
  });

  it('keeps literal angle brackets when html is off', () => {
    expect(cleanField('a <b> c', false)).toBe('a <b> c');
  });
});
