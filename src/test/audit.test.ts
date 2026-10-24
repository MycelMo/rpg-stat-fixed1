import { describe, it, expect, beforeEach } from 'vitest';
import { initialState, reduce, newQuest, defaultSettings, type Action } from '../store/reducer';
import { loadState, saveState, STORAGE_KEY } from '../store/storage';
import { crystalBalance, xpTotal } from '../logic/ledger';
import { questProgress } from '../logic/progress';
import { effectivePoints, urgencyOf, scheduleWeight } from '../logic/priority';
import { planWeek, sessionMinutes } from '../logic/scheduler';
import { weekStartOf } from '../logic/time';
import type { AppState, FreeWindow, Quest, Session } from '../types';

// Wed 14 Oct 2026, 10:00 local. Week = Mon 12 Oct … Sun 18 Oct.
const NOW = new Date(2026, 9, 14, 10, 0);
const iso = (d: Date) => d.toISOString();
const run = (s: AppState, ...acts: Action[]) => acts.reduce(reduce, s);
const addWeekly = (s: AppState, q: Quest, minutes = 120) =>
  reduce(s, { type: 'saveQuest', quest: q, weekly: { target: 'current', minutes }, now: iso(NOW) });
const win = (day: number, start: string, end: string, usable?: number): FreeWindow => {
  const len = Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3));
  return { id: `${day}-${start}`, day, start, end, enabled: true, usableMinutes: usable ?? len };
};
const planned = (s: AppState): Session[] => s.sessions.filter((x) => x.status === 'planned');
const activeWeek = (s: AppState) => s.weeks.find((w) => w.status === 'active')!;
let s0: AppState;
beforeEach(() => { localStorage.clear(); s0 = initialState(NOW); });

describe('Audit 1 — progress target is configuration, not a constant', () => {
  it('counter target and done count are free values; editing the target keeps progress and recalculates', () => {
    const q = newQuest({ title: 'CP', progressMode: 'count', countTarget: 250, countDone: 10, isGlobal: true });
    expect(questProgress(q, [])).toBe(4);
    let s = addWeekly(s0, q);
    s = reduce(s, { type: 'saveQuest', quest: { ...s.quests[0], countTarget: 500 }, weekly: { target: 'current', minutes: 120 }, now: iso(NOW) });
    expect(s.quests[0].countDone).toBe(10);
    expect(questProgress(s.quests[0], [])).toBe(2);
    s = reduce(s, { type: 'saveQuest', quest: { ...s.quests[0], countTarget: 8 }, weekly: { target: 'current', minutes: 120 }, now: iso(NOW) });
    expect(questProgress(s.quests[0], [])).toBe(100); // done > target clamps, no crash
    saveState(s);
    expect(loadState()!.quests[0].countTarget).toBe(8);
  });
  it('a counter with target 0 does not divide by zero', () => {
    expect(questProgress(newQuest({ title: 'x', progressMode: 'count', countTarget: 0, countDone: 5 }), [])).toBe(0);
  });
});

describe('Audit 2 — escalation thresholds', () => {
  it('side quest is Urgent exactly at p, main quest MUST DO exactly at p+2 (custom p)', () => {
    const st = { ...defaultSettings, mainThreshold: 3, bumpPerRollover: 1, bumpCap: 10 };
    const side = (r: number) => newQuest({ title: 's', category: 'side', rating: 1, rollovers: r - 1 });
    expect(urgencyOf(side(2), st, '2026-10-14')).toBe('normal');
    expect(urgencyOf(side(3), st, '2026-10-14')).toBe('urgent');
    const main = (pts: number) => newQuest({ title: 'm', category: 'main', rating: 1, rollovers: pts - 1 });
    expect(urgencyOf(main(4), st, '2026-10-14')).toBe('normal');
    expect(urgencyOf(main(5), st, '2026-10-14')).toBe('must');
  });
  it('bump is capped no matter how many rollovers', () => {
    const q = newQuest({ title: 'q', rating: 2, rollovers: 1000 });
    expect(effectivePoints(q, defaultSettings)).toBe(2 + defaultSettings.bumpCap);
  });
  it('completed quests are never flagged urgent', () => {
    const q = newQuest({ title: 'q', category: 'main', rating: 9, status: 'completed' });
    expect(urgencyOf(q, defaultSettings, '2026-10-14')).toBe('normal');
  });
});

