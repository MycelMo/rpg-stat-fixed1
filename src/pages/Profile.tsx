import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { PageHead, ProgressBar } from '../components/ui';
import { crystalBalance, xpTotal } from '../logic/ledger';
import { levelFromXp } from '../logic/levels';
import { globalProgress } from '../logic/progress';

export default function Profile() {
  const { state } = useStore();
  const lv = levelFromXp(xpTotal(state.ledger));
  const running = (c: 'main' | 'side') => state.quests.filter((q) => q.status === 'active' && q.category === c).length;
  const gm = globalProgress(state.quests, state.logs, 'main', state.settings);
  const gs = globalProgress(state.quests, state.logs, 'side', state.settings);
  return (
    <div className="stack">
      <PageHead title="Profile" />
      <section className="panel hero">
        <div className="avatar" aria-hidden>⚔</div>
        <div className="grow">
          <h2>{state.settings.name || 'Adventurer'}</h2>
          <div className="level">Level <b>{lv.level}</b></div>
          <ProgressBar percent={(lv.xpInto / lv.xpNeeded) * 100} label="XP" right={`${lv.xpInto} / ${lv.xpNeeded} to next level`} />
          <div className="crystals">💎 <b>{crystalBalance(state.ledger)}</b> crystals</div>
        </div>
      </section>
      <section className="panel">
        <h2>Global progress</h2>
        <ProgressBar tone="main" label="Main quests" percent={gm.percent} right={`${gm.done}/${gm.total} · ${gm.percent}%`} />
        <ProgressBar tone="side" label="Side quests" percent={gs.percent} right={`${gs.done}/${gs.total} · ${gs.percent}%`} />
        <p className="muted">Running quests — Main: <b>{running('main')}</b> · Side: <b>{running('side')}</b></p>
      </section>
      <div className="grid2">
        <button className="big" onClick={() => go('/shop')}>🛒 Shop</button>
        <button className="big" onClick={() => go('/settings')}>⚙ Settings</button>
        <button className="big" onClick={() => go('/rejections')}>📜 Rejections</button>
        <button className="big" onClick={() => go('/schedule')}>🗓 Schedule</button>
      </div>
    </div>
  );
}
