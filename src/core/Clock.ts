/**
 * Pausable game clock + game-time scheduler.
 *
 * All gameplay timing (cooldowns, waves, delayed effects) runs on game time,
 * never on setTimeout/setInterval. When the clock is paused (page hidden,
 * pause menu, rotate prompt) game time simply stops, so nothing fires or
 * jumps forward on resume. Scheduler.clear() is part of every restart.
 */

const MAX_DT = 1 / 20; // clamp long frames (tab switch, GC hitch) to 50 ms

export class Clock {
  private last = 0;
  private pauseReasons = new Set<string>();
  /** total un-paused game time, seconds */
  time = 0;

  get paused(): boolean {
    return this.pauseReasons.size > 0;
  }

  pause(reason: string): void {
    this.pauseReasons.add(reason);
  }

  resume(reason: string): void {
    this.pauseReasons.delete(reason);
    // Drop the wall-clock gap accumulated while paused.
    this.last = performance.now();
  }

  isPausedBy(reason: string): boolean {
    return this.pauseReasons.has(reason);
  }

  /** Returns the game delta for this frame (0 while paused). */
  tick(now: number): number {
    if (this.last === 0) this.last = now;
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.paused) return 0;
    const dt = Math.min(Math.max(raw, 0), MAX_DT);
    this.time += dt;
    return dt;
  }
}

interface Timer {
  id: number;
  at: number;
  fn: () => void;
  every?: number;
}

export class Scheduler {
  private timers: Timer[] = [];
  private nextId = 1;
  private now = 0;

  get count(): number {
    return this.timers.length;
  }

  after(seconds: number, fn: () => void): number {
    const t: Timer = { id: this.nextId++, at: this.now + seconds, fn };
    this.timers.push(t);
    return t.id;
  }

  every(seconds: number, fn: () => void): number {
    const t: Timer = { id: this.nextId++, at: this.now + seconds, fn, every: seconds };
    this.timers.push(t);
    return t.id;
  }

  cancel(id: number): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  clear(): void {
    this.timers.length = 0;
  }

  update(dt: number): void {
    this.now += dt;
    // Iterate over a snapshot: callbacks may schedule or cancel timers.
    const due = this.timers.filter((t) => t.at <= this.now);
    if (due.length === 0) return;
    for (const t of due) {
      const idx = this.timers.indexOf(t);
      if (idx < 0) continue; // cancelled by an earlier callback this frame
      if (t.every !== undefined) {
        t.at += t.every;
      } else {
        this.timers.splice(idx, 1);
      }
      t.fn();
    }
  }
}
