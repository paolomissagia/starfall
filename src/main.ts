import './style.css';
import { Game, type GameResult, type HudState } from './game';
import { parseDeck, type Card } from './parser';
import { SAMPLE_CARDS, SAMPLE_NAME } from './sample';
import { defaultSettings, loadDecks, newId, saveDecks, type AnswerWith, type Deck } from './storage';

// ------------------------------------------------------------------ DOM

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const screens = ['home', 'import', 'setup', 'game', 'results'] as const;
type Screen = (typeof screens)[number];

function show(screen: Screen): void {
  for (const s of screens) $(`screen-${s}`).classList.toggle('active', s === screen);
}

let toastTimer = 0;
function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

// ------------------------------------------------------------------ state

let decks: Deck[] = loadDecks();
let currentDeck: Deck | null = null;
let pending: { name: string; cards: Card[]; skipped: number } | null = null;
let game: Game | null = null;
let lastRun: { cards: Card[]; practice: boolean } | null = null;
let lastResult: GameResult | null = null;

function persist(): void {
  if (!saveDecks(decks)) toast('Your browser blocked saving, so decks will be lost when you close the tab.');
}

// ------------------------------------------------------------------ home

function renderDecks(): void {
  const list = $('deck-list');
  $('deck-empty').hidden = decks.length > 0;
  list.innerHTML = decks
    .map(
      (d) => `
      <li class="deck">
        <button class="deck-main" data-play="${d.id}" type="button">
          <span class="deck-name">${escapeHtml(d.name)}</span>
          <span class="deck-meta">${d.cards.length} cards${d.best ? ` · best ${d.best.toLocaleString()}` : ''}</span>
        </button>
        <button class="icon-btn subtle" data-delete="${d.id}" type="button" aria-label="Delete ${escapeHtml(d.name)}">✕</button>
      </li>`,
    )
    .join('');
}

$('deck-list').addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-play],[data-delete]');
  if (!target) return;
  if (target.dataset.play) {
    const deck = decks.find((d) => d.id === target.dataset.play);
    if (deck) openSetup(deck);
  } else if (target.dataset.delete) {
    const deck = decks.find((d) => d.id === target.dataset.delete);
    if (deck && confirm(`Delete “${deck.name}”? This can't be undone.`)) {
      decks = decks.filter((d) => d !== deck);
      persist();
      renderDecks();
    }
  }
});

// ------------------------------------------------------------------ import

async function importFile(file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) {
    toast('That file is larger than 10 MB. Is it really a text export?');
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    toast('Could not read that file.');
    return;
  }
  const fallbackName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported deck';
  importText(text, fallbackName);
}

function importText(text: string, fallbackName: string): void {
  const result = parseDeck(text);
  if (result.cards.length === 0) {
    toast(
      result.skipped > 0
        ? 'No cards found: every row was missing a front or a back.'
        : 'No cards found. Each line needs a term and a definition separated by a tab, comma or semicolon.',
    );
    return;
  }
  pending = { name: result.deckName || fallbackName, cards: result.cards, skipped: result.skipped };
  $<HTMLInputElement>('import-name').value = pending.name;
  renderPreview();
  show('import');
}

