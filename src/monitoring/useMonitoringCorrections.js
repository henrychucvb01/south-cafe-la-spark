import { useEffect, useState } from 'react';
import { openSession, closeSession, listMonitorings } from '../supperMonitoring/service';

export default function useMonitoringCorrections(location, employee, pin) {
  const [state, setState] = useState({ count: 0, error: false });
  useEffect(() => {
    let cancelled = false, running = false, token;
    setState({ count: 0, error: false });
    async function refresh() {
      if (running || !pin || !location || !employee || document.visibilityState === 'hidden') return;
      running = true;
      try {
        token = token || await openSession(location, employee, pin);
        if (cancelled) return;
        const records = await listMonitorings(token);
        if (!cancelled) setState({ count: records.filter(r => r.monitor_role === 'manager' && r.status === 'corrections_requested' && !r.locked).length, error: false });
      } catch (error) {
        if (/Session expired/i.test(error.message)) { if (token) await closeSession(token).catch(() => {}); token = null; }
        if (!cancelled) setState(previous => ({ ...previous, error: true }));
      } finally {
        if (cancelled && token) { await closeSession(token).catch(() => {}); token = null; }
        running = false;
      }
    }
    refresh();
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; if (!running && token) { closeSession(token).catch(() => {}); token = null; } clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [location, employee, pin]);
  return state;
}
