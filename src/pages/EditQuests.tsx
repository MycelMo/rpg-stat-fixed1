import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { Chip, PageHead } from '../components/ui';
import { QuestChips } from '../components/QuestBits';
import { newQuest } from '../store/reducer';
import { defaultRewards } from '../logic/ledger';
import { weeklyAvailableMinutes } from '../logic/capacity';
import type { Category, Intensity, ProgressMode, Quest } from '../types';

export function QuestList() {
  const { state } = useStore();
  const list = state.quests.filter((q) => q.status !== 'deleted');
  return (
    <div className="stack">
      <PageHead title="Edit Quests" />
      <button className="primary big" onClick={() => go('/quests/new')}>＋ Add Quest</button>
      {list.length === 0 && <p className="muted empty">No quests yet.</p>}
      {list.map((q) => (
        <div key={q.id} className="panel row between">
          <div className="grow">
            <b>{q.title}</b> {q.status === 'completed' && <Chip tone="ok">Completed</Chip>}
            <div className="chips"><QuestChips q={q} />{q.isGlobal && <Chip>Global</Chip>}{q.isWeekly && <Chip>Weekly</Chip>}</div>
          </div>
          <button className="ghost pen" aria-label={`Edit ${q.title}`} onClick={() => go(`/quests/${q.id}`)}>✎</button>
        </div>
      ))}
    </div>
  );
}

