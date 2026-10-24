import { createContext, useContext, useEffect, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import type { AppState } from '../types';
import { ensureWeeks, initialState, reduce, type Action } from './reducer';
import { loadState, normalize, saveState, STORAGE_KEY } from './storage';

interface Ctx { state: AppState; dispatch: Dispatch<Action>; now: Date; saveOk: boolean }
const StoreCtx = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(StoreCtx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => {
    const n = new Date();
    const saved = loadState();
    return saved ? ensureWeeks(saved, n) : initialState(n);
  });
  const [now, setNow] = useState(() => new Date());
  const [saveOk, setSaveOk] = useState(true);

  useEffect(() => { setSaveOk(saveState(state)); }, [state]);

  useEffect(() => {
    try { void navigator.storage?.persist?.(); } catch { /* best effort */ }
    const t = () => { const n = new Date(); setNow(n); dispatch({ type: 'tick', now: n.toISOString() }); };
    const id = window.setInterval(t, 15000);
    const vis = () => { if (!document.hidden) t(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Another tab of this site saved something: adopt it, so a stale tab can never overwrite newer data.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = normalize(JSON.parse(e.newValue));
        if (next) dispatch({ type: 'replaceState', state: next, now: new Date().toISOString() });
      } catch { /* unreadable write from elsewhere: keep what this tab has */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    const root = document.documentElement.style;
    if (state.settings.accent) root.setProperty('--accent', state.settings.accent); else root.removeProperty('--accent');
  }, [state.settings.theme, state.settings.accent]);

  return <StoreCtx.Provider value={{ state, dispatch, now, saveOk }}>{children}</StoreCtx.Provider>;
}
