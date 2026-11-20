/**
 * Chooses which card falls next.
 *
 * Missed cards get a higher weight and are also queued to come back after a
 * couple of spawns, so the player sees them again while they're fresh.
 * Cards answered correctly become less likely. Recently shown cards and
 * cards currently on screen are avoided.
 */
export class Picker {
  private weights: number[];
  private recent: number[] = [];
  private retry: { index: number; wait: number }[] = [];

  constructor(
    private readonly size: number,
    private readonly random: () => number = Math.random,
  ) {
    this.weights = new Array<number>(size).fill(1);
  }

  next(onScreen: ReadonlySet<number>): number {
    for (const r of this.retry) r.wait--;
    const dueAt = this.retry.findIndex((r) => r.wait <= 0 && !onScreen.has(r.index));
    if (dueAt >= 0) {
      const [due] = this.retry.splice(dueAt, 1);
      return this.remember(due.index);
    }

    const free = [...Array(this.size).keys()].filter((i) => !onScreen.has(i));
    const recentLimit = Math.max(0, Math.min(3, free.length - 1));
    const recent = new Set(this.recent.slice(-recentLimit));
    const queued = new Set(this.retry.map((r) => r.index));
    let candidates = free.filter((i) => !recent.has(i) && !queued.has(i));
    if (candidates.length === 0) candidates = free.filter((i) => !recent.has(i));
    if (candidates.length === 0) candidates = free;
    if (candidates.length === 0) candidates = [...Array(this.size).keys()];

    const total = candidates.reduce((sum, i) => sum + this.weights[i], 0);
    let roll = this.random() * total;
    for (const i of candidates) {
      roll -= this.weights[i];
      if (roll < 0) return this.remember(i);
    }
    return this.remember(candidates[candidates.length - 1]);
  }

  hit(index: number): void {
    this.weights[index] = Math.max(0.4, this.weights[index] * 0.6);
  }

  miss(index: number): void {
    this.weights[index] += 2;
    if (!this.retry.some((r) => r.index === index)) this.retry.push({ index, wait: 2 });
  }

  private remember(index: number): number {
    this.recent.push(index);
    if (this.recent.length > 6) this.recent.shift();
    return index;
  }
}
