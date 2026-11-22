/**
 * Answer checking.
 *
 * Strict mode only ignores surrounding/duplicate whitespace.
 * Lenient mode also ignores case, accents and punctuation, accepts any
 * alternative (split on ";", ",", " / "), accepts the answer without
 * parenthesised parts ("(to) run" -> "run"), and forgives one typo in
 * answers of 6+ characters.
 */

function normalize(s: string, lenient: boolean): string {
  let t = s.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!lenient) return t;
  t = t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const stripped = t.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  // Answers made only of symbols (e.g. "+", "?") keep their symbols.
  return stripped || t;
}

function acceptedAnswers(answer: string, lenient: boolean): string[] {
  const out = new Set<string>([answer]);
  if (lenient) {
    for (const part of answer.split(/\s*;\s*|\s*,\s*|\s+\/\s+/)) {
      if (part) out.add(part);
    }
    for (const a of [...out]) {
      const withoutParens = a.replace(/\([^)]*\)/g, ' ').trim();
      if (withoutParens) out.add(withoutParens);
      const parensKept = a.replace(/[()]/g, '');
      if (parensKept) out.add(parensKept);
    }
  }
  return [...out];
}

export function isCorrect(input: string, answer: string, lenient: boolean): boolean {
  const given = normalize(input, lenient);
  if (!given) return false;
  return acceptedAnswers(answer, lenient).some((candidate) => {
    const expected = normalize(candidate, lenient);
    if (!expected) return false;
    if (expected === given) return true;
    return lenient && expected.length >= 6 && withinOneEdit(expected, given);
  });
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
