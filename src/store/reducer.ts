import type { AppState, FreeWindow, Quest, Reward, Session, Settings, TimeLog, Week, WeekEntry } from '../types';
import { grant, crystalBalance } from '../logic/ledger';
import { uid } from '../logic/rng';
import { addDays, dateTimeOf, hmToMin, minToHm, toDateStr, weekStartOf } from '../logic/time';
import { isBlocking, openWindowsFor, planWeek, sessionMinutes, fits, instancesForWeek } from '../logic/scheduler';

export const SCHEMA_VERSION = 1;
export const MIN_CARRY_MINUTES = 30;

export const defaultSettings: Settings = {
  name: 'Adventurer',
  theme: 'black',
  accent: '',
  mainThreshold: 5,
  bumpPerRollover: 1,
  bumpCap: 3,
  selectionMode: 'weighted',
  aggregation: 'average',
  browserNotifications: false,
  deferralReasons: [
    'The window was too short',
    'An unexpected task took priority',
    'I was tired or needed rest',
    'I deliberately chose leisure',
    'I got distracted',
    'Something else came up',
  ],
};

export function initialState(now: Date): AppState {
  return ensureWeeks(
    {
      schemaVersion: SCHEMA_VERSION, quests: [], weeks: [], logs: [], windows: [], sessions: [],
      ledger: [], rewards: [], redemptions: [], settings: defaultSettings, plannerSeed: 1,
    },
    now,
    true,
  );
}

export function newQuest(p: Partial<Quest> & { title: string }): Quest {
  return {
    id: uid(), description: '', category: 'side', isGlobal: false, isWeekly: true, rating: 1, rollovers: 0,
    progressMode: 'percent', percent: 0, countDone: 0, countTarget: 0, countUnit: '', milestones: [],
    preferredSessionMin: 60, minSessionMin: 30, intensity: 'moderate', pausable: true,
    xpReward: 30, crystalReward: 1, status: 'active', createdAt: new Date().toISOString(), ...p,
  };
}

export type Action =
  | { type: 'tick'; now: string }
  | { type: 'saveQuest'; quest: Quest; weekly?: { target: 'current' | 'next'; minutes: number }; now: string }
  | { type: 'deleteQuest'; id: string }
  | { type: 'toggleEntry'; questId: string; done: boolean; now: string }
  | { type: 'completeQuest'; id: string; now: string }
  | { type: 'reopenQuest'; id: string }
  | { type: 'logTime'; questId: string; minutes: number; date: string; now: string; note?: string }
  | { type: 'planNextWeek'; now: string }
  | { type: 'setEntry'; weekId: string; questId: string; minutes: number }
  | { type: 'addEntry'; weekId: string; questId: string; minutes: number }
  | { type: 'removeEntry'; weekId: string; questId: string }
  | { type: 'confirmWeek'; weekId: string }
  | { type: 'setWindows'; windows: FreeWindow[] }
  | { type: 'replan'; now: string }
  | { type: 'assignSession'; windowId: string; date: string; questId: string; now: string }
  | { type: 'acceptSession'; id: string; now: string }
  | { type: 'deferSession'; id: string; reason: string; now: string }
  | { type: 'rescheduleSession'; id: string; windowId: string; date: string; now: string }
  | { type: 'finishSession'; id: string; completed: boolean; minutes?: number; now: string }
  | { type: 'addReward'; reward: Omit<Reward, 'id'> }
  | { type: 'updateReward'; id: string; patch: Partial<Reward> }
  | { type: 'redeem'; rewardId: string; now: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'replaceState'; state: AppState; now: string };

const activeWeek = (s: AppState) => s.weeks.find((w) => w.status === 'active');
const upcomingWeek = (s: AppState) => s.weeks.find((w) => w.status === 'upcoming');
const mapWeek = (s: AppState, id: string, f: (w: Week) => Week): AppState => ({
  ...s, weeks: s.weeks.map((w) => (w.id === id ? f(w) : w)),
});

export function loggedInWeek(logs: TimeLog[], questId: string, weekStart: string): number {
  const end = addDays(weekStart, 6);
  return logs.filter((l) => l.questId === questId && l.date >= weekStart && l.date <= end).reduce((a, l) => a + l.minutes, 0);
}

