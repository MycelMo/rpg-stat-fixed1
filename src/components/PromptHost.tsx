import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreProvider';
import { Modal } from './ui';
import { dateTimeOf, toDateStr, DAY_NAMES, dayIndex } from '../logic/time';
import { openWindowsFor } from '../logic/scheduler';

/** In-app prompts: session start (Accept / Reschedule / Defer) and session end (Completed / Incomplete). */
export function PromptHost() {
  const { state, dispatch, now } = useStore();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'ask' | 'defer' | 'resched'>('ask');
  const [reason, setReason] = useState('');
  const [partial, setPartial] = useState(0);
  const notified = useRef<Set<string>>(new Set());

  const today = toDateStr(now);
  const ending = state.sessions.find((s) => s.status === 'accepted' && dateTimeOf(s.date, s.end) <= now && !dismissed.has(s.id + ':end'));
  const starting = state.sessions.find((s) => s.status === 'planned' && s.date === today && dateTimeOf(s.date, s.start) <= now && now < dateTimeOf(s.date, s.end) && !dismissed.has(s.id + ':start'));
  const cur = ending ?? starting;
  const kind = ending ? 'end' : 'start';
  const quest = cur && state.quests.find((q) => q.id === cur.questId);

  useEffect(() => { setMode('ask'); setReason(''); setPartial(0); }, [cur?.id, kind]);

  useEffect(() => {
    if (!cur || !quest || !state.settings.browserNotifications) return;
    const key = cur.id + ':' + kind;
    if (notified.current.has(key) || !('Notification' in window) || Notification.permission !== 'granted') return;
    notified.current.add(key);
    try {
      new Notification('RPG Stat', { body: kind === 'start' ? `${cur.minutes}-minute slot. Quest: ${quest.title}` : `Quest completion status: ${quest.title}` });
    } catch { /* ignore */ }
  }, [cur, quest, kind, state.settings.browserNotifications]);

  if (!cur || !quest) return null;
  const later = () => setDismissed(new Set(dismissed).add(cur.id + ':' + kind));
  const iso = now.toISOString();
  const week = state.weeks.find((w) => w.status === 'active')!;
  const opts = openWindowsFor(quest, week.weekStart, state.windows, state.sessions, now);

  if (kind === 'end') {
    return (
      <Modal title="Quest completion status" onClose={later}>
        <p><b>{quest.title}</b> · {cur.start}–{cur.end}. Did you finish this session?</p>
        <label className="field">If incomplete, minutes you did get done (optional)
          <input type="number" min={0} max={cur.minutes} value={partial} onChange={(e) => setPartial(Number(e.target.value))} /></label>
        <p className="muted small">An incomplete session never marks the whole quest as failed; it stays on your board until the week ends.</p>
        <div className="row end">
          <button onClick={() => dispatch({ type: 'finishSession', id: cur.id, completed: false, minutes: partial, now: iso })}>Incomplete</button>
          <button className="primary" onClick={() => dispatch({ type: 'finishSession', id: cur.id, completed: true, now: iso })}>Completed</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="RPG Stat" onClose={later}>
      <p className="big-p">{cur.minutes}-minute slot.</p>
      <p><b>Quest goal:</b> {quest.title}{quest.description ? ` — ${quest.description}` : ''}</p>
      {mode === 'ask' && (
        <div className="row end wrap">
          <button onClick={() => setMode('defer')}>Defer</button>
          <button onClick={() => setMode('resched')} disabled={opts.length === 0}>Reschedule</button>
          <button className="primary" onClick={() => dispatch({ type: 'acceptSession', id: cur.id, now: iso })}>Accept</button>
        </div>
      )}
      {mode === 'defer' && (
        <div className="stack">
          <p><i>The guild demands a reason.</i></p>
          <div className="chips">{state.settings.deferralReasons.map((r) => (
            <button key={r} className={`chipbtn ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>))}</div>
          <input placeholder="Or write your own (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row end"><button className="ghost" onClick={() => setMode('ask')}>Back</button>
            <button className="primary" onClick={() => dispatch({ type: 'deferSession', id: cur.id, reason, now: iso })}>Defer quest</button></div>
        </div>
      )}
      {mode === 'resched' && (
        <div className="stack">
          <p>Pick another free window (this is not counted as a failure):</p>
          {opts.slice(0, 8).map((o) => (
            <button key={o.windowId + o.date} onClick={() => dispatch({ type: 'rescheduleSession', id: cur.id, windowId: o.windowId, date: o.date, now: iso })}>
              {DAY_NAMES[dayIndex(o.date)]} {o.date} · {o.start}–{o.end}</button>
          ))}
          <button className="ghost" onClick={() => setMode('ask')}>Back</button>
        </div>
      )}
    </Modal>
  );
}
