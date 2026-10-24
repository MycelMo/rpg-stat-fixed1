import type { FreeWindow, Week } from '../types';

export const windowUsable = (w: FreeWindow) => w.enabled ? Math.max(0, w.usableMinutes) : 0;

export function weeklyAvailableMinutes(windows: FreeWindow[]): number {
  return windows.reduce((s, w) => s + windowUsable(w), 0);
}
export function weekPlannedMinutes(week: Week | undefined): number {
  return (week?.entries ?? []).reduce((s, e) => s + (e.done ? 0 : e.plannedMinutes), 0);
}
export interface CapacityCheck { plannedMin: number; availableMin: number; diffMin: number; over: boolean }

/** Revisions §3: planned vs available with the difference; `over` triggers the warning. */
export function capacityCheck(plannedMin: number, windows: FreeWindow[]): CapacityCheck {
  const availableMin = weeklyAvailableMinutes(windows);
  return { plannedMin, availableMin, diffMin: availableMin - plannedMin, over: plannedMin > availableMin };
}
