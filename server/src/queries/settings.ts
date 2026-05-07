import { getDb, now } from '../db';
import type { GlobalSettings } from '../types';

const SETTINGS_KEY = 'global';

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  hideCommittedCards: false,
  castingRulesToday: 'priority === 1 || isOverdue() || isDueToday()',
  castingRulesNext: 'isDueTomorrow()',
  cssOverrides: '',
};

export function findGlobalSettings(): GlobalSettings {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as { value?: string } | undefined;
  if (!row?.value) return { ...DEFAULT_GLOBAL_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<GlobalSettings>;
    return {
      hideCommittedCards: typeof parsed.hideCommittedCards === 'boolean'
        ? parsed.hideCommittedCards
        : DEFAULT_GLOBAL_SETTINGS.hideCommittedCards,
      castingRulesToday: typeof parsed.castingRulesToday === 'string' && parsed.castingRulesToday.trim()
        ? parsed.castingRulesToday
        : DEFAULT_GLOBAL_SETTINGS.castingRulesToday,
      castingRulesNext: typeof parsed.castingRulesNext === 'string' && parsed.castingRulesNext.trim()
        ? parsed.castingRulesNext
        : DEFAULT_GLOBAL_SETTINGS.castingRulesNext,
      cssOverrides: typeof parsed.cssOverrides === 'string'
        ? parsed.cssOverrides
        : DEFAULT_GLOBAL_SETTINGS.cssOverrides,
    };
  } catch {
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }
}

export function updateGlobalSettings(patch: Partial<GlobalSettings>): GlobalSettings {
  const current = findGlobalSettings();
  const next: GlobalSettings = {
    hideCommittedCards: patch.hideCommittedCards ?? current.hideCommittedCards,
    castingRulesToday: patch.castingRulesToday?.trim() || current.castingRulesToday,
    castingRulesNext: patch.castingRulesNext?.trim() || current.castingRulesNext,
    cssOverrides: patch.cssOverrides ?? current.cssOverrides,
  };

  getDb().prepare(`
    INSERT INTO settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `).run(SETTINGS_KEY, JSON.stringify(next), now());

  return next;
}

export function findGlobalSettingsUpdatedAt(): string | null {
  const row = getDb().prepare('SELECT updatedAt FROM settings WHERE key = ?').get(SETTINGS_KEY) as { updatedAt?: string } | undefined;
  return row?.updatedAt || null;
}