export function QuestForm({ id }: { id: string }) {
  const { state, dispatch, now } = useStore();
  const existing = id === 'new' ? undefined : state.quests.find((q) => q.id === id);
  const week = state.weeks.find((w) => w.status === 'active')!;
  const entry = existing ? week.entries.find((e) => e.questId === existing.id) : undefined;
  const base = useMemo<Quest>(() => { if (existing) return existing; const q = newQuest({ title: '' }); const r = defaultRewards(q); return { ...q, xpReward: r.xp, crystalReward: r.crystals }; }, [existing]);

  const [f, setF] = useState<Quest>({ ...base });
  const [weeklyHours, setWeeklyHours] = useState<number>(entry ? entry.plannedMinutes / 60 : 1);
  const [target, setTarget] = useState<'current' | 'next'>('current');
  const [rewardsTouched, setRewardsTouched] = useState(!!existing);
  const [err, setErr] = useState('');
  const set = (p: Partial<Quest>) => {
    const n = { ...f, ...p };
    if (!rewardsTouched) { const r = defaultRewards(n); n.xpReward = r.xp; n.crystalReward = r.crystals; }
    setF(n);
  };

  if (id !== 'new' && !existing) return <div className="stack"><PageHead title="Quest not found" back="/quests" /></div>;

  const weeklyCount = week.entries.filter((e) => state.quests.find((q) => q.id === e.questId)?.status !== 'deleted').length + (f.isWeekly && !entry ? 1 : 0);
  const maxRating = f.isWeekly ? Math.max(1, weeklyCount) : 10; // rule R5
  const ratings = Array.from({ length: Math.max(maxRating, f.rating) }, (_, i) => i + 1);
  const availH = weeklyAvailableMinutes(state.windows) / 60;
  const hourOpts: number[] = [];
  for (let h = 0.5; h <= Math.max(availH, weeklyHours, 1) + 1e-9; h += 0.5) hourOpts.push(h);

  const submit = () => {
    if (!f.title.trim()) return setErr('Give the quest a title.');
    if (!f.isGlobal && !f.isWeekly) return setErr('Choose Global, Weekly, or both.');
    if (f.isWeekly && !(weeklyHours > 0)) return setErr('Weekly quests need hours for this week.');
    if (f.progressMode === 'count' && !(f.countTarget > 0)) return setErr('Counter progress needs a target number.');
    if (f.progressMode === 'hours' && !(f.estimateHours && f.estimateHours > 0)) return setErr('Hours-based progress needs a total estimate.');
    if (f.minSessionMin > f.preferredSessionMin) return setErr('Minimum session cannot be longer than the preferred session.');
    dispatch({
      type: 'saveQuest', quest: { ...f, title: f.title.trim() }, now: now.toISOString(),
      weekly: f.isWeekly ? { target, minutes: Math.round(weeklyHours * 60) } : undefined,
    });
    go('/quests');
  };

  return (
    <div className="stack">
      <PageHead title={existing ? 'Edit Quest' : 'Add Quest'} back="/quests" />
      <form className="panel form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="field">Quest title<input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. CP Div 2" /></label>
        <label className="field">Quest description<textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Compete in CP Div 2 and solve A, B, C" /></label>

        <fieldset><legend>Type (both allowed)</legend>
          <label className="check"><input type="checkbox" checked={f.isGlobal} onChange={(e) => set({ isGlobal: e.target.checked })} /> Global</label>
          <label className="check"><input type="checkbox" checked={f.isWeekly} onChange={(e) => set({ isWeekly: e.target.checked })} /> Weekly</label>
        </fieldset>
        <fieldset><legend>Importance category (one)</legend>
          {(['main', 'side'] as Category[]).map((c) => (
            <label key={c} className="check"><input type="radio" name="cat" checked={f.category === c} onChange={() => set({ category: c })} /> {c === 'main' ? 'Main' : 'Side'}</label>
          ))}
        </fieldset>

        {f.isWeekly && (
          <div className="grid2">
            <label className="field">Hours this week
              <select value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))}>
                {hourOpts.map((h) => <option key={h} value={h}>{h} h</option>)}
              </select>
              <small className="muted">{availH > 0 ? `Free time defined: ${availH.toFixed(1)} h/week` : 'No free windows defined yet'}</small>
            </label>
            <label className="field">Add to
              <select value={target} onChange={(e) => setTarget(e.target.value as 'current' | 'next')}>
                <option value="current">This week’s board</option><option value="next">Next week’s board</option>
              </select>
            </label>
          </div>
        )}

        <label className="field">Importance rating (higher = more important)
          <select value={f.rating} onChange={(e) => set({ rating: Number(e.target.value) })}>{ratings.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <small className="muted">{f.isWeekly ? `Scale 1–${maxRating} (number of weekly quests). Repeats allowed.` : 'Scale 1–10 for global-only quests.'}</small>
        </label>

        <div className="grid2">
          <label className="field">Total estimated effort (hours, optional)
            <input type="number" min={0} step={0.5} value={f.estimateHours ?? ''} onChange={(e) => set({ estimateHours: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          <label className="field">Deadline (optional)
            <input type="date" value={f.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} /></label>
        </div>

        <fieldset><legend>How is progress measured?</legend>
          <select value={f.progressMode} onChange={(e) => set({ progressMode: e.target.value as ProgressMode })}>
            <option value="percent">Manual percentage</option>
            <option value="count">Counter (done out of a target you set)</option>
            <option value="hours">Hours logged ÷ estimate</option>
            <option value="milestones">Milestones checklist</option>
          </select>
          {f.progressMode === 'count' && (
            <div className="grid2">
              <label className="field">Target<input type="number" min={1} value={f.countTarget || ''} onChange={(e) => set({ countTarget: Number(e.target.value) })} /></label>
              <label className="field">Unit<input value={f.countUnit} onChange={(e) => set({ countUnit: e.target.value })} placeholder="problems" /></label>
            </div>
          )}
          {f.progressMode === 'milestones' && !existing && <small className="muted">Add milestones after saving, from the quest’s details.</small>}
        </fieldset>

        <details><summary>Scheduling &amp; rewards (advanced)</summary>
          <div className="grid2">
            <label className="field">Preferred session (min)<input type="number" min={5} step={5} value={f.preferredSessionMin} onChange={(e) => set({ preferredSessionMin: Number(e.target.value) })} /></label>
            <label className="field">Minimum useful session (min)<input type="number" min={5} step={5} value={f.minSessionMin} onChange={(e) => set({ minSessionMin: Number(e.target.value) })} /></label>
            <label className="field">Intensity
              <select value={f.intensity} onChange={(e) => set({ intensity: e.target.value as Intensity })}>
                <option value="light">Light</option><option value="moderate">Moderate</option><option value="deep">Deep focus</option>
              </select></label>
            <label className="check"><input type="checkbox" checked={f.pausable} onChange={(e) => set({ pausable: e.target.checked })} /> Can be paused easily</label>
            <label className="field">XP reward<input type="number" min={0} value={f.xpReward} onChange={(e) => { setRewardsTouched(true); setF({ ...f, xpReward: Number(e.target.value) }); }} /></label>
            <label className="field">Crystal reward<input type="number" min={0} value={f.crystalReward} onChange={(e) => { setRewardsTouched(true); setF({ ...f, crystalReward: Number(e.target.value) }); }} /></label>
          </div>
        </details>

        {err && <p className="warn" role="alert">{err}</p>}
        <div className="row end">
          {existing && existing.status !== 'deleted' && (
            <button type="button" className="danger" onClick={() => { if (confirm('Delete this quest? Its history is kept in logs but it disappears from lists.')) { dispatch({ type: 'deleteQuest', id: existing.id }); go('/quests'); } }}>Delete</button>
          )}
          <button type="submit" className="primary">{existing ? 'Save changes' : 'Add quest'}</button>
        </div>
      </form>
    </div>
  );
}

