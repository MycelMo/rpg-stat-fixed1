import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { effort, questProgress } from '../logic/progress';
import { fmtMinutes, toDateStr } from '../logic/time';
import { uid } from '../logic/rng';
import { go } from '../router';
import { Chip, Modal, ProgressBar } from './ui';
import { QuestChips } from './QuestBits';

export function QuestDetail({ questId, onClose }: { questId: string; onClose: () => void }) {
  const { state, dispatch, now } = useStore();
  const q = state.quests.find((x) => x.id === questId);
  const [mins, setMins] = useState(30);
  const [msTitle, setMsTitle] = useState('');
  if (!q) return null;
  const e = effort(q, state.logs);
  const pct = questProgress(q, state.logs);
  const sessions = state.sessions.filter((s) => s.questId === q.id && s.status !== 'planned').slice(-6).reverse();
  const save = (patch: Partial<typeof q>) => dispatch({ type: 'saveQuest', quest: { ...q, ...patch }, now: now.toISOString(),
    weekly: undefined });

  return (
    <Modal title={q.title} onClose={onClose} wide>
      <div className="chips"><QuestChips q={q} />{q.status === 'completed' && <Chip tone="ok">Completed</Chip>}</div>
      {q.description && <p className="desc">{q.description}</p>}
      <ProgressBar percent={pct} tone={q.category} label="Progress" right={`${Math.round(pct)}%`} />

      {q.status === 'active' && q.progressMode === 'percent' && (
        <label className="field">Set progress: {q.percent}%
          <input type="range" min={0} max={100} value={q.percent} onChange={(ev) => save({ percent: Number(ev.target.value) })} />
        </label>
      )}
      {q.status === 'active' && q.progressMode === 'count' && (
        <label className="field">Done so far{q.countUnit ? ` (${q.countUnit})` : ''} — target {q.countTarget}
          <input type="number" min={0} value={q.countDone} onChange={(ev) => save({ countDone: Math.max(0, Number(ev.target.value)) })} />
        </label>
      )}
      {q.status === 'active' && q.progressMode === 'milestones' && (
        <div className="field">Milestones
          {q.milestones.map((m) => (
            <label key={m.id} className="check"><input type="checkbox" checked={m.done}
              onChange={() => save({ milestones: q.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} /> {m.title}</label>
          ))}
          <div className="row">
            <input placeholder="Add milestone" value={msTitle} onChange={(ev) => setMsTitle(ev.target.value)} />
            <button onClick={() => { if (msTitle.trim()) { save({ milestones: [...q.milestones, { id: uid(), title: msTitle.trim(), done: false }] }); setMsTitle(''); } }}>Add</button>
          </div>
        </div>
      )}

      <div className="stats3">
        <div><b>{e.estimate != null ? fmtMinutes(e.estimate) : '—'}</b><span>Estimated</span></div>
        <div><b>{fmtMinutes(e.logged)}</b><span>Logged</span></div>
        <div><b>{e.remaining != null ? fmtMinutes(e.remaining) : '—'}</b><span>Remaining</span></div>
      </div>

      {q.status === 'active' && (
        <div className="row">
          <input type="number" min={5} step={5} value={mins} onChange={(ev) => setMins(Number(ev.target.value))} aria-label="Minutes to log" />
          <button onClick={() => dispatch({ type: 'logTime', questId: q.id, minutes: mins, date: toDateStr(now), now: now.toISOString() })}>Log {mins} min</button>
        </div>
      )}

      {sessions.length > 0 && (
        <details><summary>Recent sessions</summary>
          <ul className="plain">{sessions.map((s) => <li key={s.id}>{s.date} {s.start}–{s.end} · {s.status}{s.reason ? ` — ${s.reason}` : ''}{s.loggedMinutes ? ` · ${s.loggedMinutes}m logged` : ''}</li>)}</ul>
        </details>
      )}

      <div className="row end">
        <button className="ghost" onClick={() => { onClose(); go(`/quests/${q.id}`); }}>✎ Edit</button>
        {q.status === 'active'
          ? <button className="primary" onClick={() => { dispatch({ type: 'completeQuest', id: q.id, now: now.toISOString() }); onClose(); }}>Complete quest (+{q.xpReward} XP, +{q.crystalReward} 💎)</button>
          : <button onClick={() => dispatch({ type: 'reopenQuest', id: q.id })}>Reopen</button>}
      </div>
    </Modal>
  );
}
