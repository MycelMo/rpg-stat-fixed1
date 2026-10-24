/** XP needed to go from level L to L+1. Grows 20% per level (rule R7). */
export function xpForNext(level: number): number {
  return Math.round(100 * Math.pow(1.2, level - 1));
}

export interface LevelInfo { level: number; xpInto: number; xpNeeded: number; totalXp: number }

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForNext(level)) {
    remaining -= xpForNext(level);
    level += 1;
  }
  return { level, xpInto: remaining, xpNeeded: xpForNext(level), totalXp: Math.max(0, Math.floor(totalXp)) };
}