/** Close the active week: bump unfinished quests once, carry them into the next week. */
function closeAndActivate(s: AppState, now: Date): AppState {
  const active = activeWeek(s)!;
  const isActive = (id: string) => s.quests.find((q) => q.id === id)?.status === 'active';
  const unfinished = active.entries.filter((e) => !e.done && isActive(e.questId));
  const carriedIds = unfinished.map((e) => e.questId);
  const quests = s.quests.map((q) => (carriedIds.includes(q.id) ? { ...q, rollovers: q.rollovers + 1 } : q));
  const upcoming = upcomingWeek(s);
  let entries: WeekEntry[] = (upcoming?.entries ?? []).filter((e) => quests.find((q) => q.id === e.questId)?.status === 'active');
  for (const e of unfinished) {
    const left = Math.max(MIN_CARRY_MINUTES, e.plannedMinutes - loggedInWeek(s.logs, e.questId, active.weekStart));
    if (entries.some((x) => x.questId === e.questId)) entries = entries.map((x) => (x.questId === e.questId ? { ...x, carried: true } : x));
    else entries = [...entries, { questId: e.questId, plannedMinutes: left, done: false, carried: true }];
  }
  const weeks = s.weeks
    .filter((w) => w.id !== upcoming?.id)
    .map((w) => (w.id === active.id ? { ...w, status: 'closed' as const, closedAt: now.toISOString(), carriedQuestIds: carriedIds } : w));
  weeks.push({
    id: upcoming?.id ?? uid(), weekStart: addDays(active.weekStart, 7), status: 'active', entries,
    confirmed: upcoming?.confirmed ?? false,
  });
  return { ...s, quests, weeks };
}

export function ensureWeeks(s: AppState, now: Date, first = false): AppState {
  let st = s;
  const cur = weekStartOf(now);
  if (!activeWeek(st)) {
    st = { ...st, weeks: [...st.weeks, { id: uid(), weekStart: cur, status: 'active', entries: [], confirmed: first }] };
  }
  let guard = 0;
  while (activeWeek(st)!.weekStart < cur && guard++ < 520) st = closeAndActivate(st, now);

  // Sessions whose slot passed without an answer are recorded as missed (not as failures).
  let changed = false;
  const sessions = st.sessions.map((x) => {
    if (x.status === 'planned' && dateTimeOf(x.date, x.end) <= now) { changed = true; return { ...x, status: 'missed' as const }; }
    return x;
  });
  if (changed) st = { ...st, sessions };
  return st;
}

function awardQuest(s: AppState, q: Quest, now: string): AppState {
  let ledger = grant(s.ledger, { key: `quest:${q.id}:xp`, kind: 'xp', amount: q.xpReward, reason: `Completed: ${q.title}`, at: now });
  ledger = grant(ledger, { key: `quest:${q.id}:crystal`, kind: 'crystal', amount: q.crystalReward, reason: `Completed: ${q.title}`, at: now });
  return { ...s, ledger };
}

function completeQuest(s: AppState, id: string, now: string): AppState {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.status === 'deleted') return s;
  const done: Quest = { ...q, status: 'completed', completedAt: q.completedAt ?? now };
  let st: AppState = { ...s, quests: s.quests.map((x) => (x.id === id ? done : x)) };
  st = {
    ...st,
    weeks: st.weeks.map((w) =>
      w.status === 'active' ? { ...w, entries: w.entries.map((e) => (e.questId === id && !e.done ? { ...e, done: true, doneAt: now } : e)) }
      : w.status === 'upcoming' ? { ...w, entries: w.entries.filter((e) => e.questId !== id) } : w),
    // future planned sessions for a finished quest are dropped
    sessions: st.sessions.filter((x) => !(x.questId === id && x.status === 'planned')),
  };
  return awardQuest(st, done, now);
}

function ensureUpcoming(s: AppState): AppState {
  if (upcomingWeek(s)) return s;
  const a = activeWeek(s)!;
  const entries: WeekEntry[] = a.entries
    .filter((e) => !e.done && s.quests.find((q) => q.id === e.questId)?.status === 'active')
    .map((e) => ({
      questId: e.questId, carried: true,
      plannedMinutes: Math.max(MIN_CARRY_MINUTES, e.plannedMinutes - loggedInWeek(s.logs, e.questId, a.weekStart)), done: false,
    }));
  return { ...s, weeks: [...s.weeks, { id: uid(), weekStart: addDays(a.weekStart, 7), status: 'upcoming', entries, confirmed: false }] };
}

