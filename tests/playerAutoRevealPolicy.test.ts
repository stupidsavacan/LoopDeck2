// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_REVEAL_IDLE_MS, IdleRevealClock } from '../src/flow/sessionPolicy';

afterEach(() => vi.useRealTimers());

describe('Flow idle auto reveal policy', () => {
  it('reveals only after ten seconds without a reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const expired = vi.fn();
    const clock = new IdleRevealClock(expired);
    clock.start();
    vi.advanceTimersByTime(9_000);
    clock.reset();
    vi.advanceTimersByTime(AUTO_REVEAL_IDLE_MS - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledOnce();
  });

  it('does not count time while hidden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const expired = vi.fn();
    const clock = new IdleRevealClock(expired);
    clock.start();
    vi.advanceTimersByTime(4_000);
    clock.pause('hidden');
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();
    clock.resume('hidden');
    vi.advanceTimersByTime(5_999);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledOnce();
  });
});
