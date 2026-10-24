import { useStore } from '../store/StoreProvider';
import { PageHead } from '../components/ui';

export default function Rejections() {
  const { state } = useStore();
  const list = state.sessions.filter((s) => s.status === 'deferred').sort((a, b) => (b.respondedAt ?? '').localeCompare(a.respondedAt ?? ''));
  const missed = state.sessions.filter((s) => s.status === 'missed').length;
  const resched = state.sessions.filter((s) => s.status === 'rescheduled').length;
  const title = (id: string) => state.quests.find((q) => q.id === id)?.title ?? '(deleted quest)';
  const counts = new Map<string, number>();
  list.forEach((s) => counts.set(s.reason || '(no reason given)', (counts.get(s.reason || '(no reason given)') ?? 0) + 1));
  return (
    <div className="stack">
      <PageHead title="Rejections" back="/profile" sub="The guild keeps a record of every deferred session." />
      <p className="muted">Deferred: <b>{list.length}</b> · Rescheduled: <b>{resched}</b> · Unanswered (missed): <b>{missed}</b></p>
      {counts.size > 0 && <section className="panel"><h2>By reason</h2><ul className="plain">{[...counts].sort((a, b) => b[1] - a[1]).map(([r, n]) => <li key={r} className="row between"><span>{r}</span><b>{n}</b></li>)}</ul></section>}
      {list.length === 0 && <p className="muted empty">No deferrals recorded.</p>}
      {list.map((s) => (
        <div key={s.id} className="panel"><b>{title(s.questId)}</b> <span className="muted">· {s.date} {s.start}–{s.end}</span>
          <p>“{s.reason || 'No reason given'}”</p></div>
      ))}
    </div>
  );
}
