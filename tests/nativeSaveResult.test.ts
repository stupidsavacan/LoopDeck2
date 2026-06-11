// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForNativeSave } from '../src/screens/pdfWorksheetScreen';

afterEach(() => {
  vi.useRealTimers();
});

describe('Android native save result waiting', () => {
  it('resolves only for the matching save id', async () => {
    const waiting = waitForNativeSave('wanted', 1000);
    window.dispatchEvent(new CustomEvent('loopdeck-native-save-result', {
      detail: { id: 'other', ok: true, code: 'SAV-OK', message: 'other' }
    }));
    window.dispatchEvent(new CustomEvent('loopdeck-native-save-result', {
      detail: { id: 'wanted', ok: true, code: 'SAV-OK', message: 'saved', bytes: 42 }
    }));

    await expect(waiting).resolves.toMatchObject({ id: 'wanted', ok: true, bytes: 42 });
  });

  it('rejects native failures with their error code', async () => {
    const waiting = waitForNativeSave('failed', 1000);
    window.dispatchEvent(new CustomEvent('loopdeck-native-save-result', {
      detail: { id: 'failed', ok: false, code: 'SAV-A004', message: 'cancelled' }
    }));

    await expect(waiting).rejects.toThrow('[SAV-A004] cancelled');
  });

  it('times out instead of waiting forever when no native callback arrives', async () => {
    vi.useFakeTimers();
    const assertion = expect(waitForNativeSave('missing', 25)).rejects.toThrow('[SAV-A032]');
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
  });
});
