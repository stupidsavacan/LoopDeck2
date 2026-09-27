export interface IdleRevealControllerOptions {
  timeoutMs: number;
  tickMs?: number;
  suspendGapMs?: number;
  now?: () => number;
  isEligible: () => boolean;
  onReveal: () => void;
  onSuspend?: (elapsedMs: number) => void;
}

export interface IdleRevealController {
  start(): void;
  reset(): void;
  setVisible(visible: boolean): void;
  setComposing(composing: boolean): void;
  dispose(): void;
}

export function createIdleRevealController(options: IdleRevealControllerOptions): IdleRevealController {
  const tickMs = options.tickMs ?? 250;
  const suspendGapMs = options.suspendGapMs ?? 1000;
  const now = options.now ?? Date.now;
  let remainingMs = options.timeoutMs;
  let lastTickAt = 0;
  let timer: number | undefined;
  let visible = true;
  let composing = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
  };

  const consumeElapsed = () => {
    if (timer === undefined) return;
    const elapsed = Math.max(0, now() - lastTickAt);
    if (elapsed <= suspendGapMs) remainingMs = Math.max(0, remainingMs - elapsed);
    else options.onSuspend?.(elapsed);
  };

  const schedule = () => {
    clearTimer();
    if (disposed || !visible || composing || !options.isEligible()) return;
    lastTickAt = now();
    timer = window.setTimeout(() => {
      timer = undefined;
      if (disposed || !visible || composing || !options.isEligible()) return;
      const elapsed = Math.max(0, now() - lastTickAt);
      if (elapsed <= suspendGapMs) remainingMs = Math.max(0, remainingMs - elapsed);
      else options.onSuspend?.(elapsed);
      if (remainingMs === 0) options.onReveal();
      else schedule();
    }, Math.min(tickMs, remainingMs));
  };

  return {
    start() { schedule(); },
    reset() {
      if (disposed || !options.isEligible()) return;
      remainingMs = options.timeoutMs;
      schedule();
    },
    setVisible(nextVisible) {
      if (visible === nextVisible || disposed) return;
      if (!nextVisible) {
        consumeElapsed();
        clearTimer();
        visible = false;
        return;
      }
      visible = true;
      schedule();
    },
    setComposing(nextComposing) {
      if (composing === nextComposing || disposed) return;
      composing = nextComposing;
      if (composing) clearTimer();
      else this.reset();
    },
    dispose() {
      disposed = true;
      clearTimer();
    }
  };
}
