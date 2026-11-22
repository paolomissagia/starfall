import { isCorrect } from '../core/answer';
import type { Card } from '../core/parser';
import { Picker } from '../core/picker';
import type { AnswerWith } from '../state/types';

/**
 * Platform-independent game rules and simulation. Rendering lives in
 * renderer.ts; this file only moves things around and keeps score.
 *
 * Rocks are positioned by their *bottom* edge and a 0..1 fall `progress`, so
 * resizing the play area (e.g. when the on-screen keyboard opens) keeps every
 * rock at the same relative height and the same remaining fall time.
 */

export interface GameOptions {
  cards: Card[];
  answerWith: AnswerWith;
  startLevel: number;
  lenient: boolean;
}

export interface HudState {
  score: number;
  level: number;
  lives: number;
  maxLives: number;
  streak: number;
  levelProgress: number;
}

export interface MissedCard {
  prompt: string;
  answer: string;
  card: Card;
}

export interface GameResult {
  score: number;
  level: number;
  correct: number;
  attempts: number;
  bestStreak: number;
  durationSec: number;
  missed: MissedCard[];
}

export interface GameEvents {
  hud(state: HudState): void;
  correction(prompt: string, answer: string): void;
  correctionDone(): void;
  levelUp(level: number): void;
  feedback(kind: 'correct' | 'wrong' | 'impact' | 'peek'): void;
  over(result: GameResult): void;
}

type SubmitResult = 'correct' | 'wrong' | 'empty' | 'ignored';
export type State = 'playing' | 'correction' | 'paused' | 'over';

/** Measures the rendered width of a single line of rock text. */
type MeasureText = (text: string) => number;

export interface Face {
  lines: string[];
  w: number;
  h: number;
}

