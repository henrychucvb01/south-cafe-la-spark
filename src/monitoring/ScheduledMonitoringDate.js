import React from 'react';
import { displayDate, UNSCHEDULED } from './supperSchedule';

export default function ScheduledMonitoringDate({ schedule, value, onChange, readonly }) {
  const invalid = !!value && !schedule.dates.includes(value);
  if (readonly) return <div className="sm-field"><label>Monitoring date<input type="date" value={value || ''} disabled readOnly/></label></div>;
  return <div className="sm-field"><label htmlFor="monitoringDate">Monitoring date</label>
    <select id="monitoringDate" value={value || ''} disabled={!schedule.configured || !schedule.dates.length} aria-describedby="monitoring-schedule-help" aria-invalid={invalid} onChange={e => onChange(e.target.value)}>
      <option value="">Select an eligible date</option>
      {invalid && <option value={value} disabled>{displayDate(value)} — unavailable</option>}
      {schedule.dates.map(date => <option value={date} key={date}>{displayDate(date)}</option>)}
    </select>
    <p id="monitoring-schedule-help">{schedule.blockedReason || (!schedule.configured ? UNSCHEDULED : !schedule.dates.length ? 'No eligible dates remain on or before the due date. Contact your Supervisor.' : `Due: ${displayDate(schedule.setting?.due_date)}. Select from the published eligible dates.`)}</p>
    {invalid && <p role="alert" className="sm-error">This date is no longer eligible. Select a published date before submitting.</p>}
  </div>;
}
