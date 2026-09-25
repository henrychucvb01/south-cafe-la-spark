import React from 'react';
import { displayDate, WEEKDAYS, UNSCHEDULED } from './supperSchedule';

export function AvailableDates({ schedule }) {
  return <div className="sm-available-dates"><strong>Available Dates</strong>{!schedule.configured ? <p>{UNSCHEDULED}</p> : !schedule.dates.length ? <p>No eligible dates in this window. Ask your Supervisor to adjust the window.</p> : <ul aria-label="Available monitoring dates">{schedule.dates.map(date => <li key={date}>{displayDate(date)}</li>)}</ul>}</div>;
}
export default function SupperScheduleDetails({ schedule }) {
  return <div className="sm-schedule-details">
    <p><strong>Due:</strong> {displayDate(schedule.setting?.due_date)}</p>
    <p><strong>Available:</strong> {displayDate(schedule.setting?.available_start)} through {displayDate(schedule.setting?.available_end)}</p>
    {schedule.prior.length ? <ul>{schedule.prior.map(r => <li key={r.id}>Supper {r.monitoring_number || (r.monitoring_slot === 'manager_1' ? 1 : 2)} completed: {displayDate(r.monitoring_date)}</li>)}</ul> : <p>No completed prior Supper monitoring dates for this site and school year.</p>}
    <div className="sm-queue-scroll"><table className="sm-matrix"><caption>Weekday / week-of-month matrix</caption><thead><tr><th scope="col">Week</th>{WEEKDAYS.map((day,i) => <th scope="col" className={schedule.weekdays.has(i+1) ? 'sm-matrix-used' : ''} key={day}>{day}</th>)}</tr></thead><tbody>{[1,2,3,4,5].map(week => <tr key={week}><th scope="row" className={schedule.weeks.has(week) ? 'sm-matrix-used' : ''}>Week {week}</th>{WEEKDAYS.map((day,i) => {
      const used = schedule.weeks.has(week) || schedule.weekdays.has(i+1);
      return <td key={day} className={used ? 'sm-matrix-used' : ''} aria-label={`${day}, Week ${week}: ${used ? 'Unavailable' : 'Eligible pattern'}`}>{used ? 'Unavailable' : 'Eligible'}</td>;
    })}</tr>)}</tbody></table></div>
    <p className="sm-schedule-key">Red cells are unavailable patterns. Week 1 = days 1–7; Week 2 = 8–14; Week 3 = 15–21; Week 4 = 22–28; Week 5 = 29–31. Only accepted/completed prior Supper records are used.</p>
    <AvailableDates schedule={schedule}/>
  </div>;
}
