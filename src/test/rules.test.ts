import { describe, it, expect, beforeEach } from 'vitest';
import { initialState, reduce, newQuest, defaultSettings, type Action } from '../store/reducer';
import { loadState, saveState, STORAGE_KEY } from '../store/storage';
import { levelFromXp, xpForNext } from '../logic/levels';
import { crystalBalance, xpTotal, grant } from '../logic/ledger';
import { questProgress, globalProgress, effort } from '../logic/progress';
import { effectivePoints, urgencyOf } from '../logic/priority';
import { capacityCheck } from '../logic/capacity';
import { fits } from '../logic/scheduler';
import type { AppState, FreeWindow, Quest } from '../types';

// Wed 14 Oct 2026, 10:00 local. Week = Mon 12 Oct … Sun 18 Oct.
const NOW = new Date(2026, 9, 14, 10, 0);
const iso = (d: Date) => d.toISOString();
const run = (s: AppState, ...acts: Action[]) => acts.reduce(reduce, s);
const addWeekly = (s: AppState, q: Quest, minutes = 120) =>
  reduce(s, { type: 'saveQuest', quest: q, weekly: { target: 'current', minutes }, now: iso(NOW) });
const win = (day: number, start: string, end: string, usable?: number): FreeWindow => ({
  id: `${day}-${start}`, day, start, end, enabled: true,
  usableMinutes: usable ?? (Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3))),
});
let s0: AppState;
beforeEach(() => { localStorage.clear(); s0 = initialState(NOW); });

describe('Stage I — quests, board, persistence', () => {
  it('creates an active board for the current Mon–Sun week', () => {
    const w = s0.weeks.find((x) => x.status === 'active')!;
    expect(w.weekStart).toBe('2026-10-12');
  });
  it('a quest remains saved after reload (persistence round trip)', () => {
    const q = newQuest({ title: 'CP Div2', rating: 3, isGlobal: true });
    const s = addWeekly(s0, q);
    expect(saveState(s)).toBe(true);
    const back = loadState()!;
    expect(back.quests[0].title).toBe('CP Div2');
    expect(back.weeks.find((w) => w.status === 'active')!.entries).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
  it('corrupt storage does not crash loading', () => {
    localStorage.setItem(STORAGE_KEY, '{nope');
    expect(loadState()).toBeNull();
  });
  it('editing a quest keeps progress, logs and id', () => {
    const q = newQuest({ title: 'A', progressMode: 'count', countTarget: 10, countDone: 4, isGlobal: true, estimateHours: 5 });
    let s = addWeekly(s0, q);
    s = reduce(s, { type: 'logTime', questId: q.id, minutes: 90, date: '2026-10-14', now: iso(NOW) });
    const edited = { ...s.quests[0], title: 'A renamed', description: 'new', rating: 2, estimateHours: 6 };
    s = reduce(s, { type: 'saveQuest', quest: edited, weekly: { target: 'current', minutes: 120 }, now: iso(NOW) });
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0].id).toBe(q.id);
    expect(s.quests[0].countDone).toBe(4);
    expect(effort(s.quests[0], s.logs).logged).toBe(90);
    expect(s.weeks.find((w) => w.status === 'active')!.entries).toHaveLength(1);
  });
  it('progress modes', () => {
    expect(questProgress(newQuest({ title: 'x', progressMode: 'percent', percent: 40 }), [])).toBe(40);
    expect(questProgress(newQuest({ title: 'x', progressMode: 'count', countDone: 9, countTarget: 1500 }), [])).toBeCloseTo(0.6);
    expect(questProgress(newQuest({ title: 'x', progressMode: 'milestones', milestones: [{ id: '1', title: 'a', done: true }, { id: '2', title: 'b', done: false }] }), [])).toBe(50);
    const h = newQuest({ title: 'x', progressMode: 'hours', estimateHours: 40 });
    expect(questProgress(h, [{ id: 'l', questId: h.id, date: '2026-10-14', minutes: 16 * 60, createdAt: '' }])).toBe(40);
  });
  it('global progress = average + done/total; completed counts 100%', () => {
    const a = newQuest({ title: 'a', category: 'main', isGlobal: true, percent: 50 });
    const b = newQuest({ title: 'b', category: 'main', isGlobal: true, status: 'completed' });
    const c = newQuest({ title: 'c', category: 'side', isGlobal: true, percent: 10 });
    const w = newQuest({ title: 'weekly only', category: 'main', isGlobal: false });
    const g = globalProgress([a, b, c, w], [], 'main', defaultSettings);
    expect(g).toEqual({ percent: 75, done: 1, total: 2 });
  });
  it('weekly-only quest: ticking completes it; archive keeps it; global+weekly only ticks the week', () => {
    const only = newQuest({ title: 'lab record', isGlobal: false });
    const both = newQuest({ title: 'both', isGlobal: true });
    let s = addWeekly(addWeekly(s0, only), both);
    s = run(s, { type: 'toggleEntry', questId: only.id, done: true, now: iso(NOW) }, { type: 'toggleEntry', questId: both.id, done: true, now: iso(NOW) });
    expect(s.quests.find((q) => q.id === only.id)!.status).toBe('completed');
    expect(s.quests.find((q) => q.id === both.id)!.status).toBe('active');
  });
});

