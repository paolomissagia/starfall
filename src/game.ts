import { isCorrect } from './answer';
import type { Card } from './parser';
import { Picker } from './picker';
import type { AnswerWith } from './storage';

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
  correction(prompt: string, answer: string, given: string | null): void;
  correctionDone(): void;
  levelUp(level: number): void;
  over(result: GameResult): void;
}

export type SubmitResult = 'correct' | 'wrong' | 'empty' | 'ignored';

type State = 'playing' | 'correction' | 'paused' | 'over';

interface Face {
  lines: string[];
  w: number;
  h: number;
}

interface Meteor {
  cardIndex: number;
  prompt: string;
  answer: string;
  promptFace: Face;
  answerFace: Face;
  /** Seconds left showing the answer after the player clicked the rock. */
  revealLeft: number;
  peeked: boolean;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  startY: number;
  seed: number;
  age: number;
}

interface Particle {
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

interface Floater {
  kind: 'text' | 'ring';
  x: number;
  y: number;
  life: number;
  max: number;
  text?: string;
  color: string;
}

interface Star {
  x: number;
  y: number;
  r: number;
  depth: number;
  phase: number;
}

const MAX_LIVES = 3;
const PER_LEVEL = 8;
const FONT = '600 17px "Space Grotesk", system-ui, sans-serif';
const LINE_HEIGHT = 22;
const PAD_X = 16;
const PAD_Y = 11;
const REVEAL_SECONDS = 2.5;
/** Rocks fall inside a centred lane: this share of the screen width, capped in px. */
const LANE_SHARE = 0.6;
const LANE_MAX = 720;

export function fallSeconds(level: number, answerLength: number): number {
  const base = Math.max(4.5, 15 * Math.pow(0.88, level - 1));
  const extra = Math.min(4, Math.max(0, answerLength - 10) * 0.15);
  return base + extra;
}

export function maxOnScreen(level: number): number {
  if (level < 3) return 1;
  if (level < 5) return 2;
  if (level < 8) return 3;
  return 4;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private planet = { cx: 0, cy: 0, r: 0, top: 0 };
  private stars: Star[] = [];
  private bg: CanvasGradient | null = null;

  private state: State = 'playing';
  private stateBeforePause: State = 'playing';
  private meteors: Meteor[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private scars: { x: number; life: number }[] = [];

  private level: number;
  private score = 0;
  private lives = MAX_LIVES;
  private streak = 0;
  private bestStreak = 0;
  private correct = 0;
  private attempts = 0;
  private levelCount = 0;
  private spawnTimer = 0.6;
  private shake = 0;
  private flash = 0;
  private time = 0;
  private elapsed = 0;
  private correctionAnswer = '';
  private missed = new Map<string, MissedCard>();
  private picker: Picker;

  private raf = 0;
  private lastTs = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: GameOptions,
    private readonly events: GameEvents,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.level = Math.max(1, options.startLevel);
    this.picker = new Picker(options.cards.length);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    this.emitHud();
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  get paused(): boolean {
    return this.state === 'paused';
  }

  get inCorrection(): boolean {
    return this.state === 'correction';
  }

  pause(): void {
    if (this.state === 'playing' || this.state === 'correction') {
      this.stateBeforePause = this.state;
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = this.stateBeforePause;
      this.lastTs = performance.now();
    }
  }

  /** Ends the run early (player quit). */
  quit(): void {
    this.finish();
  }

  submit(text: string): SubmitResult {
    if (this.state === 'correction') {
      if (!isCorrect(text, this.correctionAnswer, this.options.lenient)) return 'wrong';
      this.events.correctionDone();
      if (this.lives <= 0) this.finish();
      else this.state = 'playing';
      return 'correct';
    }
    if (this.state !== 'playing') return 'ignored';
    if (!text.trim()) return 'empty';

    this.attempts++;
    const target = this.meteors
      .filter((m) => isCorrect(text, m.answer, this.options.lenient))
      .sort((a, b) => b.y + b.h - (a.y + a.h))[0];

    if (target) {
      this.destroyMeteor(target);
      return 'correct';
    }

    this.streak = 0;
    // With a single meteor on screen the miss clearly belongs to it.
    if (this.meteors.length === 1) {
      const only = this.meteors[0];
      this.picker.miss(only.cardIndex);
      this.recordMiss(only);
    }
    this.emitHud();
    return 'wrong';
  }

  // ---------------------------------------------------------------- loop

  private frame = (ts: number): void => {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.state !== 'paused') {
      this.time += dt;
      this.update(dt);
    }
    this.render();
    if (this.state !== 'over') this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    // Effects keep animating during correction; meteors and spawning freeze.
    this.updateEffects(dt);
    if (this.state !== 'playing') return;
    this.elapsed += dt;

    const limit = Math.min(maxOnScreen(this.level), this.options.cards.length);
    this.spawnTimer -= dt;
    // Never leave the sky empty for long.
    if (this.meteors.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 0.6);
    if (this.meteors.length < limit && this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(1.4, 3.4 - this.level * 0.2);
    }

    for (const m of this.meteors) {
      m.age += dt;
      m.y += m.speed * dt;
      if (m.revealLeft > 0) {
        m.revealLeft -= dt;
        if (m.revealLeft <= 0) this.setFace(m, m.promptFace);
      }
      this.emitTrail(m, dt);
    }

    const hit = this.meteors.find((m) => m.y + m.h >= this.surfaceY(m.x));
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
    const answerFace = this.makeFace(answer);
    const { w, h } = promptFace;

    const [minX, maxX] = this.xRange(w);
    let x = minX + Math.random() * (maxX - minX);
    for (let attempt = 0; attempt < 10; attempt++) {
      const clear = this.meteors.every((m) => Math.abs(m.x - x) > (m.w + w) / 2 + 12 || m.y > h * 2.5);
      if (clear) break;
      x = minX + Math.random() * (maxX - minX);
    }

    const startY = -h - 30;
    const distance = this.surfaceY(x) - h - startY;
    this.meteors.push({
      cardIndex,
      prompt,
      answer,
      promptFace,
      answerFace,
      revealLeft: 0,
      peeked: false,
      lines: promptFace.lines,
      x,
      y: startY,
      w,
      h,
      startY,
      speed: distance / fallSeconds(this.level, answer.length),
      seed: Math.random() * 1000,
      age: 0,
    });
  }

  /** Horizontal lane the rocks fall in, centred and away from the edges. */
  private lane(): [number, number] {
    const width = Math.min(this.w * LANE_SHARE, LANE_MAX);
    return [(this.w - width) / 2, (this.w + width) / 2];
  }

  /** Allowed centre positions for a rock of width `w`. */
  private xRange(w: number): [number, number] {
    const [left, right] = this.lane();
    const min = left + w / 2;
    const max = right - w / 2;
    // A rock wider than the lane is simply centred.
    return min <= max ? [min, max] : [this.w / 2, this.w / 2];
  }

  private makeFace(text: string): Face {
    this.ctx.font = FONT;
    const [left, right] = this.lane();
    const maxText = Math.max(80, Math.min(280, right - left - PAD_X * 2));
    const lines = wrapText(this.ctx, text, maxText).slice(0, 4);
    const textW = Math.max(...lines.map((l) => this.ctx.measureText(l).width));
    return { lines, w: Math.max(70, textW + PAD_X * 2), h: lines.length * LINE_HEIGHT + PAD_Y * 2 };
  }

  /** Swaps what a rock shows, keeping its bottom edge (and distance to the ground) in place. */
  private setFace(m: Meteor, face: Face): void {
    const bottom = m.y + m.h;
    m.lines = face.lines;
    m.w = face.w;
    m.h = face.h;
    m.y = bottom - face.h;
    const [minX, maxX] = this.xRange(m.w);
    m.x = clamp(m.x, minX, maxX);
  }

  private meteorAt(x: number, y: number): Meteor | undefined {
    const pad = 10;
    // Topmost drawn (last) first.
    return [...this.meteors]
      .reverse()
      .find((m) => x >= m.x - m.w / 2 - pad && x <= m.x + m.w / 2 + pad && y >= m.y - pad && y <= m.y + m.h + pad);
  }

  /** True when (x, y) in canvas CSS pixels is over a rock that can be clicked. */
  isOverMeteor(x: number, y: number): boolean {
    return this.state === 'playing' && !!this.meteorAt(x, y);
  }

  /**
   * Shows the answer on the clicked rock for a few seconds. A peeked rock
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
    return true;
  }

  private destroyMeteor(m: Meteor): void {
    const ground = this.surfaceY(m.x) - m.h;
    const progress = clamp((m.y - m.startY) / (ground - m.startY), 0, 1);
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.correct++;
    const full = (100 + 150 * (1 - progress)) * this.level * (1 + Math.min(this.streak - 1, 10) * 0.1);
    const points = Math.round(m.peeked ? full / 2 : full);
    this.score += points;
    this.picker.hit(m.cardIndex);
    this.meteors = this.meteors.filter((other) => other !== m);

    const cx = m.x;
    const cy = m.y + m.h / 2;
    this.burst(cx, cy, 34, ['#ffd27a', '#ff9d4d', '#fff3d6', '#8c7a70'], 380);
    this.floaters.push({ kind: 'ring', x: cx, y: cy, life: 0.5, max: 0.5, color: '#ffd27a' });
    this.floaters.push({ kind: 'text', x: cx, y: cy - m.h / 2 - 8, life: 1, max: 1, text: `+${points}`, color: '#ffe3a3' });

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
    this.events.correction(m.prompt, m.answer, null);
    this.emitHud();
  }

  private recordMiss(m: Meteor): void {
    const key = `${m.prompt}\u0000${m.answer}`;
    if (!this.missed.has(key)) {
      this.missed.set(key, { prompt: m.prompt, answer: m.answer, card: this.options.cards[m.cardIndex] });
    }
  }

  private finish(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.render();
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
    this.events.hud({
      score: this.score,
      level: this.level,
      lives: this.lives,
      maxLives: MAX_LIVES,
      streak: this.streak,
      levelProgress: this.levelCount / PER_LEVEL,
    });
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
    const rate = 40;
    const n = Math.random() < (rate * dt) % 1 ? Math.ceil(rate * dt) : Math.floor(rate * dt);
    for (let i = 0; i < n; i++) {
      const max = 0.35 + Math.random() * 0.4;
      this.particles.push({
        x: m.x + (Math.random() - 0.5) * m.w * 0.8,
        y: m.y + 4,
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

  // ---------------------------------------------------------------- geometry

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // A wide, gently curved horizon: the arc drops `sag` px from centre to edges.
    const visible = clamp(this.h * 0.12, 60, 110);
    const sag = Math.min(60, visible * 0.6);
    const half = this.w / 2 + 40;
    const r = (half * half) / (2 * sag) + sag / 2;
    this.planet = { cx: this.w / 2, cy: this.h - visible + r, r, top: this.h - visible };

    this.bg = this.ctx.createLinearGradient(0, 0, 0, this.h);
    this.bg.addColorStop(0, '#05060f');
    this.bg.addColorStop(0.55, '#0d0f2b');
    this.bg.addColorStop(1, '#241a45');

    const count = Math.round((this.w * this.h) / 2600);
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: Math.random() * 1.3 + 0.3,
      depth: Math.random(),
      phase: Math.random() * Math.PI * 2,
    }));

    // Keep meteors inside the new width.
    for (const m of this.meteors) {
      const [minX, maxX] = this.xRange(m.w);
      m.x = clamp(m.x, minX, maxX);
    }
    this.render();
  }

  private surfaceY(x: number): number {
    const { cx, cy, r } = this.planet;
    const dx = Math.min(Math.abs(x - cx), r);
    return cy - Math.sqrt(r * r - dx * dx);
  }

  // ---------------------------------------------------------------- drawing

  private render(): void {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    ctx.save();
    ctx.fillStyle = this.bg ?? '#05060f';
    ctx.fillRect(0, 0, w, h);

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawStars();
    this.drawPlanet();
    this.drawParticles();
    for (const m of this.meteors) this.drawMeteor(m);
    this.drawFloaters();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 70, 60, ${this.flash * 0.28})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStars(): void {
    const { ctx } = this;
    for (const s of this.stars) {
      const drift = (this.time * (4 + s.depth * 10)) % this.h;
      const y = (s.y + drift) % this.h;
      const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * (0.8 + s.depth * 2) + s.phase)) * (0.4 + s.depth * 0.6);
      ctx.fillStyle = `rgba(220, 228, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlanet(): void {
    const { ctx } = this;
    const { cx, cy, r, top } = this.planet;

    // Atmosphere glow.
    const glow = ctx.createRadialGradient(cx, cy, r - 10, cx, cy, r + 70);
    glow.addColorStop(0, 'rgba(90, 220, 255, 0.45)');
    glow.addColorStop(0.25, 'rgba(90, 160, 255, 0.18)');
    glow.addColorStop(1, 'rgba(90, 160, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 70, 0, Math.PI * 2);
    ctx.fill();

    const surface = ctx.createLinearGradient(0, top, 0, this.h);
    surface.addColorStop(0, '#2fb3a3');
    surface.addColorStop(0.35, '#1d6f7a');
    surface.addColorStop(1, '#123049');
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Subtle continents.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(160, 230, 170, 0.16)';
    for (let i = 0; i < 7; i++) {
      const x = ((i * 197 + 60) % (this.w + 200)) - 100;
      const y = this.surfaceY(x) + 18 + (i % 3) * 14;
      ctx.beginPath();
      ctx.ellipse(x, y, 60 + (i % 4) * 25, 10 + (i % 2) * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Impact scars.
    for (const s of this.scars) {
      const y = this.surfaceY(s.x);
      const a = Math.min(1, s.life / 2);
      const g = ctx.createRadialGradient(s.x, y + 4, 0, s.x, y + 4, 46);
      g.addColorStop(0, `rgba(255, 140, 80, ${0.85 * a})`);
      g.addColorStop(0.4, `rgba(140, 50, 40, ${0.6 * a})`);
      g.addColorStop(1, 'rgba(60, 20, 20, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(s.x, y + 4, 46, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Bright rim.
    ctx.strokeStyle = 'rgba(170, 245, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawParticles(): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMeteor(m: Meteor): void {
    const { ctx } = this;
    const ground = this.surfaceY(m.x) - m.h;
    const danger = clamp((m.y - m.startY) / (ground - m.startY), 0, 1);
    const left = m.x - m.w / 2;
    const radius = Math.min(16, m.h / 2);

    // Flame cone behind the rock.
    const len = 50 + m.speed * 0.35;
    const flame = ctx.createLinearGradient(0, m.y - len, 0, m.y + m.h * 0.5);
    flame.addColorStop(0, 'rgba(255, 120, 60, 0)');
    flame.addColorStop(1, `rgba(255, ${Math.round(170 - danger * 70)}, 80, 0.55)`);
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(left + 4, m.y + m.h * 0.5);
    ctx.quadraticCurveTo(m.x - m.w * 0.25, m.y - len * 0.4, m.x, m.y - len);
    ctx.quadraticCurveTo(m.x + m.w * 0.25, m.y - len * 0.4, left + m.w - 4, m.y + m.h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Rock body.
    ctx.save();
    const revealed = m.revealLeft > 0;
    const rim = revealed ? [79, 214, 196] : mixColor([255, 178, 92], [255, 72, 60], danger);
    ctx.shadowColor = `rgba(${rim[0]}, ${rim[1]}, ${rim[2]}, ${0.55 + danger * 0.35})`;
    ctx.shadowBlur = 16 + danger * 18;
    const body = ctx.createLinearGradient(0, m.y, 0, m.y + m.h);
    body.addColorStop(0, '#776459');
    body.addColorStop(1, '#3b2f2b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(left, m.y, m.w, m.h, radius);
    ctx.fill();
    ctx.restore();

    // Craters.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left, m.y, m.w, m.h, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(25, 18, 16, 0.35)';
    const rand = seeded(m.seed);
    const craters = 3 + Math.floor(m.w / 60);
    for (let i = 0; i < craters; i++) {
      ctx.beginPath();
      ctx.ellipse(left + rand() * m.w, m.y + rand() * m.h, 4 + rand() * 9, 3 + rand() * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = `rgba(${rim[0]}, ${rim[1]}, ${rim[2]}, 0.9)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left + 0.75, m.y + 0.75, m.w - 1.5, m.h - 1.5, radius);
    ctx.stroke();

    if (revealed) {
      // Time left on the peek, as a shrinking bar along the bottom edge.
      const t = clamp(m.revealLeft / REVEAL_SECONDS, 0, 1);
      ctx.fillStyle = 'rgba(79, 214, 196, 0.85)';
      ctx.fillRect(left + radius, m.y + m.h - 4, (m.w - radius * 2) * t, 2);
      ctx.font = '600 11px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#9ff0e4';
      ctx.fillText('ANSWER', m.x, m.y - 4);
    }

    // Prompt (or revealed answer) text.
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = revealed ? '#d9fff8' : '#fff8ef';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    m.lines.forEach((line, i) => {
      ctx.fillText(line, m.x, m.y + PAD_Y + LINE_HEIGHT * (i + 0.5));
    });
    ctx.shadowBlur = 0;
  }

  private drawFloaters(): void {
    const { ctx } = this;
    for (const f of this.floaters) {
      const t = f.life / f.max;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (f.kind === 'ring') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * t;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 10 + (1 - t) * 70, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.text) {
        ctx.font = '700 18px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ helpers

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mixColor(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function seeded(seed: number): () => number {
  let s = Math.floor(seed * 9301) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  // Truncate single words that are still too wide.
  return lines.map((l) => {
    if (ctx.measureText(l).width <= maxWidth) return l;
    let cut = l;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}
