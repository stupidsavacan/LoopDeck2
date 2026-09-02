import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Flow settings repository', () => {
  beforeEach(async () => {
    const request = indexedDB.deleteDatabase('loopdeck-db');
    await new Promise<void>((resolve) => { request.onsuccess = () => resolve(); request.onerror = () => resolve(); });
  });

  it('returns conservative defaults and persists local-only preferences', async () => {
    const { settingsRepository } = await import('../src/data/settingsRepository');
    const defaults = await settingsRepository.getPreferences();
    expect(defaults.defaultBudgetMinutes).toBe(5);
    expect(defaults.autoRevealAfterIdle).toBe(false);
    await settingsRepository.putPreferences({ ...defaults, defaultBudgetMinutes: 10, appearance: 'dark' });
    expect(await settingsRepository.getPreferences()).toMatchObject({ defaultBudgetMinutes: 10, appearance: 'dark' });
  });
});
