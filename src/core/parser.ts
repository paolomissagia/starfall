export interface Card {
  front: string;
  back: string;
}

export interface ParseResult {
  cards: Card[];
  /** Rows that were dropped because a side was empty. */
  skipped: number;
  /** Deck name found in the file (Anki deck column or #deck header), if any. */
  deckName?: string;
}

const SEPARATOR_NAMES: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  space: ' ',
  colon: ':',
};

const CANDIDATE_SEPARATORS = ['\t', ';', '|', ','];

/**
 * Parses a flashcard file into cards.
 *
 * Supports:
 * - Anki "Notes in Plain Text" exports, including the `#separator:`, `#html:`,
 *   `#deck column:`, `#notetype column:`, `#tags column:` and `#guid column:` headers.
 * - Plain TSV / CSV / semicolon / pipe separated files (separator auto-detected).
 * - Quoted fields (with "" escapes and embedded newlines), as written by Anki and spreadsheets.
 */
export function parseDeck(input: string): ParseResult {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  let separator: string | undefined;
  let html: boolean | undefined;
  let deckColumn: number | undefined;
  let headerDeckName: string | undefined;
  const ignoredColumns = new Set<number>();

  let i = 0;
  while (i < lines.length && lines[i].startsWith('#')) {
    const match = /^#([a-z ]+):(.*)$/i.exec(lines[i]);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const raw = match[2];
      const value = raw.trim();
      const column = Number.parseInt(value, 10) - 1;
      switch (key) {
        case 'separator':
          separator = SEPARATOR_NAMES[value.toLowerCase()] ?? (raw.length > 0 ? raw[0] : undefined);
          break;
        case 'html':
          html = value.toLowerCase() === 'true';
          break;
        case 'deck':
          headerDeckName = value || undefined;
          break;
        case 'deck column':
          if (column >= 0) {
            deckColumn = column;
            ignoredColumns.add(column);
          }
          break;
        case 'notetype column':
        case 'tags column':
        case 'guid column':
          if (column >= 0) ignoredColumns.add(column);
          break;
      }
    }
    i++;
  }

  const body = lines.slice(i).join('\n');
  const sep = separator ?? detectSeparator(body);
  const rows = splitRows(body, sep);

  const cards: Card[] = [];
  let skipped = 0;
  let deckName = headerDeckName;

  for (const row of rows) {
    if (row.every((field) => field.trim() === '')) continue;

    if (deckName === undefined && deckColumn !== undefined && row[deckColumn]) {
      deckName = cleanDeckName(row[deckColumn]);
    }

    const fields = row.filter((_, index) => !ignoredColumns.has(index)).map((f) => cleanField(f, html));
    const front = fields[0] ?? '';
    const back = fields[1] ?? '';
    if (!front || !back) {
      skipped++;
      continue;
    }
    cards.push({ front, back });
  }

  return { cards, skipped, deckName };
}

/** Picks the separator that splits the most lines into 2+ fields. */
export function detectSeparator(body: string): string {
  const sample = body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(0, 30);
  let best = '\t';
  let bestCount = 0;
  for (const candidate of CANDIDATE_SEPARATORS) {
    const count = sample.filter((line) => line.includes(candidate)).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Splits text into rows of fields, honouring double-quoted fields. */
export function splitRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (atFieldStart && ch === '"') {
      quoted = true;
      atFieldStart = false;
      continue;
    }

    if (ch === sep) {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const LOOKS_LIKE_HTML = /<\/?[a-z][^>]*>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i;

/** Turns an Anki field into plain text for display and answer checking. */
export function cleanField(raw: string, html?: boolean): string {
  let s = raw;
  // Media references never make sense in a typing game.
  s = s.replace(/\[sound:[^\]]*\]/gi, ' ');
  // Cloze deletions: {{c1::answer::hint}} -> answer
  s = s.replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '$1');

  if (html !== false && LOOKS_LIKE_HTML.test(s)) {
    s = s
      .replace(/<(br|hr)\s*\/?>/gi, ' ')
      .replace(/<\/(div|p|li|tr|h[1-6])>/gi, ' ')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
  }

  return s.replace(/\s+/g, ' ').trim();
}

function cleanDeckName(raw: string): string {
  // Anki uses "::" for subdecks; the last part is the most specific name.
  const parts = cleanField(raw).split('::');
  return parts[parts.length - 1].trim();
}
