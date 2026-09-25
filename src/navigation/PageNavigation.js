import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import './pageNavigation.css';

const NavigationContext = createContext(null);

// Register logical destinations, never browser history. More deeply nested
// workspaces use a higher level; unmounting restores the enclosing destination.
export function usePageNavigation({ title, destination, onNavigate, disabled = false, active = true, level = 1 }) {
  const register = useContext(NavigationContext);
  const id = useRef(Symbol('page-navigation'));
  const action = useRef(onNavigate);
  action.current = onNavigate;
  useLayoutEffect(() => {
    if (!register || !active) return;
    return register(id.current, { title, destination, disabled, level, navigate: () => action.current?.() });
  }, [register, title, destination, disabled, active, level]);
}

export default function PageNavigationProvider({ children }) {
  const [entries, setEntries] = useState(new Map());
  const register = useCallback((id, entry) => {
    setEntries(current => new Map(current).set(id, entry));
    return () => setEntries(current => { const next = new Map(current); next.delete(id); return next; });
  }, []);
  const current = [...entries.values()].sort((a, b) => b.level - a.level)[0];
  return <NavigationContext.Provider value={register}>
    <div className={current ? 'spark-navigation-layout' : undefined}>
      {current && <nav className="spark-page-navigation" aria-label="SPARK page navigation">
        {current.destination && <button type="button" disabled={current.disabled} onClick={current.navigate}>← {current.destination}</button>}
        <span className="spark-page-navigation-title">{current.title}</span>
        <button type="button" className="spark-page-top" onClick={() => window.scrollTo({ top: 0, behavior: 'auto' })}>↑ Top<span className="spark-nav-sr-only"> — Back to Top</span></button>
      </nav>}
      {children}
    </div>
  </NavigationContext.Provider>;
}
