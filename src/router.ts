import { useEffect, useState } from 'react';

export function useRoute(): string {
  const get = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const f = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}
export const go = (path: string) => { window.location.hash = path; };
