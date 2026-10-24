const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
/** Monday of the week containing `d` (local time). */
export function weekStartOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return toDateStr(x);
}
/** 0 = Monday … 6 = Sunday */
export function dayIndex(dateStr: string): number {
  return (fromDateStr(dateStr).getDay() + 6) % 7;
}
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
export function minToHm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export function dateTimeOf(dateStr: string, hm: string): Date {
  const d = fromDateStr(dateStr);
  d.setMinutes(hmToMin(hm));
  return d;
}
export function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
export function daysBetween(fromStr: string, toStr: string): number {
  const a = fromDateStr(fromStr).getTime();
  const b = fromDateStr(toStr).getTime();
  return Math.round((b - a) / 86400000);
}
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