export interface Meteor {
  id: number;
  cardIndex: number;
  prompt: string;
  answer: string;
  promptFace: Face;
  answerFace: Face;
  face: Face;
  x: number;
  progress: number;
  fallTime: number;
  revealLeft: number;
  peeked: boolean;
  seed: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

export interface Floater {
  kind: 'text' | 'ring';
  x: number;
  y: number;
  life: number;
  max: number;
  text?: string;
  color: string;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  depth: number;
  phase: number;
}

export interface Planet {
  cx: number;
  cy: number;
  r: number;
  top: number;
}

const MAX_LIVES = 3;
const PER_LEVEL = 8;
export const REVEAL_SECONDS = 2.5;
export const TEXT_SIZE = 17;
export const LINE_HEIGHT = 22;
const PAD_X = 16;
export const PAD_Y = 11;
/** Where rocks start: their bottom edge this far above the top of the screen. */
const START_BOTTOM = -30;

function fallSeconds(level: number, answerLength: number): number {
  const base = Math.max(4.5, 15 * Math.pow(0.88, level - 1));
  const extra = Math.min(4, Math.max(0, answerLength - 10) * 0.15);
  return base + extra;
}

function maxOnScreen(level: number): number {
  if (level < 3) return 1;
  if (level < 5) return 2;
  if (level < 8) return 3;
  return 4;
}

/** Share of the width rocks may use: wide on phones, narrower on big screens. */
export function laneWidth(width: number): number {
  const share = width < 600 ? 0.86 : 0.6;
  return Math.min(width * share, 720);
}

const NO_EVENTS: GameEvents = {
  hud: () => {},
  correction: () => {},
  correctionDone: () => {},
  levelUp: () => {},
  feedback: () => {},
  over: () => {},
};

export class Engine {
  w = 0;
  h = 0;
  planet: Planet = { cx: 0, cy: 0, r: 0, top: 0 };
  stars: Star[] = [];
  meteors: Meteor[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  scars: { x: number; life: number }[] = [];
  shake = 0;
  flash = 0;
  time = 0;
  state: State = 'playing';

  private stateBeforePause: State = 'playing';
  private level: number;
  private score = 0;
  private lives = MAX_LIVES;
  private streak = 0;
  private bestStreak = 0;
  private correct = 0;
  private attempts = 0;
  private levelCount = 0;
  private spawnTimer = 0.6;
  private elapsed = 0;
  private correctionAnswer = '';
  private missed = new Map<string, MissedCard>();
  private picker: Picker;
  private nextId = 1;

  private events: GameEvents = NO_EVENTS;

  constructor(
    private readonly options: GameOptions,
    private readonly measure: MeasureText,
  ) {
    this.level = Math.max(1, options.startLevel);
    this.picker = new Picker(options.cards.length);
  }

  // ---------------------------------------------------------------- control

  /** Replaces the event handlers (UI layers re-subscribe as their props change). */
  listen(events: GameEvents): void {
    this.events = events;
  }

  get paused(): boolean {
    return this.state === 'paused';
  }

  hud(): HudState {
    return {
      score: this.score,
      level: this.level,
      lives: this.lives,
      maxLives: MAX_LIVES,
      streak: this.streak,
      levelProgress: this.levelCount / PER_LEVEL,
    };
  }

  pause(): void {
    if (this.state === 'playing' || this.state === 'correction') {
      this.stateBeforePause = this.state;
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') this.state = this.stateBeforePause;
  }

  submit(text: string): SubmitResult {
    if (this.state === 'correction') {
      if (!isCorrect(text, this.correctionAnswer, this.options.lenient)) return 'wrong';
      this.events.correctionDone();
      if (this.lives <= 0) this.quit();
      else this.state = 'playing';
      return 'correct';
    }
    if (this.state !== 'playing') return 'ignored';
    if (!text.trim()) return 'empty';

    this.attempts++;
    const target = this.meteors
      .filter((m) => isCorrect(text, m.answer, this.options.lenient))
      .sort((a, b) => this.bottom(b) - this.bottom(a))[0];

    if (target) {
      this.destroyMeteor(target);
      this.events.feedback('correct');
      return 'correct';
    }

    this.streak = 0;
    // With a single rock on screen the miss clearly belongs to it.
    if (this.meteors.length === 1) {
      const only = this.meteors[0];
      this.picker.miss(only.cardIndex);
      this.recordMiss(only);
    }
    this.emitHud();
    this.events.feedback('wrong');
    return 'wrong';
  }

  /**
   * Shows the answer on the rock under (x, y) for a few seconds. A peeked rock
   * still has to be typed, scores half points and goes on the review list.
   */
  peek(x: number, y: number): boolean {
    if (this.state !== 'playing') return false;
    const m = this.meteorAt(x, y);
    if (!m) return false;
    if (m.revealLeft <= 0) this.setFace(m, m.answerFace);
    m.revealLeft = REVEAL_SECONDS;
    if (!m.peeked) {
      m.peeked = true;
      this.picker.miss(m.cardIndex);
      this.recordMiss(m);
    }
    this.events.feedback('peek');
    return true;
  }

  // ---------------------------------------------------------------- geometry

  /**
   * @param floor y of the top of whatever covers the bottom of the screen (the
   *   answer box). The planet's surface is kept above it so rocks never land
   *   out of sight.
   */
  resize(w: number, h: number, floor = h): void {
    if (w <= 0 || h <= 0) return;
    const firstLayout = this.w === 0;
    const sizeChanged = Math.abs(w - this.w) > 0.5;
    this.w = w;
    this.h = h;

    // A wide, gently curved horizon: the arc drops `sag` px from centre to edges.
    const visible = clamp(h * 0.12, 56, 110);
    const top = Math.min(h - visible, floor - 12);
    const sag = Math.min(60, visible * 0.6);
    const half = w / 2 + 40;
    const r = (half * half) / (2 * sag) + sag / 2;
    this.planet = { cx: w / 2, cy: top + r, r, top };

    if (firstLayout || sizeChanged) {
      const count = Math.round((w * h) / 2600);
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        depth: Math.random(),
        phase: Math.random() * Math.PI * 2,
      }));
    }
    if (sizeChanged && !firstLayout) {
      // Re-wrap text for the new lane width and keep rocks inside it.
      for (const m of this.meteors) {
        m.promptFace = this.makeFace(m.prompt);
        m.answerFace = this.makeFace(m.answer);
        m.face = m.revealLeft > 0 ? m.answerFace : m.promptFace;
        const [minX, maxX] = this.xRange(m.face.w);
        m.x = clamp(m.x, minX, maxX);
      }
    }
  }

  surfaceY(x: number): number {
    const { cx, cy, r } = this.planet;
    const dx = Math.min(Math.abs(x - cx), r);
    return cy - Math.sqrt(r * r - dx * dx);
  }

