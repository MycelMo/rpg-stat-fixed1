import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { Chip, PageHead } from '../components/ui';
import { fmtMinutes } from '../logic/time';
import type { Category } from '../types';

export default function Archive() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<'quests' | 'weeks'>('quests');
  const done = state.quests.filter((q) => q.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const closed = state.weeks.filter((w) => w.status === 'closed').sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const title = (id: string) => state.quests.find((q) => q.id === id)?.title ?? '(deleted quest)';
  return (
    <div className="stack">
      <PageHead title="Completed Quests" />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'quests'} className={tab === 'quests' ? 'on' : ''} onClick={() => setTab('quests')}>Quests</button>
        <button role="tab" aria-selected={tab === 'weeks'} className={tab === 'weeks' ? 'on' : ''} onClick={() => setTab('weeks')}>Past weeks</button>
      </div>
      {tab === 'quests' && (['main', 'side'] as Category[]).map((cat) => {
        const list = done.filter((q) => q.category === cat);
        return (
          <section key={cat} className="panel">
            <h2>{cat === 'main' ? 'Main quests' : 'Side quests'}</h2>
            {list.length === 0 && <p className="muted">Nothing completed yet.</p>}
            {list.map((q) => (
              <div key={q.id} className="gitem">
                <div className="row between"><b>{q.title}</b><span className="muted">{q.completedAt?.slice(0, 10)}</span></div>
                {q.description && <p className="desc">{q.description}</p>}
                <div className="row"><Chip tone="ok">+{q.xpReward} XP</Chip><Chip>+{q.crystalReward} 💎</Chip>
                  <button className="ghost" onClick={() => dispatch({ type: 'reopenQuest', id: q.id })}>Reopen</button></div>
              </div>
            ))}
          </section>
        );
      })}
      {tab === 'weeks' && (closed.length === 0 ? <p className="muted empty">No finished weeks yet. Past boards are kept here after each rollover.</p> :
        closed.map((w) => (
          <section key={w.id} className="panel">
            <h2>Week of {w.weekStart}</h2>
            <p className="muted">{w.entries.filter((e) => e.done).length}/{w.entries.length} completed · carried over: {w.carriedQuestIds?.length ?? 0}</p>
            <ul className="plain">{w.entries.map((e) => (
              <li key={e.questId}>{e.done ? '✅' : '↪'} {title(e.questId)} <span className="muted">({fmtMinutes(e.plannedMinutes)} planned)</span></li>
            ))}</ul>
          </section>
        )))}
    </div>
  );
}
