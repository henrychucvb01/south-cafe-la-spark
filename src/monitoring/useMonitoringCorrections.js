import { useEffect, useState } from 'react';
import { openSession, closeSession, correctionCount } from '../supperMonitoring/service';

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
        const count = await correctionCount(token);
        if (count==null||!Number.isSafeInteger(Number(count))||Number(count)<0) throw Error('Correction count unavailable.');
        if (!cancelled) setState({ count: Number(count), error: false });
      } catch (error) {
        if (/Session expired/i.test(error.message)) { if (token) await closeSession(token).catch(() => {}); token = null; }
        if (!cancelled) setState(previous => ({ ...previous, error: true }));
      } finally {
        if (cancelled && token) { await closeSession(token).catch(() => {}); token = null; }
        running = false;
      }
    }
    refresh();
    const interval = setInterval(refresh, 300000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; if (!running && token) { closeSession(token).catch(() => {}); token = null; } clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [location, employee, pin]);
  return state;
}
