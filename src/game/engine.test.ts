import { describe, expect, it, vi } from 'vitest';

import { Engine, laneWidth, type GameEvents } from './engine';

const cards = [
  { front: 'hola', back: 'hello' },
  { front: 'gato', back: 'cat' },
  { front: 'perro', back: 'dog' },
];

function setup() {
  const events: GameEvents = {
    hud: vi.fn(),
    correction: vi.fn(),
    correctionDone: vi.fn(),
    levelUp: vi.fn(),
    feedback: vi.fn(),
    over: vi.fn(),
  };
  // 9px per character is close enough to the real font for layout tests.
  const engine = new Engine({ cards, answerWith: 'back', startLevel: 1, lenient: true }, events, (s) => s.length * 9);
  engine.resize(400, 800);
  return { engine, events };
}

function step(engine: Engine, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) engine.update(0.05);
}

describe('Engine', () => {
  it('spawns rocks inside the centred lane', () => {
    const { engine } = setup();
    step(engine, 1);
    const [m] = engine.meteors;
    const lane = laneWidth(400);
    expect(m.x - m.face.w / 2).toBeGreaterThanOrEqual((400 - lane) / 2 - 0.01);
    expect(m.x + m.face.w / 2).toBeLessThanOrEqual((400 + lane) / 2 + 0.01);
  });

  it('keeps relative height when the play area shrinks (keyboard opens)', () => {
    const { engine } = setup();
    step(engine, 4);
    const m = engine.meteors[0];
    const before = m.progress;
    engine.resize(400, 450);
    expect(m.progress).toBe(before);
    expect(engine.bottom(m)).toBeLessThan(engine.surfaceY(m.x));
  });

  it('destroys the matching rock and scores', () => {
    const { engine } = setup();
    step(engine, 1);
    const m = engine.meteors[0];
    expect(engine.submit(m.answer.toUpperCase())).toBe('correct');
    expect(engine.meteors).toHaveLength(0);
    expect(engine.hud().score).toBeGreaterThan(0);
  });

  it('requires retyping after an impact, then continues', () => {
    const { engine, events } = setup();
    step(engine, 1);
    const answer = engine.meteors[0].answer;
    step(engine, 20);
    expect(events.correction).toHaveBeenCalledWith(expect.any(String), answer);
    expect(engine.state).toBe('correction');
    expect(engine.hud().lives).toBe(2);
    expect(engine.submit('nope')).toBe('wrong');
    expect(engine.submit(answer)).toBe('correct');
    expect(engine.state).toBe('playing');
  });

  it('peeking reveals the answer, halves the score and marks the card for review', () => {
    const { engine, events } = setup();
    step(engine, 3);
    const m = engine.meteors[0];
    const y = engine.bottom(m) - m.face.h / 2;
    expect(engine.peek(m.x, y)).toBe(true);
    expect(m.face).toBe(m.answerFace);
    step(engine, 3);
    expect(m.face).toBe(m.promptFace);
    engine.submit(m.answer);
    engine.quit();
    const result = vi.mocked(events.over).mock.calls[0][0];
    expect(result.missed.map((x) => x.answer)).toContain(m.answer);
  });

  it('ends the run after the last shield is lost and corrected', () => {
    const { engine, events } = setup();
    for (let i = 0; i < 3; i++) {
      step(engine, 25);
      engine.submit(vi.mocked(events.correction).mock.calls[i][1]);
    }
    expect(engine.state).toBe('over');
    expect(events.over).toHaveBeenCalledOnce();
  });
});
