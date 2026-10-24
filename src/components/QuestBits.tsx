import type { Quest } from '../types';
import { urgencyOf, effectivePoints } from '../logic/priority';
import { toDateStr } from '../logic/time';
import { useStore } from '../store/StoreProvider';
import { Chip } from './ui';

export function QuestChips({ q }: { q: Quest }) {
  const { state, now } = useStore();
  const u = urgencyOf(q, state.settings, toDateStr(now));
  return (
    <>
      <Chip tone={q.category}>{q.category === 'main' ? 'Main' : 'Side'}</Chip>
      <Chip>{effectivePoints(q, state.settings)} pt{q.rollovers > 0 ? ` (+${Math.min(q.rollovers * state.settings.bumpPerRollover, state.settings.bumpCap)})` : ''}</Chip>
      {u === 'deadline' && <Chip tone="warn">Deadline!</Chip>}
      {u === 'must' && <Chip tone="must">MUST DO</Chip>}
      {u === 'urgent' && <Chip tone="warn">Urgent</Chip>}
      {q.rollovers > 0 && <Chip tone="info">carried ×{q.rollovers}</Chip>}
      {q.deadline && <Chip>due {q.deadline}</Chip>}
    </>
  );
}
