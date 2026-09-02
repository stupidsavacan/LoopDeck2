import type { IdleState } from './models';

export const AUTO_REVEAL_IDLE_MS = 10_000;
export const IDLE_CLOCK_TICK_MS = 250;
export const IDLE_CLOCK_SUSPEND_GAP_MS = 1_000;

export class IdleRevealClock {
  private timer: number | undefined;
  private lastTickAt = 0;
  private remaining = AUTO_REVEAL_IDLE_MS;
  private paused: 'hidden' | 'composition' | undefined;
  private stopped = true;

  constructor(private readonly onExpire: () => void, private readonly now: () => number = () => Date.now()) {}

  get state(): IdleState {
    if (this.stopped) return { kind: 'disabled' };
    if (this.paused === 'hidden') return { kind: 'paused-hidden', remainingMs: this.remaining };
    if (this.paused === 'composition') return { kind: 'paused-composition', remainingMs: this.remaining };
    return { kind: 'running', remainingMs: this.remaining };
  }

  start(): void {
    this.stopped = false;
    this.remaining = AUTO_REVEAL_IDLE_MS;
    this.schedule();
  }

  reset(): void {
    if (this.stopped) return;
    this.remaining = AUTO_REVEAL_IDLE_MS;
    if (!this.paused) this.schedule();
  }

  pause(reason: 'hidden' | 'composition'): void {
    if (this.stopped) return;
    this.consumeTick();
    this.paused = reason;
    this.clear();
  }

  resume(reason: 'hidden' | 'composition', reset = false): void {
    if (this.stopped || this.paused !== reason) return;
    this.paused = undefined;
    if (reset) this.remaining = AUTO_REVEAL_IDLE_MS;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    this.paused = undefined;
    this.clear();
  }

  private clear(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private consumeTick(): void {
    if (!this.lastTickAt) return;
    const gap = Math.max(0, this.now() - this.lastTickAt);
    if (gap <= IDLE_CLOCK_SUSPEND_GAP_MS) this.remaining = Math.max(0, this.remaining - gap);
  }

  private schedule(): void {
    this.clear();
    if (this.stopped || this.paused) return;
    this.lastTickAt = this.now();
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.consumeTick();
      if (this.remaining <= 0) {
        this.stop();
        this.onExpire();
      } else {
        this.schedule();
      }
    }, Math.min(IDLE_CLOCK_TICK_MS, this.remaining));
  }
}
