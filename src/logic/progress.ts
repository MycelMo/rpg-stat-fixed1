import type { Category, Quest, Settings, TimeLog } from '../types';

export function loggedMinutes(logs: TimeLog[], questId: string): number {
  return logs.filter((l) => l.questId === questId).reduce((s, l) => s + l.minutes, 0);
}

/** Effort bookkeeping kept separate (revisions §2). Remaining is null when no estimate exists. */
export function effort(q: Quest, logs: TimeLog[]) {
  const logged = loggedMinutes(logs, q.id);
  const estimate = q.estimateHours != null ? Math.round(q.estimateHours * 60) : null;
  return { estimate, logged, remaining: estimate == null ? null : Math.max(0, estimate - logged) };
}

/** Individual progress 0..100 using the quest's explicit progress mode (rule R3). */
export function questProgress(q: Quest, logs: TimeLog[]): number {
  if (q.status === 'completed') return 100;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  switch (q.progressMode) {
    case 'percent':
      return clamp(q.percent);
    case 'count':
      return q.countTarget > 0 ? clamp((q.countDone / q.countTarget) * 100) : 0;
    case 'milestones':
      return q.milestones.length ? clamp((q.milestones.filter((m) => m.done).length / q.milestones.length) * 100) : 0;
    case 'hours': {
      const e = effort(q, logs);
      return e.estimate ? clamp((e.logged / e.estimate) * 100) : 0;
    }
  }
}

export interface GlobalProgress { percent: number; done: number; total: number }

/**
 * Global progress for one category (rule R4): all non-deleted global quests,
 * completed ones count as 100%. Shows done/total alongside the percentage.
 */
export function globalProgress(quests: Quest[], logs: TimeLog[], category: Category, settings: Settings): GlobalProgress {
  const set = quests.filter((q) => q.isGlobal && q.category === category && q.status !== 'deleted');
  if (!set.length) return { percent: 0, done: 0, total: 0 };
  const done = set.filter((q) => q.status === 'completed').length;
  let percent: number;
  if (settings.aggregation === 'weighted') {
    const w = (q: Quest) => (q.estimateHours && q.estimateHours > 0 ? q.estimateHours : 1);
    const totalW = set.reduce((s, q) => s + w(q), 0);
    percent = set.reduce((s, q) => s + w(q) * questProgress(q, logs), 0) / totalW;
  } else {
    percent = set.reduce((s, q) => s + questProgress(q, logs), 0) / set.length;
  }
  return { percent: Math.round(percent), done, total: set.length };
}
