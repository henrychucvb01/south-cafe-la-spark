// Calendar-only UTC arithmetic avoids local timezone and daylight-saving shifts.
export const SUPPER_NUMBERS = { manager_1: 1, supervisor: 2, manager_2: 3 };
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const UNSCHEDULED = 'A due date has not been set yet. Contact your Supervisor.';
export function dateParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return { weekday: date.getUTCDay(), week: Math.ceil(date.getUTCDate() / 7), date };
}
export function displayDate(value) {
  const p = dateParts(value);
  return p ? p.date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled';
}
export function supperSchedule({ schedules = [], records = [], siteId, year, slot }) {
  const number = SUPPER_NUMBERS[slot];
  const blockedReason = supperSequence(records, siteId, year, slot);
  const setting = schedules.find(s => s.school_year === year && s.monitoring_slot === slot);
  const prior = records.filter(r => r.monitoring_type === 'supper' && r.monitoring_site_id === siteId && r.school_year === year &&
    ['accepted', 'completed'].includes(r.status) && SUPPER_NUMBERS[r.monitoring_slot] < number && dateParts(r.monitoring_date));
  const weekdays = new Set(prior.map(r => dateParts(r.monitoring_date).weekday));
  const weeks = new Set(prior.map(r => dateParts(r.monitoring_date).week));
  const previous = prior.find(r => r.monitoring_slot === (slot === 'supervisor' ? 'manager_1' : 'supervisor') && r.locked === true);
  const nextDay = dateParts(previous?.monitoring_date)?.date;
  if (nextDay) nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const rangeStart = slot === 'manager_1' && /^\d{4}-\d{2}$/.test(year || '') ? `${year.slice(0,4)}-07-01` : nextDay?.toISOString().slice(0,10);
  const rangeEnd = setting?.due_date;
  const start = dateParts(rangeStart), end = dateParts(rangeEnd);
  const configured = !!end;
  const dates = [];
  if (configured && start && !blockedReason) {
    for (const day = new Date(start.date); day <= end.date; day.setUTCDate(day.getUTCDate() + 1)) {
      if (day.getUTCDay() >= 1 && day.getUTCDay() <= 5 && !weekdays.has(day.getUTCDay()) && !weeks.has(Math.ceil(day.getUTCDate() / 7))) dates.push(day.toISOString().slice(0, 10));
    }
  }
  return { setting, prior, weekdays, weeks, dates, configured, blockedReason, rangeStart, rangeEnd };
}

export function supperSequence(records = [], siteId, year, slot) {
  const done = key => records.some(r => r.monitoring_type === 'supper' && r.monitoring_site_id === siteId && r.school_year === year && r.monitoring_slot === key && r.locked === true && ['accepted','completed'].includes(r.status));
  if (slot === 'supervisor' && !done('manager_1')) return 'Waiting for Supper 1 to be accepted.';
  if (slot === 'manager_2' && (!done('manager_1') || !done('supervisor'))) return 'Complete Supper 1 and Supper 2 first.';
  return '';
}
export function isPerfectMonitoring(record) {
  return record?.monitor_role === 'manager' && record.locked === true && record.status === 'accepted' && (record.perfect_monitoring_override ?? (record.had_correction_requested === false));
}