function upsertEntry(w: Week, questId: string, minutes: number): Week {
  return w.entries.some((e) => e.questId === questId)
    ? { ...w, entries: w.entries.map((e) => (e.questId === questId ? { ...e, plannedMinutes: minutes } : e)) }
    : { ...w, entries: [...w.entries, { questId, plannedMinutes: minutes, done: false }] };
}

export function reduce(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tick':
      return ensureWeeks(s, new Date(a.now));
    case 'replaceState':
      return ensureWeeks(a.state, new Date(a.now));

    case 'saveQuest': {
      const q = a.quest;
      const exists = s.quests.some((x) => x.id === q.id);
      let st: AppState = { ...s, quests: exists ? s.quests.map((x) => (x.id === q.id ? q : x)) : [...s.quests, q] };
      if (q.isWeekly && a.weekly && q.status === 'active') {
        if (a.weekly.target === 'next') st = ensureUpcoming(st);
        const target = a.weekly.target === 'next' ? upcomingWeek(st)! : activeWeek(st)!;
        st = mapWeek(st, target.id, (w) => upsertEntry(w, q.id, a.weekly!.minutes));
      } else if (!q.isWeekly) {
        st = { ...st, weeks: st.weeks.map((w) => (w.status === 'closed' ? w : { ...w, entries: w.entries.filter((e) => e.questId !== q.id) })) };
      }
      return st;
    }
    case 'deleteQuest':
      return {
        ...s,
        quests: s.quests.map((q) => (q.id === a.id ? { ...q, status: 'deleted' } : q)),
        weeks: s.weeks.map((w) => (w.status === 'closed' ? w : { ...w, entries: w.entries.filter((e) => e.questId !== a.id) })),
        sessions: s.sessions.filter((x) => !(x.questId === a.id && x.status === 'planned')),
      };

    case 'toggleEntry': {
      const w = activeWeek(s);
      const q = s.quests.find((x) => x.id === a.questId);
      if (!w || !q) return s;
      let st = mapWeek(s, w.id, (wk) => ({
        ...wk, entries: wk.entries.map((e) => (e.questId === a.questId ? { ...e, done: a.done, doneAt: a.done ? a.now : undefined } : e)),
      }));
      // A weekly-only quest is finished by ticking its box; a global+weekly quest only checks off this week's commitment.
      if (a.done && !q.isGlobal) st = completeQuest(st, q.id, a.now);
      if (!a.done && !q.isGlobal && q.status === 'completed') st = reduce(st, { type: 'reopenQuest', id: q.id });
      return st;
    }
    case 'completeQuest':
      return completeQuest(s, a.id, a.now);
    case 'reopenQuest':
      return {
        ...s,
        quests: s.quests.map((q) => (q.id === a.id && q.status === 'completed' ? { ...q, status: 'active', completedAt: undefined } : q)),
        weeks: s.weeks.map((w) => (w.status === 'active' ? { ...w, entries: w.entries.map((e) => (e.questId === a.id && !s.quests.find((q) => q.id === a.id)?.isGlobal ? { ...e, done: false, doneAt: undefined } : e)) } : w)),
      };

    case 'logTime': {
      if (!(a.minutes > 0)) return s;
      return { ...s, logs: [...s.logs, { id: uid(), questId: a.questId, date: a.date, minutes: a.minutes, note: a.note, createdAt: a.now }] };
    }

    case 'planNextWeek':
      return ensureUpcoming(s);
    case 'setEntry':
      return mapWeek(s, a.weekId, (w) => ({ ...w, entries: w.entries.map((e) => (e.questId === a.questId ? { ...e, plannedMinutes: a.minutes } : e)) }));
    case 'addEntry':
      return mapWeek(s, a.weekId, (w) => upsertEntry(w, a.questId, a.minutes));
    case 'removeEntry':
      return mapWeek(s, a.weekId, (w) => ({ ...w, entries: w.entries.filter((e) => e.questId !== a.questId) }));
    case 'confirmWeek':
      return mapWeek(s, a.weekId, (w) => ({ ...w, confirmed: true }));

    case 'setWindows':
      return { ...s, windows: a.windows };

    case 'replan': {
      const w = activeWeek(s);
      if (!w) return s;
      const sessions = planWeek({
        week: w, quests: s.quests, windows: s.windows, sessions: s.sessions, settings: s.settings, now: new Date(a.now),
        seed: s.plannerSeed, loggedThisWeek: (id) => loggedInWeek(s.logs, id, w.weekStart),
      });
      return { ...s, sessions, plannerSeed: s.plannerSeed + 1 };
    }
    case 'assignSession': {
      const w = activeWeek(s);
      if (!w) return s;
      const inst = instancesForWeek(w.weekStart, s.windows).find((i) => i.windowId === a.windowId && i.date === a.date);
      if (!inst) return s;
      if (s.sessions.some((x) => x.windowId === a.windowId && x.date === a.date && isBlocking(x) && x.status !== 'planned')) return s;
      const rest = s.sessions.filter((x) => !(x.windowId === a.windowId && x.date === a.date && x.status === 'planned'));
      if (!a.questId) return { ...s, sessions: rest };
      const q = s.quests.find((x) => x.id === a.questId);
      if (!q || q.status !== 'active' || !fits(q, inst.usable)) return s;
      const minutes = sessionMinutes(q, inst.usable, Number.MAX_SAFE_INTEGER);
      const sess: Session = {
        id: uid(), questId: q.id, weekStart: w.weekStart, windowId: inst.windowId, date: inst.date, start: inst.start,
        end: minToHm(hmToMin(inst.start) + minutes), minutes, status: 'planned', manual: true, createdAt: a.now,
      };
      return { ...s, sessions: [...rest, sess] };
    }

    case 'acceptSession':
      return { ...s, sessions: s.sessions.map((x) => (x.id === a.id && x.status === 'planned' ? { ...x, status: 'accepted', respondedAt: a.now } : x)) };
    case 'deferSession':
      return { ...s, sessions: s.sessions.map((x) => (x.id === a.id && x.status === 'planned' ? { ...x, status: 'deferred', reason: a.reason.trim(), respondedAt: a.now } : x)) };
    case 'rescheduleSession': {
      const old = s.sessions.find((x) => x.id === a.id);
      const q = old && s.quests.find((x) => x.id === old.questId);
      const w = activeWeek(s);
      if (!old || old.status !== 'planned' || !q || !w) return s;
      const target = openWindowsFor(q, w.weekStart, s.windows, s.sessions, new Date(a.now)).find((i) => i.windowId === a.windowId && i.date === a.date);
      if (!target) return s;
      const minutes = Math.min(old.minutes, target.usable);
      const fresh: Session = {
        id: uid(), questId: old.questId, weekStart: old.weekStart, windowId: target.windowId, date: target.date, start: target.start,
        end: minToHm(hmToMin(target.start) + minutes), minutes, status: 'planned', manual: true, rescheduledFrom: old.id, createdAt: a.now,
      };
      return { ...s, sessions: [...s.sessions.map((x) => (x.id === old.id ? { ...x, status: 'rescheduled' as const, respondedAt: a.now } : x)), fresh] };
    }
    case 'finishSession': {
      const x = s.sessions.find((y) => y.id === a.id);
      if (!x || x.status !== 'accepted') return s; // already processed: no double logging/XP
      const logged = a.completed ? x.minutes : Math.max(0, Math.min(x.minutes, Math.round(a.minutes ?? 0)));
      let st: AppState = {
        ...s, sessions: s.sessions.map((y) => (y.id === x.id ? { ...y, status: a.completed ? 'completed' : 'incomplete', loggedMinutes: logged, respondedAt: a.now } : y)),
      };
      if (logged > 0) st = { ...st, logs: [...st.logs, { id: uid(), questId: x.questId, date: x.date, minutes: logged, sessionId: x.id, createdAt: a.now }] };
      return st;
    }

    case 'addReward':
      return { ...s, rewards: [...s.rewards, { id: uid(), ...a.reward }] };
    case 'updateReward':
      return { ...s, rewards: s.rewards.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) };
    case 'redeem': {
      const r = s.rewards.find((x) => x.id === a.rewardId);
      if (!r || r.archived || r.cost <= 0 || crystalBalance(s.ledger) < r.cost) return s;
      const id = uid();
      return {
        ...s,
        ledger: grant(s.ledger, { key: `redeem:${id}`, kind: 'crystal', amount: -r.cost, reason: `Redeemed: ${r.name}`, at: a.now }),
        redemptions: [...s.redemptions, { id, rewardId: r.id, rewardName: r.name, cost: r.cost, at: a.now }],
      };
    }

    case 'updateSettings':
      return { ...s, settings: { ...s.settings, ...a.patch } };
  }
}

export const todayStr = (d: Date) => toDateStr(d);
