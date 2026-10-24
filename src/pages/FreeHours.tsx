import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { PageHead } from '../components/ui';
import { DAY_NAMES, hmToMin, minToHm } from '../logic/time';
import { uid } from '../logic/rng';
import type { FreeWindow } from '../types';

export default function FreeHours() {
  const { state, dispatch } = useStore();
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const mine = state.windows.filter((w) => w.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const set = (list: FreeWindow[]) => dispatch({ type: 'setWindows', windows: list });
  const patch = (id: string, p: Partial<FreeWindow>) => set(state.windows.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const add = () => {
    const last = mine[mine.length - 1];
    const start = last ? Math.min(hmToMin(last.end), 22 * 60) : 18 * 60;
    set([...state.windows, { id: uid(), day, start: minToHm(start), end: minToHm(start + 60), usableMinutes: 60, enabled: true }]);
  };
  const lenOf = (w: FreeWindow) => hmToMin(w.end) - hmToMin(w.start);
  const total = state.windows.reduce((a, w) => a + (w.enabled ? Math.min(w.usableMinutes, Math.max(0, lenOf(w))) : 0), 0);
  return (
    <div className="stack">
      <PageHead title="Free hours" back="/settings" sub={`Usable per week: ${(total / 60).toFixed(1)} h. Only checked windows are scheduled or notified.`} />
      <div className="tabs" role="tablist">{DAY_NAMES.map((d, i) => (
        <button key={d} role="tab" aria-selected={day === i} className={day === i ? 'on' : ''} onClick={() => setDay(i)}>{d}</button>
      ))}</div>
      <section className="panel form">
        {mine.length === 0 && <p className="muted">No windows on {DAY_NAMES[day]}.</p>}
        {mine.map((w) => {
          const len = lenOf(w);
          const opts = Array.from(new Set([...[15, 30, 45, 60, 75, 90, 120, 150, 180].filter((m) => m <= len), len, w.usableMinutes])).filter((m) => m > 0).sort((a, b) => a - b);
          return (
            <div key={w.id} className="win row wrap">
              <label className="check"><input type="checkbox" checked={w.enabled} onChange={(e) => patch(w.id, { enabled: e.target.checked })} aria-label="Free for study/work" /></label>
              <input type="time" value={w.start} onChange={(e) => patch(w.id, { start: e.target.value })} aria-label="Start" />
              <span>–</span>
              <input type="time" value={w.end} onChange={(e) => { const l = hmToMin(e.target.value) - hmToMin(w.start); patch(w.id, { end: e.target.value, usableMinutes: Math.max(0, Math.min(w.usableMinutes, l)) || Math.max(0, l) }); }} aria-label="End" />
              <select value={w.usableMinutes} onChange={(e) => patch(w.id, { usableMinutes: Number(e.target.value) })} aria-label="Usable minutes">{opts.map((m) => <option key={m} value={m}>{m} min</option>)}</select>
              {len <= 0 && <span className="warn">End must be after start</span>}
              <button className="ghost" aria-label="Delete window" onClick={() => set(state.windows.filter((x) => x.id !== w.id))}>✕</button>
            </div>
          );
        })}
        <div className="row wrap">
          <button className="primary" onClick={add}>＋ Add window</button>
          {mine.length > 0 && <button onClick={() => { if (confirm(`Replace every other day’s windows with ${DAY_NAMES[day]}’s?`)) set([...mine, ...[0, 1, 2, 3, 4, 5, 6].filter((d) => d !== day).flatMap((d) => mine.map((w) => ({ ...w, id: uid(), day: d })))]); }}>Copy to all days</button>}
        </div>
      </section>
    </div>
  );
}
