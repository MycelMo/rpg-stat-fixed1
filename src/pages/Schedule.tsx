import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { Chip, PageHead, ProgressBar } from '../components/ui';
import { capacityCheck, weekPlannedMinutes } from '../logic/capacity';
import { fits, instancesForWeek } from '../logic/scheduler';
import { DAY_NAMES, dateTimeOf, dayIndex, fmtMinutes } from '../logic/time';

export default function Schedule() {
  const { state, dispatch, now } = useStore();
  const week = state.weeks.find((w) => w.status === 'active')!;
  const inst = instancesForWeek(week.weekStart, state.windows);
  const cap = capacityCheck(weekPlannedMinutes(week), state.windows);
  const eligible = week.entries.filter((e) => !e.done).map((e) => state.quests.find((q) => q.id === e.questId)).filter((q) => q && q.status === 'active') as typeof state.quests;
  const title = (id: string) => state.quests.find((q) => q.id === id)?.title ?? '(deleted quest)';
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="stack">
      <PageHead title="Schedule" sub={`Week of ${week.weekStart}`} />
      <section className="panel">
        <ProgressBar percent={cap.availableMin ? (cap.plannedMin / cap.availableMin) * 100 : cap.plannedMin ? 100 : 0} label="Planned vs available"
          right={`${fmtMinutes(cap.plannedMin)} planned / ${fmtMinutes(cap.availableMin)} free`} />
        {cap.over
          ? <p className="warn">⚠ Over capacity by {fmtMinutes(-cap.diffMin)}. Lower some hours on the board or add free windows — nothing is auto-trimmed.</p>
          : <p className="muted">{fmtMinutes(cap.diffMin)} of free time spare.</p>}
        <div className="row wrap"><button className="primary" onClick={() => dispatch({ type: 'replan', now: now.toISOString() })}>Recommend sessions</button>
          <button onClick={() => go('/free-hours')}>Edit free hours</button></div>
        <p className="muted small">Recommends a quest for each free, upcoming window using importance, urgency, deadline and fit. Accepted or manually chosen sessions are kept.</p>
      </section>
      {state.windows.length === 0 && <p className="muted empty">No free windows yet. Add some under Settings → Free hours.</p>}
      {days.map((d) => {
        const rows = inst.filter((i) => dayIndex(i.date) === d);
        if (!rows.length) return null;
        return (
          <section key={d} className="panel"><h2>{DAY_NAMES[d]} <span className="muted">{rows[0].date}</span></h2>
            {rows.map((i) => {
              const sess = state.sessions.filter((s) => s.windowId === i.windowId && s.date === i.date && s.weekStart === week.weekStart).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const past = dateTimeOf(i.date, i.start) <= now;
              const editable = !past && (!sess || sess.status === 'planned' || sess.status === 'missed' || sess.status === 'deferred' || sess.status === 'rescheduled');
              const current = sess?.status === 'planned' ? sess.questId : '';
              return (
                <div key={i.windowId + i.date} className="slot row wrap">
                  <b>{i.start}–{i.end}</b><span className="muted">{i.usable} min usable</span>
                  {editable ? (
                    <select value={current} aria-label={`Quest for ${i.date} ${i.start}`} onChange={(e) => dispatch({ type: 'assignSession', windowId: i.windowId, date: i.date, questId: e.target.value, now: now.toISOString() })}>
                      <option value="">— nothing —</option>
                      {eligible.map((q) => <option key={q.id} value={q.id} disabled={!fits(q, i.usable)}>{q.title}{fits(q, i.usable) ? '' : ' (window too short)'}</option>)}
                    </select>
                  ) : sess ? <span>{title(sess.questId)}</span> : <span className="muted">unused</span>}
                  {sess && <Chip tone={sess.status === 'completed' ? 'ok' : sess.status === 'deferred' ? 'warn' : undefined}>{sess.status === 'planned' ? `${sess.minutes} min` : sess.status}</Chip>}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
