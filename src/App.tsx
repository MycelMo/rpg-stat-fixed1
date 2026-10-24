import { useEffect, useRef } from 'react';
import { useRoute, go } from './router';
import { useStore } from './store/StoreProvider';
import { PromptHost } from './components/PromptHost';
import { crystalBalance, xpTotal } from './logic/ledger';
import { levelFromXp } from './logic/levels';
import Home from './pages/Home';
import { QuestList, QuestForm } from './pages/EditQuests';
import Archive from './pages/Archive';
import Profile from './pages/Profile';
import Shop from './pages/Shop';
import Settings from './pages/Settings';
import FreeHours from './pages/FreeHours';
import Rejections from './pages/Rejections';
import Schedule from './pages/Schedule';
import PlanWeek from './pages/PlanWeek';

const SWIPE_ORDER = ['/', '/schedule', '/profile'];

export default function App() {
  const route = useRoute();
  const { state, saveOk } = useStore();
  const lv = levelFromXp(xpTotal(state.ledger));
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Horizontal swipe moves between Home ⇄ Schedule ⇄ Profile (rule R10).
  useEffect(() => {
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,select,textarea,.overlay,.tabs')) { touch.current = null; return; }
      touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const end = (e: TouchEvent) => {
      const s = touch.current; touch.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const i = SWIPE_ORDER.indexOf(window.location.hash.replace(/^#/, '') || '/');
      if (i < 0) return;
      const n = i + (dx < 0 ? 1 : -1);
      if (n >= 0 && n < SWIPE_ORDER.length) go(SWIPE_ORDER[n]);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchend', end, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchend', end); };
  }, []);

  let page;
  if (route === '/') page = <Home />;
  else if (route === '/quests') page = <QuestList />;
  else if (route.startsWith('/quests/')) page = <QuestForm key={route} id={route.slice(8)} />;
  else if (route === '/archive') page = <Archive />;
  else if (route === '/profile') page = <Profile />;
  else if (route === '/shop') page = <Shop />;
  else if (route === '/settings') page = <Settings />;
  else if (route === '/free-hours') page = <FreeHours />;
  else if (route === '/rejections') page = <Rejections />;
  else if (route === '/schedule') page = <Schedule />;
  else if (route === '/plan') page = <PlanWeek />;
  else page = <Home />;

  return (
    <>
      <header className="topbar">
        <button className="ghost" onClick={() => go('/quests')}>✎ Edit Quests</button>
        <button className="brand" onClick={() => go('/')}>RPG STAT</button>
        <button className="ghost" onClick={() => go('/profile')} aria-label="Profile">Lv {lv.level} · 💎{crystalBalance(state.ledger)} ☺</button>
      </header>
      {!saveOk && <div className="banner warnbar">Couldn’t save to this browser (private mode or storage full?). Your changes will be lost on refresh — export a backup in Settings.</div>}
      <main className="page">{page}</main>
      <nav className="tabbar" aria-label="Main">
        <button className={route === '/' ? 'on' : ''} onClick={() => go('/')}>Quests</button>
        <button className={route === '/schedule' ? 'on' : ''} onClick={() => go('/schedule')}>Schedule</button>
        <button className={route === '/profile' ? 'on' : ''} onClick={() => go('/profile')}>Profile</button>
      </nav>
      <PromptHost />
    </>
  );
}
