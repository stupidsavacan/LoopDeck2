// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdleRevealController } from '../src/core/idleRevealController';

afterEach(() => vi.useRealTimers());

describe('idle reveal controller', () => {
  it('tracks visibility and reset state independently from quiz DOM', async () => {
    vi.useFakeTimers();
    let eligible = true;
    const reveal = vi.fn();
    const controller = createIdleRevealController({ timeoutMs: 1000, isEligible: () => eligible, onReveal: reveal });
    controller.start();

    await vi.advanceTimersByTimeAsync(600);
    controller.setVisible(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reveal).not.toHaveBeenCalled();

    controller.setVisible(true);
    await vi.advanceTimersByTimeAsync(399);
    expect(reveal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reveal).toHaveBeenCalledOnce();

    eligible = false;
    controller.reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reveal).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