describe('Stage II — XP, levels, crystals, shop', () => {
  it('level thresholds get progressively harder', () => {
    expect(xpForNext(2)).toBeGreaterThan(xpForNext(1));
    expect(xpForNext(10)).toBeGreaterThan(xpForNext(9));
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForNext(1)).level).toBe(2);
    expect(levelFromXp(xpForNext(1) - 1).level).toBe(1);
    const l = levelFromXp(xpForNext(1) + xpForNext(2) + 5);
    expect(l).toMatchObject({ level: 3, xpInto: 5 });
  });
  it('completing a quest grants XP+crystals exactly once, even if processed twice or reopened', () => {
    const q = newQuest({ title: 'q', isGlobal: true, xpReward: 80, crystalReward: 3 });
    let s = addWeekly(s0, q);
    const c: Action = { type: 'completeQuest', id: q.id, now: iso(NOW) };
    s = run(s, c, c);
    expect(xpTotal(s.ledger)).toBe(80);
    expect(crystalBalance(s.ledger)).toBe(3);
    s = run(s, { type: 'reopenQuest', id: q.id }, c);
    expect(xpTotal(s.ledger)).toBe(80);
    expect(crystalBalance(s.ledger)).toBe(3);
  });
  it('ledger grant ignores duplicate keys', () => {
    const e = { key: 'k', kind: 'xp' as const, amount: 5, reason: 'r', at: '' };
    expect(grant(grant([], e), e)).toHaveLength(1);
  });
  it('redeeming updates balance and records history; refuses when too poor', () => {
    const q = newQuest({ title: 'q', isGlobal: true, crystalReward: 5 });
    let s = addWeekly(s0, q);
    s = reduce(s, { type: 'addReward', reward: { name: 'Ice cream', description: '', cost: 4 } });
    const rid = s.rewards[0].id;
    s = reduce(s, { type: 'redeem', rewardId: rid, now: iso(NOW) });
    expect(s.redemptions).toHaveLength(0); // no crystals yet
    s = run(s, { type: 'completeQuest', id: q.id, now: iso(NOW) }, { type: 'redeem', rewardId: rid, now: iso(NOW) });
    expect(crystalBalance(s.ledger)).toBe(1);
    expect(s.redemptions).toHaveLength(1);
    s = reduce(s, { type: 'redeem', rewardId: rid, now: iso(NOW) });
    expect(s.redemptions).toHaveLength(1);
    expect(crystalBalance(s.ledger)).toBe(1);
  });
});

