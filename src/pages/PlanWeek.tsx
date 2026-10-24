import { useEffect } from 'react';
import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { Chip, PageHead } from '../components/ui';
import { capacityCheck, weekPlannedMinutes } from '../logic/capacity';
import { fmtMinutes } from '../logic/time';

export default function PlanWeek() {
  const { state, dispatch, now } = useStore();
  const up = state.weeks.find((w) => w.status === 'upcoming');
  const [ack, setAck] = useState(false);
  const [pick, setPick] = useState('');
  useEffect(() => { if (!up) dispatch({ type: 'planNextWeek', now: now.toISOString() }); }, [up, dispatch, now]);
  if (!up) return null;
  const q = (id: string) => state.quests.find((x) => x.id === id);
  const cap = capacityCheck(weekPlannedMinutes(up), state.windows);
  const onBoard = new Set(up.entries.map((e) => e.questId));
  const addable = state.quests.filter((x) => x.status === 'active' && !onBoard.has(x.id));
  return (
    <div className="stack">
      <PageHead title="Plan next week" sub={`Monday ${up.weekStart} → Sunday. Review, adjust, then confirm.`} />
      <section className="panel">
        <p className="muted">Unfinished quests from this week are carried over automatically when the week ends (with +1 urgency). Anything you finish before then is archived.</p>
        {up.entries.length === 0 && <p className="muted empty">Nothing on next week’s board yet.</p>}
        {up.entries.map((e) => {
          const quest = q(e.questId);
          if (!quest) return null;
          return (
            <div key={e.questId} className="row between wrap slot">
              <div className="grow"><b>{quest.title}</b> <Chip tone={quest.category}>{quest.category}</Chip>{e.carried && <Chip tone="info">carried</Chip>}</div>
              <label className="row">Hours <input type="number" min={0.5} step={0.5} value={e.plannedMinutes / 60} style={{ width: 80 }}
                onChange={(ev) => dispatch({ type: 'setEntry', weekId: up.id, questId: e.questId, minutes: Math.max(30, Math.round(Number(ev.target.value) * 60)) })} /></label>
              <button className="ghost" aria-label={`Remove ${quest.title}`} onClick={() => dispatch({ type: 'removeEntry', weekId: up.id, questId: e.questId })}>✕</button>
            </div>
          );
        })}
        <div className="row wrap">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add existing quest"><option value="">Add an existing quest…</option>{addable.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
          <button disabled={!pick} onClick={() => { dispatch({ type: 'addEntry', weekId: up.id, questId: pick, minutes: 60 }); setPick(''); }}>Add</button>
          <button onClick={() => go('/quests/new')}>＋ New quest</button>
        </div>
      </section>
      <section className="panel">
        <p>Planned <b>{fmtMinutes(cap.plannedMin)}</b> · Free <b>{fmtMinutes(cap.availableMin)}</b> · {cap.over ? <span className="warn">over by {fmtMinutes(-cap.diffMin)}</span> : <span>{fmtMinutes(cap.diffMin)} spare</span>}</p>
        {cap.over && <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand this exceeds my free time and want to keep it anyway</label>}
        <div className="row end"><button className="primary" disabled={cap.over && !ack} onClick={() => { dispatch({ type: 'confirmWeek', weekId: up.id }); go('/'); }}>Confirm next week’s board</button></div>
      </section>
    </div>
  );
}
