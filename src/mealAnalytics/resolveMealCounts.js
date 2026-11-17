// Resolve each school/date/meal independently. A reported district zero is real;
// only absent district values fall back to the manager's original entry.
export function resolveMealCounts(managerRows = [], officialRows = []) {
  const rows = new Map(managerRows.map(row => [`${row.location_id}|${row.service_date}`, {...row}]));
  for (const official of officialRows) {
    const key = `${official.location_id}|${official.service_date}`;
    const row = {...rows.get(key), location_id: official.location_id, service_date: official.service_date};
    for (const meal of ['breakfast', 'lunch', 'supper']) {
      const value = official[`${meal}_count`];
      if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) {
        row[`${meal}_count`] = Number(value);
        if (meal === 'supper') row.supper_status = 'complete';
      }
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a,b) => a.service_date.localeCompare(b.service_date));
}
