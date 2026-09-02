import type { FlowPreferences, FocusConfig } from '../flow/models';
import { db } from '../storage/db';

const PREFERENCES_KEY = 'flow.preferences.v1';
const FOCUS_KEY = 'flow.focus.v1';

export const DEFAULT_FLOW_PREFERENCES: FlowPreferences = {
  defaultBudgetMinutes: 5,
  appearance: 'system',
  autoNextCorrect: true,
  autoRevealAfterIdle: false,
  showExample: true,
  showNumber: true,
  showCategory: true
};

function validBudget(value: unknown): value is 5 | 10 | 20 {
  return value === 5 || value === 10 || value === 20;
}

export class SettingsRepository {
  async getPreferences(): Promise<FlowPreferences> {
    const stored = await db.getSetting<Partial<FlowPreferences>>(PREFERENCES_KEY);
    const merged = { ...DEFAULT_FLOW_PREFERENCES, ...(stored ?? {}) };
    if (!validBudget(merged.defaultBudgetMinutes)) merged.defaultBudgetMinutes = 5;
    if (!['system', 'light', 'dark'].includes(merged.appearance)) merged.appearance = 'system';
    return merged;
  }

  async putPreferences(preferences: FlowPreferences): Promise<void> {
    await db.putSetting(PREFERENCES_KEY, preferences);
  }

  async getFocus(): Promise<FocusConfig | undefined> {
    const focus = await db.getSetting<FocusConfig>(FOCUS_KEY);
    return focus && Array.isArray(focus.moduleIds) ? focus : undefined;
  }

  async putFocus(focus: FocusConfig | undefined): Promise<void> {
    await db.putSetting(FOCUS_KEY, focus ?? null);
  }
}

export const settingsRepository = new SettingsRepository();
