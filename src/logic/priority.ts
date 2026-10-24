import type { Quest, Settings } from '../types';
import { daysBetween } from './time';

/** Rule R1: rating + capped rollover bumps. */
export function effectivePoints(q: Quest, s: Settings): number {
  return q.rating + Math.min(q.rollovers * s.bumpPerRollover, s.bumpCap);
}

/** Rule R2: deadline pressure is separate from rollover escalation. Returns 0..3. */
export function deadlineBoost(deadline: string | undefined, today: string): number {
  if (!deadline) return 0;
  const d = daysBetween(today, deadline);
  if (d <= 2) return 3;
  if (d <= 7) return 2;
  if (d <= 14) return 1;
  return 0;
}

export type Urgency = 'normal' | 'urgent' | 'must' | 'deadline';

/**
 * Display urgency, highest first:
 *  deadline - deadline within 2 days (or overdue)
 *  must     - main quest whose points reached p+2 (notebook)
 *  urgent   - side quest whose points reached p (notebook)
 */
export function urgencyOf(q: Quest, s: Settings, today: string): Urgency {
  if (q.status !== 'active') return 'normal';
  if (q.deadline && daysBetween(today, q.deadline) <= 2) return 'deadline';
  const pts = effectivePoints(q, s);
  if (q.category === 'main' && pts >= s.mainThreshold + 2) return 'must';
  if (q.category === 'side' && pts >= s.mainThreshold) return 'urgent';
  return 'normal';
}

/** Rule R8: weight used by the scheduler. `windowMin` triggers the notebook's 1.5h main-quest bonus. */
export function scheduleWeight(q: Quest, s: Settings, today: string, windowMin: number): number {
  let w = effectivePoints(q, s) + deadlineBoost(q.deadline, today);
  if (q.category === 'main' && windowMin >= 90) w += 2;
  return Math.max(0.5, w);
}

/** "Hard" items are picked before any random roll: must-do mains and imminent deadlines. */
export function isHard(q: Quest, s: Settings, today: string): boolean {
  const u = urgencyOf(q, s, today);
  return u === 'must' || u === 'deadline';
}
