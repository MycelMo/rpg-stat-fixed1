import { useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { PageHead } from '../components/ui';
import { crystalBalance } from '../logic/ledger';

export default function Shop() {
  const { state, dispatch, now } = useStore();
  const bal = crystalBalance(state.ledger);
  const [edit, setEdit] = useState(false);
  const [nr, setNr] = useState({ name: '', description: '', cost: 5 });
  const rewards = state.rewards.filter((r) => !r.archived);
  return (
    <div className="stack">
      <PageHead title="Reward Shop" back="/profile" sub="Spend crystals on real-world rewards you define." />
      <div className="panel row between"><span className="crystals">💎 <b>{bal}</b> crystals</span>
        <button className="ghost pen" aria-label="Edit shop" aria-pressed={edit} onClick={() => setEdit(!edit)}>✎ {edit ? 'Done' : 'Edit'}</button></div>
      {rewards.length === 0 && <p className="muted empty">The shop is empty. Tap ✎ to add your first reward.</p>}
      {rewards.map((r) => (
        <div key={r.id} className="panel">
          {edit ? (
            <div className="form">
              <label className="field">Name<input value={r.name} onChange={(e) => dispatch({ type: 'updateReward', id: r.id, patch: { name: e.target.value } })} /></label>
              <label className="field">Description<input value={r.description} onChange={(e) => dispatch({ type: 'updateReward', id: r.id, patch: { description: e.target.value } })} /></label>
              <label className="field">Cost (crystals)<input type="number" min={1} value={r.cost} onChange={(e) => dispatch({ type: 'updateReward', id: r.id, patch: { cost: Math.max(1, Number(e.target.value)) } })} /></label>
              <button className="danger" onClick={() => dispatch({ type: 'updateReward', id: r.id, patch: { archived: true } })}>Remove from shop</button>
            </div>
          ) : (
            <div className="row between">
              <div><b>{r.name}</b><p className="muted">{r.description}</p></div>
              <button className="primary" disabled={bal < r.cost} onClick={() => dispatch({ type: 'redeem', rewardId: r.id, now: now.toISOString() })}>Redeem · {r.cost} 💎</button>
            </div>
          )}
        </div>
      ))}
      {edit && (
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); if (nr.name.trim() && nr.cost > 0) { dispatch({ type: 'addReward', reward: { ...nr, name: nr.name.trim() } }); setNr({ name: '', description: '', cost: 5 }); } }}>
          <h3>Add reward</h3>
          <label className="field">Name<input value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} placeholder="e.g. Movie night" /></label>
          <label className="field">Description<input value={nr.description} onChange={(e) => setNr({ ...nr, description: e.target.value })} /></label>
          <label className="field">Cost (crystals)<input type="number" min={1} value={nr.cost} onChange={(e) => setNr({ ...nr, cost: Number(e.target.value) })} /></label>
          <button className="primary" type="submit">Add to shop</button>
        </form>
      )}
      <section className="panel"><h2>Crystal history</h2>
        {state.ledger.filter((l) => l.kind === 'crystal').length === 0 && <p className="muted">No transactions yet.</p>}
        <ul className="plain">{[...state.ledger].filter((l) => l.kind === 'crystal').reverse().map((l) => (
          <li key={l.id} className="row between"><span>{l.reason}</span><b className={l.amount < 0 ? 'neg' : 'pos'}>{l.amount > 0 ? '+' : ''}{l.amount} 💎</b></li>
        ))}</ul>
      </section>
    </div>
  );
}