  /** Current bottom edge of a rock, in px. */
  bottom(m: Meteor): number {
    return START_BOTTOM + m.progress * (this.surfaceY(m.x) - START_BOTTOM);
  }

  /** Current fall speed of a rock, in px/s. */
  speed(m: Meteor): number {
    return (this.surfaceY(m.x) - START_BOTTOM) / m.fallTime;
  }

  private lane(): [number, number] {
    const width = laneWidth(this.w);
    return [(this.w - width) / 2, (this.w + width) / 2];
  }

  private xRange(w: number): [number, number] {
    const [left, right] = this.lane();
    const min = left + w / 2;
    const max = right - w / 2;
    return min <= max ? [min, max] : [this.w / 2, this.w / 2];
  }

  private makeFace(text: string): Face {
    const [left, right] = this.lane();
    const maxText = Math.max(80, Math.min(280, right - left - PAD_X * 2));
    const lines = wrapText(this.measure, text, maxText).slice(0, 4);
    const textW = Math.max(...lines.map((l) => this.measure(l)));
    return { lines, w: Math.max(70, textW + PAD_X * 2), h: lines.length * LINE_HEIGHT + PAD_Y * 2 };
  }

  private setFace(m: Meteor, face: Face): void {
    m.face = face;
    const [minX, maxX] = this.xRange(face.w);
    m.x = clamp(m.x, minX, maxX);
  }

  private meteorAt(x: number, y: number): Meteor | undefined {
    // Generous padding: fingers are less precise than mouse pointers.
    const pad = 16;
    return [...this.meteors].reverse().find((m) => {
      const bottom = this.bottom(m);
      return (
        x >= m.x - m.face.w / 2 - pad &&
        x <= m.x + m.face.w / 2 + pad &&
        y >= bottom - m.face.h - pad &&
        y <= bottom + pad
      );
    });
  }

  // ---------------------------------------------------------------- loop

  update(dt: number): void {
    if (this.state === 'paused' || this.state === 'over' || this.w === 0) return;
    this.time += dt;
    // Effects keep animating during correction; rocks and spawning freeze.
    this.updateEffects(dt);
    if (this.state !== 'playing') return;
    this.elapsed += dt;

    const limit = Math.min(maxOnScreen(this.level), this.options.cards.length);
    this.spawnTimer -= dt;
    if (this.meteors.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 0.6);
    if (this.meteors.length < limit && this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(1.4, 3.4 - this.level * 0.2);
    }

    for (const m of this.meteors) {
      m.progress += dt / m.fallTime;
      if (m.revealLeft > 0) {
        m.revealLeft -= dt;
        if (m.revealLeft <= 0) this.setFace(m, m.promptFace);
      }
      this.emitTrail(m, dt);
    }

    const hit = this.meteors.find((m) => m.progress >= 1);
    if (hit) this.impact(hit);
  }

  private updateEffects(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      if (f.kind === 'text') f.y -= 40 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const s of this.scars) s.life -= dt;
    this.scars = this.scars.filter((s) => s.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }

  // ---------------------------------------------------------------- rules

  private spawn(): void {
    const onScreen = new Set(this.meteors.map((m) => m.cardIndex));
    const cardIndex = this.picker.next(onScreen);
    const card = this.options.cards[cardIndex];
    const reverse =
      this.options.answerWith === 'front' || (this.options.answerWith === 'mixed' && Math.random() < 0.5);
    const prompt = reverse ? card.back : card.front;
    const answer = reverse ? card.front : card.back;
    const promptFace = this.makeFace(prompt);
    const w = promptFace.w;

    const [minX, maxX] = this.xRange(w);
    let x = minX + Math.random() * (maxX - minX);
    for (let attempt = 0; attempt < 10; attempt++) {
      const clear = this.meteors.every(
        (m) => Math.abs(m.x - x) > (m.face.w + w) / 2 + 12 || this.bottom(m) > promptFace.h * 3.5,
      );
      if (clear) break;
      x = minX + Math.random() * (maxX - minX);
    }

    this.meteors.push({
      id: this.nextId++,
      cardIndex,
      prompt,
      answer,
      promptFace,
      answerFace: this.makeFace(answer),
      face: promptFace,
      x,
      progress: 0,
      fallTime: fallSeconds(this.level, answer.length),
      revealLeft: 0,
      peeked: false,
      seed: Math.random() * 1000,
    });
  }

