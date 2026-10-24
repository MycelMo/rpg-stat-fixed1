import type { AppState } from '../types';
import { defaultSettings, SCHEMA_VERSION } from './reducer';

export const STORAGE_KEY = 'rpgstat:v1';

export function loadState(): AppState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalize(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    /* fall through to the backup below */
  }
  // Unreadable data: the app starts fresh, and the next save would overwrite it.
  // Keep the raw text under a separate key first so nothing is silently lost.
  if (raw) {
    try { localStorage.setItem(`${STORAGE_KEY}:unreadable-${Date.now()}`, raw); } catch { /* storage full: nothing more we can do */ }
  }
  return null;
}

/** Fill in any fields missing from older/partial saves so the app never crashes on old data. */
export function normalize(x: any): AppState | null {
  if (!x || typeof x !== 'object' || !Array.isArray(x.quests)) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    quests: x.quests, weeks: x.weeks ?? [], logs: x.logs ?? [], windows: x.windows ?? [], sessions: x.sessions ?? [],
    ledger: x.ledger ?? [], rewards: x.rewards ?? [], redemptions: x.redemptions ?? [],
    settings: { ...defaultSettings, ...(x.settings ?? {}) }, plannerSeed: x.plannerSeed ?? 1,
  };
}

export function saveState(s: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
