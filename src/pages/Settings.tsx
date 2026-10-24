import { useRef, useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { go } from '../router';
import { PageHead } from '../components/ui';
import { initialState } from '../store/reducer';
import { normalize } from '../store/storage';
import type { ThemeId } from '../types';

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'black', label: 'Black' }, { id: 'cream', label: 'Cream' }, { id: 'red', label: 'Red' },
  { id: 'forest', label: 'Forest' }, { id: 'midnight', label: 'Midnight' },
];

export default function Settings() {
  const { state, dispatch, now } = useStore();
  const s = state.settings;
  const up = (patch: Partial<typeof s>) => dispatch({ type: 'updateSettings', patch });
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [newReason, setNewReason] = useState('');

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rpg-stat-backup-${now.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const data = normalize(JSON.parse(await f.text()));
      if (!data) throw new Error('bad file');
      dispatch({ type: 'replaceState', state: data, now: new Date().toISOString() });
      setMsg('Backup restored.');
    } catch { setMsg('That file is not a valid RPG Stat backup.'); }
  };
  const askNotify = async () => {
    if (!('Notification' in window)) return setMsg('This browser does not support notifications.');
    const p = await Notification.requestPermission();
    up({ browserNotifications: p === 'granted' });
    setMsg(p === 'granted' ? 'Notifications on (only while this tab is open).' : 'Permission was not granted.');
  };

  return (
    <div className="stack">
      <PageHead title="Settings" back="/profile" />
      <section className="panel form"><h2>Personal info</h2>
        <label className="field">Name<input value={s.name} onChange={(e) => up({ name: e.target.value })} /></label>
      </section>

      <section className="panel form"><h2>Theme</h2>
        <div className="themes">{THEMES.map((t) => (
          <button key={t.id} data-t={t.id} className={`theme-sw ${s.theme === t.id ? 'on' : ''}`} aria-pressed={s.theme === t.id} onClick={() => up({ theme: t.id })}>{t.label}</button>
        ))}</div>
        <label className="field">Accent colour
          <div className="row"><input type="color" value={s.accent || '#c9a227'} onChange={(e) => up({ accent: e.target.value })} />
            <button className="ghost" onClick={() => up({ accent: '' })}>Reset</button></div></label>
      </section>

      <section className="panel"><h2>Free hours</h2>
        <p className="muted">Mark only the windows you actually want to use for quests — not your class timetable.</p>
        <button className="primary" onClick={() => go('/free-hours')}>Upload free hours</button></section>

      <section className="panel form"><h2>Quest rules</h2>
        <div className="grid2">
          <label className="field">Main-quest threshold <em>p</em><input type="number" min={1} value={s.mainThreshold} onChange={(e) => up({ mainThreshold: Number(e.target.value) })} />
            <small className="muted">Side quests become Urgent at p; main quests become MUST at p+2.</small></label>
          <label className="field">Points added per rollover<input type="number" min={0} value={s.bumpPerRollover} onChange={(e) => up({ bumpPerRollover: Number(e.target.value) })} /></label>
          <label className="field">Max rollover bonus (cap)<input type="number" min={0} value={s.bumpCap} onChange={(e) => up({ bumpCap: Number(e.target.value) })} /></label>
          <label className="field">Session picker
            <select value={s.selectionMode} onChange={(e) => up({ selectionMode: e.target.value as 'weighted' | 'top' })}>
              <option value="weighted">Weighted random (notebook)</option><option value="top">Always highest score</option></select></label>
          <label className="field">Global progress
            <select value={s.aggregation} onChange={(e) => up({ aggregation: e.target.value as 'average' | 'weighted' })}>
              <option value="average">Simple average (notebook)</option><option value="weighted">Weighted by estimated hours</option></select></label>
        </div>
      </section>

      <section className="panel form"><h2>Deferral reasons</h2>
        <ul className="plain">{s.deferralReasons.map((r, i) => (
          <li key={i} className="row"><input value={r} onChange={(e) => up({ deferralReasons: s.deferralReasons.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button className="ghost" aria-label="Remove reason" onClick={() => up({ deferralReasons: s.deferralReasons.filter((_, j) => j !== i) })}>✕</button></li>
        ))}</ul>
        <div className="row"><input placeholder="Add a reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
          <button onClick={() => { if (newReason.trim()) { up({ deferralReasons: [...s.deferralReasons, newReason.trim()] }); setNewReason(''); } }}>Add</button></div>
      </section>

      <section className="panel"><h2>Reminders</h2>
        <p className="muted">Session prompts appear in the app while it is open. Optionally also show a browser notification (works only while the tab is open — this is a normal website, not an installed app).</p>
        <button onClick={askNotify}>{s.browserNotifications ? 'Browser notifications: on' : 'Enable browser notifications'}</button>
        {s.browserNotifications && <button className="ghost" onClick={() => up({ browserNotifications: false })}>Turn off</button>}
      </section>

      <section className="panel"><h2>Your data</h2>
        <p className="muted">Everything is saved in this browser on this device. Export a backup now and then — clearing site data deletes it.</p>
        <div className="row wrap"><button onClick={exportData}>Export backup</button>
          <button onClick={() => file.current?.click()}>Import backup</button>
          <button className="danger" onClick={() => { if (confirm('Erase ALL quests, XP and settings on this device?')) dispatch({ type: 'replaceState', state: initialState(new Date()), now: new Date().toISOString() }); }}>Erase everything</button></div>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ''; }} />
        {msg && <p role="status">{msg}</p>}
      </section>
    </div>
  );
}