describe('Audit 2 — weighted-random selection', () => {
  const oneWindow = (seed: number, qs: Quest[]) => {
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00')], plannerSeed: seed };
    for (const q of qs) s = addWeekly(s, q, 600);
    return planWeek({ week: activeWeek(s), quests: s.quests, windows: s.windows, sessions: [], settings: s.settings, now: NOW, seed, loggedThisWeek: () => 0 });
  };
  it('picks in proportion to weight (rating 4 vs 1 ≈ 80/20) and is reproducible per seed', () => {
    const a = newQuest({ title: 'A', category: 'side', rating: 4 });
    const b = newQuest({ title: 'B', category: 'side', rating: 1 });
    let hitsA = 0; const N = 4000;
    for (let i = 1; i <= N; i++) { if (oneWindow(i, [a, b])[0].questId === a.id) hitsA++; }
    expect(Math.abs(hitsA / N - 0.8)).toBeLessThan(0.04);
    expect(oneWindow(7, [a, b])[0].questId).toBe(oneWindow(7, [a, b])[0].questId);
  });
  it('main-quest +2 bonus applies from a 90-minute window, not 89, and never to side quests', () => {
    const main = newQuest({ title: 'm', category: 'main', rating: 3 });
    const side = newQuest({ title: 's', category: 'side', rating: 3 });
    expect(scheduleWeight(main, defaultSettings, '2026-10-14', 89)).toBe(3);
    expect(scheduleWeight(main, defaultSettings, '2026-10-14', 90)).toBe(5);
    expect(scheduleWeight(side, defaultSettings, '2026-10-14', 180)).toBe(3);
  });
  it('a MUST DO quest is chosen before any random roll', () => {
    const must = newQuest({ title: 'must', category: 'main', rating: 4, rollovers: 3 }); // 7 = p+2
    const hi = newQuest({ title: 'hi', category: 'side', rating: 9 });
    for (let i = 1; i <= 200; i++) expect(oneWindow(i, [must, hi])[0].questId).toBe(must.id);
  });
});

describe('Audit 2 — session-window durations', () => {
  it('60-min window → 60-min session; usable 45 of 60 → 45-min session ending 18:45', () => {
    const q = newQuest({ title: 'q' });
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00')] };
    s = run(addWeekly(s, q, 600), { type: 'replan', now: iso(NOW) });
    expect(planned(s)[0].minutes).toBe(60);
    s = run(addWeekly({ ...s0, windows: [win(3, '18:00', '19:00', 45)] }, q, 600), { type: 'replan', now: iso(NOW) });
    expect(planned(s)[0].minutes).toBe(45);
    expect(planned(s)[0].end).toBe('18:45');
  });
  it('OBSERVATION: a leftover smaller than the minimum session still becomes a short session', () => {
    const q = newQuest({ title: 'q', minSessionMin: 30, preferredSessionMin: 60 });
    expect(sessionMinutes(q, 60, 10)).toBe(10); // 10 < minSessionMin 30
  });
  it('a disabled window is never used', () => {
    let s: AppState = { ...s0, windows: [{ ...win(3, '18:00', '19:00'), enabled: false }] };
    s = run(addWeekly(s, newQuest({ title: 'q' }), 600), { type: 'replan', now: iso(NOW) });
    expect(planned(s)).toHaveLength(0);
  });
});

