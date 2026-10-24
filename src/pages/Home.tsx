import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { ProgressBar, Chip } from '../components/ui';
import { QuestChips } from '../components/QuestBits';
import { QuestDetail } from '../components/QuestDetail';
import { effectivePoints } from '../logic/priority';
import { capacityCheck, weekPlannedMinutes } from '../logic/capacity';
import { globalProgress, questProgress } from '../logic/progress';
import { fmtMinutes, toDateStr } from '../logic/time';
import type { Category } from '../types';

export default function Home() {
  const { state, dispatch, now } = useStore();
  const [detail, setDetail] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const week = state.weeks.find((w) => w.status === 'active')!;
  const upcoming = state.weeks.find((w) => w.status === 'upcoming');
  const qOf = (id: string) => state.quests.find((q) => q.id === id)!;
  const entries = week.entries
    .filter((e) => qOf(e.questId) && qOf(e.questId).status !== 'deleted')
    .sort((a, b) => Number(a.done) - Number(b.done) || effectivePoints(qOf(b.questId), state.settings) - effectivePoints(qOf(a.questId), state.settings));
  const cap = capacityCheck(weekPlannedMinutes(week), state.windows);
  const sunPlanning = now.getDay() === 0 && now.getHours() >= 17;
  const today = toDateStr(now);
  const nextSession = state.sessions
    .filter((s) => s.status === 'planned' && `${s.date} ${s.end}` > `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];

  const bar = (cat: Category) => {
    const g = globalProgress(state.quests, state.logs, cat, state.settings);
    return <ProgressBar key={cat} tone={cat} label={cat === 'main' ? 'Main quests' : 'Side quests'} percent={g.percent}
      right={`${g.done}/${g.total} done · ${g.percent}%`} />;
  };
  const globals = (cat: Category) => state.quests.filter((q) => q.isGlobal && q.category === cat && q.status === 'active');

  return (
    <div className="stack">
      {(sunPlanning || upcoming) && (
        <div className="banner">
          <span>{upcoming ? (upcoming.confirmed ? 'Next week’s board is confirmed.' : 'Next week’s board is drafted but not confirmed.') : 'It’s Sunday evening — time to plan next week (5 PM – midnight).'}</span>
          <button className="primary" onClick={() => go('/plan')}>{upcoming?.confirmed ? 'Review' : 'Plan next week'}</button>
        </div>
      )}
      {!week.confirmed && (
        <div className="banner"><span>This week’s board was built automatically from last week. Please review it.</span>
          <button onClick={() => dispatch({ type: 'confirmWeek', weekId: week.id })}>Looks good</button></div>
      )}

      <section className="panel board">
        <div className="panel-title"><h1>Weekly Quests</h1><span className="muted">{week.weekStart} → Sun, due 23:59</span></div>
        {entries.length === 0 && <p className="muted empty">No weekly quests yet. Open <b>Edit Quests</b> to add your first one.</p>}
        <ol className="board-list">
          {entries.map((e, i) => {
            const q = qOf(e.questId);
            const pct = questProgress(q, state.logs);
            return (
              <li key={q.id} className={e.done ? 'done' : ''}>
                <label className="tick" aria-label={`Mark ${q.title} complete`}>
                  <input type="checkbox" checked={e.done} onChange={(ev) => dispatch({ type: 'toggleEntry', questId: q.id, done: ev.target.checked, now: now.toISOString() })} />
                </label>
                <div className="grow">
                  <div className="title-row"><button className="linklike" onClick={() => setDetail(q.id)}>{i + 1}. {q.title}</button>
                    <span className="muted">{fmtMinutes(e.plannedMinutes)} this week</span></div>
                  <div className="chips"><QuestChips q={q} />{e.carried && <Chip tone="info">carried over</Chip>}</div>
                  {q.description && <p className="desc">{q.description}</p>}
                  {!e.done && q.status === 'active' && <ProgressBar percent={pct} tone={q.category} />}
                </div>
              </li>
            );
          })}
        </ol>
        {cap.over && <p className="warn">⚠ Planned {fmtMinutes(cap.plannedMin)} but only {fmtMinutes(cap.availableMin)} of free time ({fmtMinutes(-cap.diffMin)} over). Adjust hours or free windows.</p>}
        {nextSession && (() => { const q = qOf(nextSession.questId); return q ? <p className="next">⏳ Next session: <b>{q.title}</b> · {nextSession.date} {nextSession.start}–{nextSession.end}</p> : null; })()}
      </section>

      <section className="panel">
        <div className="panel-title"><h2>Global Quests Progress</h2>
          <button onClick={() => go('/archive')}>Completed Quests</button></div>
        {bar('main')}
        {bar('side')}
        {(['main', 'side'] as Category[]).map((cat) => globals(cat).length > 0 && (
          <div key={cat} className="glist">
            <h3>{cat === 'main' ? 'Main' : 'Side'} quests</h3>
            {globals(cat).map((q) => (
              <div key={q.id} className="gitem">
                <button className="linklike" aria-expanded={!!open[q.id]} onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}>{open[q.id] ? '▾' : '▸'} {q.title}</button>
                <span className="muted">{Math.round(questProgress(q, state.logs))}%</span>
                {open[q.id] && <div className="gbody">{q.description && <p className="desc">{q.description}</p>}
                  <div className="chips"><QuestChips q={q} /></div>
                  <button onClick={() => setDetail(q.id)}>Update progress</button></div>}
              </div>
            ))}
          </div>
        ))}
      </section>
      {detail && <QuestDetail questId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