describe('Stage III — windows, scheduler, capacity', () => {
  const planned = (s: AppState) => s.sessions.filter((x) => x.status === 'planned');
  it('never allocates two quests to the same window', () => {
    let s = s0;
    s = { ...s, windows: [win(3, '18:00', '19:00'), win(4, '18:00', '19:00'), win(5, '09:00', '10:00')] };
    for (let i = 0; i < 4; i++) s = addWeekly(s, newQuest({ title: 'q' + i, rating: i + 1 }), 600);
    for (let k = 0; k < 20; k++) s = reduce(s, { type: 'replan', now: iso(NOW) });
    const keys = planned(s).map((x) => x.windowId + x.date);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(3);
  });
  it('never places a session in a window shorter than the minimum session', () => {
    const q = newQuest({ title: 'deep', minSessionMin: 75, preferredSessionMin: 90 });
    expect(fits(q, 60)).toBe(false);
    expect(fits(q, 74)).toBe(false);
    expect(fits(q, 75)).toBe(true);
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00')] };
    s = addWeekly(s, q, 300);
    s = reduce(s, { type: 'replan', now: iso(NOW) });
    expect(planned(s)).toHaveLength(0);
  });
  it('respects usable minutes (45 of a 60-min slot) and window start', () => {
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00', 45)] };
    s = addWeekly(s, newQuest({ title: 'q', preferredSessionMin: 60, minSessionMin: 30 }), 300);
    s = reduce(s, { type: 'replan', now: iso(NOW) });
    const x = planned(s)[0];
    expect(x.minutes).toBe(45);
    expect(x.start).toBe('18:00');
    expect(x.end).toBe('18:45');
  });
  it('does not plan past windows or exceed the weekly hours budget', () => {
    let s: AppState = { ...s0, windows: [win(0, '08:00', '09:00'), win(3, '18:00', '19:00'), win(4, '18:00', '19:00'), win(5, '18:00', '19:00')] };
    s = addWeekly(s, newQuest({ title: 'q' }), 90); // 90 min budget only
    s = reduce(s, { type: 'replan', now: iso(NOW) });
    expect(planned(s).every((x) => x.date >= '2026-10-14')).toBe(true);
    expect(planned(s).reduce((a, x) => a + x.minutes, 0)).toBe(90);
  });
  it('capacity warning reports planned, available and difference', () => {
    const c = capacityCheck(600, [win(0, '08:00', '09:00'), win(1, '08:00', '09:00')]);
    expect(c).toEqual({ plannedMin: 600, availableMin: 120, diffMin: -480, over: true });
    expect(capacityCheck(60, [win(0, '08:00', '09:00')]).over).toBe(false);
  });
  it('replan keeps accepted sessions untouched', () => {
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00'), win(4, '18:00', '19:00')] };
    s = addWeekly(s, newQuest({ title: 'q' }), 600);
    s = reduce(s, { type: 'replan', now: iso(NOW) });
    const first = planned(s)[0];
    s = run(s, { type: 'acceptSession', id: first.id, now: iso(NOW) }, { type: 'replan', now: iso(NOW) });
    expect(s.sessions.find((x) => x.id === first.id)!.status).toBe('accepted');
    const keys = s.sessions.filter((x) => x.status !== 'missed').map((x) => x.windowId + x.date);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Stage IV — sessions, deferrals, rollover', () => {
  const setup = () => {
    let s: AppState = { ...s0, windows: [win(3, '18:00', '19:00'), win(4, '18:00', '19:00')] };
    const q = newQuest({ title: 'lab record', isGlobal: true, estimateHours: 6, progressMode: 'hours' });
    s = addWeekly(s, q, 300);
    s = reduce(s, { type: 'replan', now: iso(NOW) });
    return { s, q, sess: s.sessions.find((x) => x.status === 'planned')! };
  };
  it('accept → completed logs minutes and updates progress without completing the quest', () => {
    const { s, q, sess } = setup();
    const t = iso(NOW);
    const r = run(s, { type: 'acceptSession', id: sess.id, now: t }, { type: 'finishSession', id: sess.id, completed: true, now: t });
    expect(r.logs.reduce((a, l) => a + l.minutes, 0)).toBe(sess.minutes);
    expect(r.quests.find((x) => x.id === q.id)!.status).toBe('active');
    expect(questProgress(r.quests[0], r.logs)).toBeGreaterThan(0);
    // processing the same finish twice must not double-log
    const again = reduce(r, { type: 'finishSession', id: sess.id, completed: true, now: t });
    expect(again.logs).toHaveLength(1);
  });
  it('incomplete session records partial minutes; quest stays active', () => {
    const { s, sess } = setup();
    const t = iso(NOW);
    const r = run(s, { type: 'acceptSession', id: sess.id, now: t }, { type: 'finishSession', id: sess.id, completed: false, minutes: 20, now: t });
    expect(r.sessions.find((x) => x.id === sess.id)!.status).toBe('incomplete');
    expect(r.logs[0].minutes).toBe(20);
    expect(r.quests[0].status).toBe('active');
  });
  it('defer stores reason, keeps progress and does not fail the quest', () => {
    const { s, sess } = setup();
    const r = reduce(s, { type: 'deferSession', id: sess.id, reason: 'I was tired or needed rest', now: iso(NOW) });
    const d = r.sessions.find((x) => x.id === sess.id)!;
    expect(d.status).toBe('deferred');
    expect(d.reason).toMatch(/tired/);
    expect(r.quests[0].status).toBe('active');
    expect(r.quests[0].rollovers).toBe(0);
  });
  it('reschedule moves to another free window and is not recorded as a deferral', () => {
    let { s, sess } = setup();
    const other = s.sessions.filter((x) => x.status === 'planned' && x.id !== sess.id);
    s = reduce(s, { type: 'setWindows', windows: [...s.windows, win(5, '18:00', '19:00')] });
    const r = reduce(s, { type: 'rescheduleSession', id: sess.id, windowId: '5-18:00', date: '2026-10-17', now: iso(NOW) });
    expect(r.sessions.find((x) => x.id === sess.id)!.status).toBe('rescheduled');
    expect(r.sessions.filter((x) => x.status === 'deferred')).toHaveLength(0);
    expect(r.sessions.some((x) => x.status === 'planned' && x.date === '2026-10-17' && x.rescheduledFrom === sess.id)).toBe(true);
    expect(other.length).toBeGreaterThanOrEqual(0);
    // cannot reschedule into an occupied window
    const bad = reduce(r, { type: 'rescheduleSession', id: r.sessions.find((x) => x.status === 'planned')!.id, windowId: '4-18:00', date: '2026-10-16', now: iso(NOW) });
    expect(bad.sessions.filter((x) => x.windowId === '4-18:00' && x.status === 'planned')).toHaveLength(1);
  });
  it('unanswered sessions become "missed", never failures', () => {
    const { s, sess } = setup();
    const later = new Date(2026, 9, 17, 12, 0);
    const r = reduce(s, { type: 'tick', now: iso(later) });
    expect(r.sessions.find((x) => x.id === sess.id)!.status).toBe('missed');
  });
  it('rollover: unfinished carries forward with +1 urgency; done is preserved in history', () => {
    const done = newQuest({ title: 'done one', isGlobal: false });
    const late = newQuest({ title: 'late one', category: 'main', rating: 2, isGlobal: true });
    let s = addWeekly(addWeekly(s0, done), late);
    s = reduce(s, { type: 'toggleEntry', questId: done.id, done: true, now: iso(NOW) });
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 9, 0)) }); // next Monday
    const closed = s.weeks.find((w) => w.status === 'closed')!;
    const active = s.weeks.find((w) => w.status === 'active')!;
    expect(closed.weekStart).toBe('2026-10-12');
    expect(closed.entries).toHaveLength(2); // previous board preserved
    expect(closed.carriedQuestIds).toEqual([late.id]);
    expect(active.weekStart).toBe('2026-10-19');
    expect(active.entries.map((e) => e.questId)).toEqual([late.id]);
    expect(active.entries[0].carried).toBe(true);
    expect(s.quests.find((q) => q.id === late.id)!.rollovers).toBe(1);
    expect(s.quests.find((q) => q.id === done.id)!.status).toBe('completed');
    // ticking again must not bump twice
    const same = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 10, 0)) });
    expect(same.quests.find((q) => q.id === late.id)!.rollovers).toBe(1);
  });
  it('urgency escalation is capped and does not outrank an imminent deadline', () => {
    const st = defaultSettings; // p=5, cap=3
    const side = newQuest({ title: 'side', category: 'side', rating: 3, rollovers: 50 });
    expect(effectivePoints(side, st)).toBe(6); // 3 + cap 3, never more
    expect(urgencyOf(side, st, '2026-10-14')).toBe('urgent'); // side reached p
    const mainLow = newQuest({ title: 'm', category: 'main', rating: 4, rollovers: 2 });
    expect(urgencyOf(mainLow, st, '2026-10-14')).toBe('normal'); // 4+2 = 6 < p+2 = 7
    expect(urgencyOf({ ...mainLow, rollovers: 3 }, st, '2026-10-14')).toBe('must'); // 4+3 = 7
    const exam = newQuest({ title: 'exam', category: 'main', rating: 1, deadline: '2026-10-15' });
    expect(urgencyOf(exam, st, '2026-10-14')).toBe('deadline');
  });
  it('plans a pre-confirmed next week without disturbing the current board', () => {
    const q = newQuest({ title: 'x', isGlobal: true });
    let s = addWeekly(s0, q);
    s = reduce(s, { type: 'planNextWeek', now: iso(NOW) });
    const up = s.weeks.find((w) => w.status === 'upcoming')!;
    expect(up.weekStart).toBe('2026-10-19');
    expect(up.entries.map((e) => e.questId)).toEqual([q.id]);
    expect(s.weeks.find((w) => w.status === 'active')!.entries).toHaveLength(1);
    s = reduce(s, { type: 'tick', now: iso(new Date(2026, 9, 19, 9, 0)) });
    expect(s.weeks.filter((w) => w.status === 'upcoming')).toHaveLength(0);
    expect(s.weeks.find((w) => w.status === 'active')!.entries).toHaveLength(1);
  });
});
