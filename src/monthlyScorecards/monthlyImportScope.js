// Scope is read from the database for each upload, including offsite/EEC mappings.
export function scopeMonthlyRows(rows, mappings) {
  if (!Array.isArray(mappings) || !mappings.length) throw new Error("No active SPARK school mappings were found. Nothing was imported.");
  const sites = new Set(mappings.map(row => String(row.source_site_id)));
  return rows.filter(row => sites.has(String(row.source_site_id)));
}

export function monthlyCopyCsv(rows, filename, checksum) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => {
    let text = value == null ? "" : String(value);
    // Spreadsheet formulas must never execute when a downloaded file is opened.
    if (typeof value === "string" && /^[\s]*[=+@-]|^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [
    [...columns, "original_filename", "source_checksum"].map(cell).join(","),
    ...rows.map(row => [...columns.map(key => row[key]), filename, checksum].map(cell).join(",")),
  ].join("\r\n");
}

export function downloadMonthlyCopy(copy) {
  const url = URL.createObjectURL(new Blob([monthlyCopyCsv(copy.rows, copy.filename, copy.checksum)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `SPARK-only-${copy.filename.replace(/\.csv$/i, "")}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
