import type { FreeWindow, Quest, Session, Settings, Week } from '../types';
import { addDays, dateTimeOf, hmToMin, minToHm } from './time';
import { isHard, scheduleWeight } from './priority';
import { mulberry32, uid } from './rng';
import { windowUsable } from './capacity';

export interface WindowInstance {
  windowId: string;
  date: string;
  start: string;
  end: string;
  usable: number;
}

export function instancesForWeek(weekStart: string, windows: FreeWindow[]): WindowInstance[] {
  const out: WindowInstance[] = [];
  for (const w of windows) {
    const usable = Math.min(windowUsable(w), hmToMin(w.end) - hmToMin(w.start));
    if (usable <= 0) continue;
    out.push({ windowId: w.id, date: addDays(weekStart, w.day), start: w.start, end: w.end, usable });
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Sessions that occupy their window (a window can never hold two of these). */
export const BLOCKING: Session['status'][] = ['planned', 'accepted', 'completed', 'incomplete'];
export const isBlocking = (s: Session) => BLOCKING.includes(s.status);

/** Can this quest use this window at all? (rule R9) */
export function fits(q: Quest, usable: number): boolean {
  if (usable < q.minSessionMin) return false;
  if (!q.pausable && usable < q.preferredSessionMin) return false;
  return true;
}

export function sessionMinutes(q: Quest, usable: number, remaining: number): number {
  return Math.max(1, Math.min(usable, q.preferredSessionMin, remaining));
}

function fitFactor(q: Quest, usable: number): number {
  let f = usable >= q.preferredSessionMin ? 1.2 : 0.8;
  if (q.intensity === 'deep' && usable < 60) f *= 0.6;
  if (q.intensity === 'light' && usable >= 90) f *= 0.8;
  return f;
}

export interface PlanInput {
  week: Week;
  quests: Quest[];
  windows: FreeWindow[];
  sessions: Session[];
  loggedThisWeek: (questId: string) => number;
  settings: Settings;
  now: Date;
  seed: number;
}

/**
 * Fill every free, future, unoccupied window of the week with at most one session.
 * Existing blocking sessions (accepted, manual, …) are kept; plain 'planned' ones are
 * regenerated. Returns the full new sessions list.
 */
export function planWeek(inp: PlanInput): Session[] {
  const { week, quests, windows, settings, now } = inp;
  const keep = inp.sessions.filter((s) => !(s.weekStart === week.weekStart && s.status === 'planned' && !s.manual));
  const rng = mulberry32(inp.seed);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const remaining = new Map<string, number>();
  for (const e of week.entries) {
    const q = quests.find((x) => x.id === e.questId);
    if (!q || q.status !== 'active' || e.done) continue;
    const committed = keep
      .filter((s) => s.questId === e.questId && s.weekStart === week.weekStart && (s.status === 'planned' || s.status === 'accepted'))
      .reduce((a, s) => a + s.minutes, 0);
    const r = e.plannedMinutes - inp.loggedThisWeek(e.questId) - committed;
    if (r > 0) remaining.set(e.questId, r);
  }

  const occupied = new Set(keep.filter(isBlocking).map((s) => s.windowId + '@' + s.date));
  const out = [...keep];
  for (const inst of instancesForWeek(week.weekStart, windows)) {
    if (dateTimeOf(inst.date, inst.start) <= now) continue;
    if (occupied.has(inst.windowId + '@' + inst.date)) continue;
    const cands = [...remaining.entries()]
      .map(([id, rem]) => ({ q: quests.find((x) => x.id === id)!, rem }))
      .filter((c) => fits(c.q, inst.usable));
    if (!cands.length) continue;
    const hard = cands.filter((c) => isHard(c.q, settings, today));
    const pool = hard.length ? hard : cands;
    const weights = pool.map((c) => scheduleWeight(c.q, settings, today, inst.usable) * fitFactor(c.q, inst.usable));
    let pick = 0;
    if (settings.selectionMode === 'top' || hard.length) {
      pick = weights.indexOf(Math.max(...weights));
    } else {
      let r = rng() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { pick = i; break; } pick = i; }
    }
    const { q, rem } = pool[pick];
    const minutes = sessionMinutes(q, inst.usable, rem);
    out.push({
      id: uid(), questId: q.id, weekStart: week.weekStart, windowId: inst.windowId, date: inst.date,
      start: inst.start, end: minToHm(hmToMin(inst.start) + minutes), minutes, status: 'planned',
      createdAt: now.toISOString(),
    });
    remaining.set(q.id, rem - minutes);
    if (rem - minutes <= 0) remaining.delete(q.id);
  }
  return out;
}

/** Windows a session could be rescheduled into (future, unoccupied, quest fits). */
export function openWindowsFor(
  q: Quest, weekStart: string, windows: FreeWindow[], sessions: Session[], now: Date,
): WindowInstance[] {
  const occupied = new Set(sessions.filter(isBlocking).map((s) => s.windowId + '@' + s.date));
  return instancesForWeek(weekStart, windows).filter(
    (i) => dateTimeOf(i.date, i.start) > now && !occupied.has(i.windowId + '@' + i.date) && fits(q, i.usable),
  );
}