function renderPreview(): void {
  if (!pending) return;
  const { cards, skipped } = pending;
  $('import-summary').textContent =
    `${cards.length} card${cards.length === 1 ? '' : 's'} found` +
    (skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} skipped because a side was empty` : '') +
    (cards.length > 8 ? ' · showing the first 8' : '');
  $('import-preview').innerHTML = cards
    .slice(0, 8)
    .map((c) => `<tr><td>${escapeHtml(c.front)}</td><td>${escapeHtml(c.back)}</td></tr>`)
    .join('');
}

const fileInput = $<HTMLInputElement>('file-input');
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void importFile(file);
  fileInput.value = '';
});

const dropzone = $('dropzone');
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
for (const type of ['dragenter', 'dragover'] as const) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop'] as const) {
  dropzone.addEventListener(type, () => dropzone.classList.remove('dragging'));
}
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) void importFile(file);
});
// Dropping a file anywhere else shouldn't navigate away from the app.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

$('paste-import').addEventListener('click', () => {
  const text = $<HTMLTextAreaElement>('paste-input').value;
  if (!text.trim()) {
    toast('Paste some cards first.');
    return;
  }
  importText(text, 'Pasted deck');
});

$('sample-btn').addEventListener('click', () => {
  pending = { name: SAMPLE_NAME, cards: SAMPLE_CARDS.map((c) => ({ ...c })), skipped: 0 };
  $<HTMLInputElement>('import-name').value = pending.name;
  renderPreview();
  show('import');
});

$('import-swap').addEventListener('click', () => {
  if (!pending) return;
  pending.cards = pending.cards.map((c) => ({ front: c.back, back: c.front }));
  renderPreview();
});

$('import-cancel').addEventListener('click', () => {
  pending = null;
  show('home');
});

$('import-save').addEventListener('click', () => {
  if (!pending) return;
  const name = $<HTMLInputElement>('import-name').value.trim() || pending.name;
  const deck: Deck = {
    id: newId(),
    name,
    cards: pending.cards,
    createdAt: Date.now(),
    best: 0,
    settings: defaultSettings(),
  };
  decks = [deck, ...decks];
  persist();
  pending = null;
  $<HTMLTextAreaElement>('paste-input').value = '';
  renderDecks();
  openSetup(deck);
});

// ------------------------------------------------------------------ setup

function openSetup(deck: Deck): void {
  currentDeck = deck;
  $('setup-title').textContent = deck.name;
  $('setup-meta').textContent = `${deck.cards.length} cards` + (deck.best ? ` · best score ${deck.best.toLocaleString()}` : '');
  const s = deck.settings;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="answer"]')) {
    input.checked = input.value === s.answerWith;
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="level"]')) {
    input.checked = Number(input.value) === s.startLevel;
  }
  $<HTMLInputElement>('opt-lenient').checked = s.lenient;
  show('setup');
  $('setup-start').focus();
}

function readSettings(): void {
  if (!currentDeck) return;
  const answer = document.querySelector<HTMLInputElement>('input[name="answer"]:checked');
  const level = document.querySelector<HTMLInputElement>('input[name="level"]:checked');
  currentDeck.settings = {
    answerWith: (answer?.value as AnswerWith) ?? 'back',
    startLevel: Number(level?.value ?? 1),
    lenient: $<HTMLInputElement>('opt-lenient').checked,
  };
  persist();
}

$('setup-back').addEventListener('click', () => {
  readSettings();
  renderDecks();
  show('home');
});

$('setup-start').addEventListener('click', () => {
  if (!currentDeck) return;
  readSettings();
  startGame(currentDeck.cards, false);
});

// ------------------------------------------------------------------ game

const answerInput = $<HTMLInputElement>('answer-input');
const answerForm = $<HTMLFormElement>('answer-form');

function startGame(cards: Card[], practice: boolean): void {
  if (!currentDeck) return;
  game?.destroy();
  lastRun = { cards, practice };
  show('game');
  $('correction').hidden = true;
  $('pause').hidden = true;
  answerInput.value = '';
  answerForm.classList.remove('correcting');

  const s = currentDeck.settings;
  game = new Game($<HTMLCanvasElement>('game-canvas'), { cards, answerWith: s.answerWith, startLevel: s.startLevel, lenient: s.lenient }, {
    hud: renderHud,
    correction(prompt, answer) {
      $('correction-prompt').textContent = prompt;
      $('correction-answer').textContent = answer;
      $('correction').hidden = false;
      answerForm.classList.add('correcting');
      answerInput.placeholder = 'Type the correct answer to continue';
      answerInput.value = '';
      answerInput.focus();
    },
    correctionDone() {
      $('correction').hidden = true;
      answerForm.classList.remove('correcting');
      answerInput.placeholder = 'Type the answer and press Enter';
    },
    levelUp(level) {
      const el = $('levelup');
      el.textContent = `Level ${level}`;
      el.classList.remove('show');
      void el.offsetWidth; // restart the animation
      el.classList.add('show');
    },
    over: endGame,
  });
  game.start();
  answerInput.focus();
}

function renderHud(s: HudState): void {
  $('hud-score').textContent = s.score.toLocaleString();
  $('hud-level').textContent = String(s.level);
  $('hud-streak').textContent = s.streak > 1 ? `×${s.streak}` : String(s.streak);
  $('hud-level-bar').style.width = `${Math.round(s.levelProgress * 100)}%`;
  $('hud-lives').innerHTML = Array.from(
    { length: s.maxLives },
    (_, i) => `<span class="shield${i < s.lives ? '' : ' lost'}"></span>`,
  ).join('');
}

answerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!game) return;
  const result = game.submit(answerInput.value);
  if (result === 'correct') {
    answerInput.value = '';
  } else if (result === 'wrong') {
    answerInput.select();
    answerForm.classList.remove('wrong');
    void answerForm.offsetWidth;
    answerForm.classList.add('wrong');
  }
});

function togglePause(): void {
  if (!game) return;
  if (game.paused) {
    game.resume();
    $('pause').hidden = true;
    answerInput.focus();
  } else {
    game.pause();
    $('pause').hidden = false;
    $('resume-btn').focus();
  }
}

$('pause-btn').addEventListener('click', togglePause);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', () => {
  $('pause').hidden = true;
  game?.quit();
});

document.addEventListener('keydown', (e) => {
  if ($('screen-game').classList.contains('active') && e.key === 'Escape') {
    e.preventDefault();
    togglePause();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && $('screen-game').classList.contains('active')) togglePause();
});

// Click (or tap) a falling rock to peek at its answer.
const canvas = $<HTMLCanvasElement>('game-canvas');
canvas.addEventListener('pointerdown', (e) => {
  if (!game) return;
  // Stop the click from moving focus away from the answer box.
  e.preventDefault();
  game.peek(e.offsetX, e.offsetY);
  answerInput.focus();
});
canvas.addEventListener('pointermove', (e) => {
  canvas.style.cursor = game?.isOverMeteor(e.offsetX, e.offsetY) ? 'pointer' : '';
});

// Keep focus on the answer box so the player never has to click.
$('screen-game').addEventListener('pointerup', (e) => {
  if (game && !game.paused && !(e.target as HTMLElement).closest('button')) answerInput.focus();
});

// ------------------------------------------------------------------ results

function endGame(result: GameResult): void {
  lastResult = result;
  answerInput.blur();
  let newBest = false;
  if (currentDeck && lastRun && !lastRun.practice && result.score > currentDeck.best) {
    currentDeck.best = result.score;
    newBest = result.score > 0;
    persist();
  }

  $('result-score').textContent = result.score.toLocaleString();
  $('result-best').textContent = lastRun?.practice
    ? 'Practice run'
    : newBest
      ? '★ New best score!'
      : currentDeck?.best
        ? `Best: ${currentDeck.best.toLocaleString()}`
        : '';
  $('result-level').textContent = String(result.level);
  $('result-accuracy').textContent = result.attempts ? `${Math.round((result.correct / result.attempts) * 100)}%` : '—';
  $('result-streak').textContent = String(result.bestStreak);
  const mins = Math.floor(result.durationSec / 60);
  $('result-time').textContent = `${mins}:${String(result.durationSec % 60).padStart(2, '0')}`;

  const missed = result.missed;
  $('result-missed-wrap').hidden = missed.length === 0;
  $('result-missed').innerHTML = missed
    .map((m) => `<li><span>${escapeHtml(m.prompt)}</span><span class="arrow">→</span><b>${escapeHtml(m.answer)}</b></li>`)
    .join('');
  const practice = $<HTMLButtonElement>('result-practice');
  practice.hidden = missed.length === 0;
  practice.textContent = `Practice missed (${missed.length})`;

  setTimeout(() => {
    game?.destroy();
    game = null;
    show('results');
    $('result-again').focus();
  }, 450);
}

$('result-again').addEventListener('click', () => {
  if (lastRun) startGame(lastRun.cards, lastRun.practice);
});

$('result-practice').addEventListener('click', () => {
  if (lastResult?.missed.length) startGame([...new Set(lastResult.missed.map((m) => m.card))], true);
});

$('result-decks').addEventListener('click', () => {
  renderDecks();
  show('home');
});

// ------------------------------------------------------------------ boot

renderDecks();
