import type { LedgerEntry } from '../types';
import { uid } from './rng';

/**
 * Add a ledger entry unless one with the same key already exists.
 * This is what makes XP/crystal awards safe to process twice.
 */
export function grant(
  ledger: LedgerEntry[],
  e: { key: string; kind: 'xp' | 'crystal'; amount: number; reason: string; at: string },
): LedgerEntry[] {
  if (e.amount === 0 || ledger.some((l) => l.key === e.key)) return ledger;
  return [...ledger, { id: uid(), ...e }];
}
export const xpTotal = (l: LedgerEntry[]) => l.filter((e) => e.kind === 'xp').reduce((s, e) => s + e.amount, 0);
export const crystalBalance = (l: LedgerEntry[]) => l.filter((e) => e.kind === 'crystal').reduce((s, e) => s + e.amount, 0);

/** Suggested rewards (rule R6); the user can override per quest. */
export function defaultRewards(q: { category: 'main' | 'side'; rating: number; estimateHours?: number }) {
  const hours = q.estimateHours ?? 0;
  const xp = (q.category === 'main' ? 60 : 30) + Math.round(10 * Math.min(hours, 40)) + 5 * q.rating;
  const crystals = (q.category === 'main' ? 3 : 1) + Math.floor(hours / 5);
  return { xp, crystals };
}
