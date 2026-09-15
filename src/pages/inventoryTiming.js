export function getInventoryMonthInfo(serviceDate, excludedDates = new Set()) {
  const serviceDay = new Date(`${serviceDate}T12:00:00`);
  const previousMonth = new Date(serviceDay.getFullYear(), serviceDay.getMonth() - 1, 1);
  const inventoryMonthLabel = previousMonth.toLocaleDateString([], { month: "long", year: "numeric" });

  const firstOfMonth = new Date(serviceDay.getFullYear(), serviceDay.getMonth(), 1);
  const candidate = new Date(firstOfMonth);
  let firstOperatingDate = null;

  while (candidate.getMonth() === firstOfMonth.getMonth()) {
    const day = candidate.getDay();
    const dateString = candidate.toISOString().split("T")[0];
    if (day !== 0 && day !== 6 && !excludedDates.has(dateString)) {
      firstOperatingDate = dateString;
      break;
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return {
    inventoryMonthLabel,
    firstOperatingDate,
    showInventory: serviceDate === firstOperatingDate,
  };
}