describe('Audit 3 — duplicates, refreshes, rollover, overlaps, missed sessions', () => {
  it('weekly-only quest: tick/untick/tick pays XP and crystals exactly once', () => {
    const q = newQuest({ title: 'w', xpReward: 40, crystalReward: 2 });
    let s = addWeekly(s0, q);
    const t = (done: boolean): Action => ({ type: 'toggleEntry', questId: q.id, done, now: iso(NOW) });
    s = run(s, t(true), t(true), t(false), t(true), { type: 'completeQuest', id: q.id, now: iso(NOW) });
    expect(xpTotal(s.ledger)).toBe(40);
    expect(crystalBalance(s.ledger)).toBe(2);
  });
  it('finishing a session twice, or after the quest was completed, never double-logs', () => {
    const q = newQuest({ title: 'q', isGlobal: true });
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00')] };
    s = run(addWeekly(s, q, 600), { type: 'replan', now: iso(NOW) });
    const id = planned(s)[0].id;
    s = run(s, { type: 'acceptSession', id, now: iso(NOW) }, { type: 'finishSession', id, completed: true, now: iso(NOW) },
      { type: 'finishSession', id, completed: true, now: iso(NOW) }, { type: 'acceptSession', id, now: iso(NOW) });
    expect(s.logs).toHaveLength(1);
    expect(s.sessions.find((x) => x.id === id)!.status).toBe('completed');
  });
  it('redeeming the last affordable reward twice only works once', () => {
    let s = addWeekly(s0, newQuest({ title: 'q', crystalReward: 5, xpReward: 1 }));
    s = run(s, { type: 'completeQuest', id: s.quests[0].id, now: iso(NOW) }, { type: 'addReward', reward: { name: 'Movie', description: '', cost: 5 } });
    const rid = s.rewards[0].id;
    s = run(s, { type: 'redeem', rewardId: rid, now: iso(NOW) }, { type: 'redeem', rewardId: rid, now: iso(NOW) });
    expect(s.redemptions).toHaveLength(1);
    expect(crystalBalance(s.ledger)).toBe(0);
  });
  it('Sunday 23:59 stays in the week; Monday 00:00 rolls over exactly once', () => {
    const late = newQuest({ title: 'late', category: 'main', rating: 2, isGlobal: true });
    let s = addWeekly(s0, late);
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 18, 23, 59, 30)) });
    expect(activeWeek(s).weekStart).toBe('2026-10-12');
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 0, 0, 5)) });
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 0, 0, 20)) });
    expect(activeWeek(s).weekStart).toBe('2026-10-19');
    expect(s.quests[0].rollovers).toBe(1);
  });
  it('three weeks closed while the app was shut: three bumps, history kept, cap still holds', () => {
    const late = newQuest({ title: 'late', isGlobal: true });
    let s = addWeekly(s0, late);
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 10, 3, 9, 0)) }); // Tue 3 Nov
    expect(s.quests[0].rollovers).toBe(3);
    expect(s.weeks.filter((w) => w.status === 'closed')).toHaveLength(3);
    expect(effectivePoints(s.quests[0], defaultSettings)).toBe(1 + 3);
  });
  it('a quest completed or deleted before rollover is not carried; completed global+weekly quest is not auto-added', () => {
    const a = newQuest({ title: 'a', isGlobal: true }); const b = newQuest({ title: 'b', isGlobal: true });
    let s = addWeekly(addWeekly(s0, a), b);
    s = run(s, { type: 'toggleEntry', questId: a.id, done: true, now: iso(NOW) }, { type: 'deleteQuest', id: b.id });
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 9, 0)) });
    expect(activeWeek(s).entries).toHaveLength(0);
    expect(s.quests.find((q) => q.id === a.id)!.rollovers).toBe(0);
  });
  it('cannot assign or reschedule into a window that already holds an accepted session', () => {
    const q = newQuest({ title: 'q' }); const r = newQuest({ title: 'r' });
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00'), win(4, '18:00', '19:00')] };
    s = run(addWeekly(addWeekly(s, q, 600), r, 600), { type: 'replan', now: iso(NOW) });
    const [p1, p2] = planned(s);
    s = reduce(s, { type: 'acceptSession', id: p1.id, now: iso(NOW) });
    const before = JSON.stringify(s.sessions);
    s = reduce(s, { type: 'assignSession', windowId: p1.windowId, date: p1.date, questId: r.id, now: iso(NOW) });
    expect(JSON.stringify(s.sessions)).toBe(before);
    s = reduce(s, { type: 'rescheduleSession', id: p2.id, windowId: p1.windowId, date: p1.date, now: iso(NOW) });
    expect(JSON.stringify(s.sessions)).toBe(before);
    const keys = s.sessions.filter((x) => ['planned', 'accepted'].includes(x.status)).map((x) => x.windowId + x.date);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('replan twice in a row never double-books a window', () => {
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00'), win(4, '18:00', '19:00'), win(5, '09:00', '10:00')] };
    s = run(addWeekly(addWeekly(s, newQuest({ title: 'q' }), 600), newQuest({ title: 'r' }), 600),
      { type: 'replan', now: iso(NOW) }, { type: 'replan', now: iso(NOW) }, { type: 'replan', now: iso(NOW) });
    const keys = planned(s).map((x) => x.windowId + x.date);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
  it('an accepted session nobody answered survives the week rollover and can still be answered once', () => {
    const q = newQuest({ title: 'q', isGlobal: true, estimateHours: 4, progressMode: 'hours' });
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00')] };
    s = run(addWeekly(s, q, 600), { type: 'replan', now: iso(NOW) });
    const id = planned(s)[0].id;
    s = run(s, { type: 'acceptSession', id, now: iso(NOW) }, { type: 'tick', now: iso(new Date(2026, 9, 20, 9, 0)) });
    expect(s.sessions.find((x) => x.id === id)!.status).toBe('accepted');
    s = run(s, { type: 'finishSession', id, completed: true, now: iso(new Date(2026, 9, 20, 9, 0)) });
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0].date).toBe('2026-10-15');
  });
  it('a deferred session frees its minutes: a later replan can use another window, progress untouched', () => {
    const q = newQuest({ title: 'q', isGlobal: true });
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00'), win(5, '18:00', '19:00')] };
    s = run(addWeekly(s, q, 60), { type: 'replan', now: iso(NOW) });
    expect(planned(s)).toHaveLength(1);
    const id = planned(s)[0].id;
    s = run(s, { type: 'deferSession', id, reason: '', now: iso(NOW) }, { type: 'replan', now: iso(NOW) });
    expect(s.sessions.find((x) => x.id === id)!.status).toBe('deferred');
    expect(s.quests[0].status).toBe('active');
    expect(s.quests[0].rollovers).toBe(0);
    expect(planned(s).length).toBeGreaterThanOrEqual(1);
  });
  it('weekStartOf: Sunday belongs to the week that started the previous Monday', () => {
    expect(weekStartOf(new Date(2026, 9, 18, 23, 59))).toBe('2026-10-12');
    expect(weekStartOf(new Date(2026, 9, 19, 0, 0))).toBe('2026-10-19');
  });
});

describe('Audit 3 — persistence', () => {
  it('full state round-trips through storage unchanged', () => {
    let s = addWeekly(s0, newQuest({ title: 'CP', progressMode: 'count', countTarget: 250, countDone: 9, isGlobal: true }));
    s = run(s, { type: 'logTime', questId: s.quests[0].id, minutes: 45, date: '2026-10-14', now: iso(NOW) });
    saveState(s);
    expect(JSON.stringify(loadState())).toBe(JSON.stringify(s));
  });
  it('CORRUPT storage must not be silently overwritten: the raw text is kept under a backup key', () => {
    localStorage.setItem(STORAGE_KEY, '{"quests":[{"title":"precious"}');
    expect(loadState()).toBeNull();
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
    const backup = keys.find((k) => k !== STORAGE_KEY && k.startsWith(STORAGE_KEY));
    expect(!!backup).toBe(true);
    expect(localStorage.getItem(backup!)).toMatch(/precious/);
  });
});