  private destroyMeteor(m: Meteor): void {
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.correct++;
    const full = (100 + 150 * (1 - m.progress)) * this.level * (1 + Math.min(this.streak - 1, 10) * 0.1);
    const points = Math.round(m.peeked ? full / 2 : full);
    this.score += points;
    this.picker.hit(m.cardIndex);
    this.meteors = this.meteors.filter((other) => other !== m);

    const bottom = this.bottom(m);
    const cx = m.x;
    const cy = bottom - m.face.h / 2;
    this.burst(cx, cy, 34, ['#ffd27a', '#ff9d4d', '#fff3d6', '#8c7a70'], 380);
    this.floaters.push({ kind: 'ring', x: cx, y: cy, life: 0.5, max: 0.5, color: '#ffd27a' });
    this.floaters.push({
      kind: 'text',
      x: cx,
      y: bottom - m.face.h - 8,
      life: 1,
      max: 1,
      text: `+${points}`,
      color: '#ffe3a3',
    });

    this.levelCount++;
    if (this.levelCount >= PER_LEVEL) {
      this.level++;
      this.levelCount = 0;
      if (this.level % 3 === 0 && this.lives < MAX_LIVES) this.lives++;
      this.events.levelUp(this.level);
    }
    this.emitHud();
  }

  private impact(m: Meteor): void {
    this.meteors = this.meteors.filter((other) => other !== m);
    this.lives--;
    this.streak = 0;
    this.picker.miss(m.cardIndex);
    this.recordMiss(m);

    const y = this.surfaceY(m.x);
    this.burst(m.x, y - 6, 46, ['#ff6b5a', '#ffb36b', '#ffe6c2', '#6d5d55'], 460, -1);
    this.floaters.push({ kind: 'ring', x: m.x, y, life: 0.7, max: 0.7, color: '#ff6b5a' });
    this.scars.push({ x: m.x, life: 6 });
    this.shake = 16;
    this.flash = 1;

    this.state = 'correction';
    this.correctionAnswer = m.answer;
    this.events.feedback('impact');
    this.events.correction(m.prompt, m.answer);
    this.emitHud();
  }

  private recordMiss(m: Meteor): void {
    const key = `${m.prompt}\u0000${m.answer}`;
    if (!this.missed.has(key)) {
      this.missed.set(key, { prompt: m.prompt, answer: m.answer, card: this.options.cards[m.cardIndex] });
    }
  }

  /** Ends the run and reports the result (also used when the last shield is lost). */
  quit(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.events.over({
      score: this.score,
      level: this.level,
      correct: this.correct,
      attempts: this.attempts,
      bestStreak: this.bestStreak,
      durationSec: Math.round(this.elapsed),
      missed: [...this.missed.values()],
    });
  }

  private emitHud(): void {
    this.events.hud(this.hud());
  }

  // ---------------------------------------------------------------- effects

  private burst(x: number, y: number, count: number, colors: string[], speed: number, bias = 0): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.25 + Math.random() * 0.75);
      const max = 0.5 + Math.random() * 0.7;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v + bias * Math.abs(Math.sin(angle)) * v,
        life: max,
        max,
        size: 1.5 + Math.random() * 3.5,
        color: colors[i % colors.length],
        drag: 2.6,
      });
    }
  }

  private emitTrail(m: Meteor, dt: number): void {
    const expected = 32 * dt;
    const n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    const top = this.bottom(m) - m.face.h;
    for (let i = 0; i < n; i++) {
      const max = 0.35 + Math.random() * 0.4;
      this.particles.push({
        x: m.x + (Math.random() - 0.5) * m.face.w * 0.8,
        y: top + 4,
        vx: (Math.random() - 0.5) * 20,
        vy: -30 - Math.random() * 40,
        life: max,
        max,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() < 0.5 ? '#ffb15c' : '#ff7a45',
        drag: 1.5,
      });
    }
  }
}

// ------------------------------------------------------------------ helpers

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapText(measure: MeasureText, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => {
    if (measure(l) <= maxWidth) return l;
    let cut = l;
    while (cut.length > 1 && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}
