export const SCHOOL_YEAR_START = "2026-08-12";
export const SCHOOL_YEAR_END = "2027-06-04";
export const REWARD_LAUNCH_DATE = "2026-09-03";
export const FULL_FINISH_LINE_POINTS = 5;
export const LATE_FINISH_LINE_POINTS = 2;

export function getLocalDateString(date = new Date()) {
  // SPARK schools operate in Los Angeles. Pin reward timing to Pacific time
  // so a same-day evening submission cannot turn into "late" because a
  // server/runtime happens to be using UTC.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function isWeekday(dateString) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  return day >= 1 && day <= 5;
}

export function isWithinSchoolYear(dateString) {
  return dateString >= SCHOOL_YEAR_START && dateString <= SCHOOL_YEAR_END;
}

export function isPreLaunchGraceDate(serviceDate) {
  return serviceDate < REWARD_LAUNCH_DATE;
}

export function isSubmissionOnTime(serviceDate, submittedAt) {
  if (!serviceDate || !submittedAt) return false;
  const submittedDate = getLocalDateString(new Date(submittedAt));
  return submittedDate === serviceDate;
}

export function isStreakEligibleCheck(check) {
  return Boolean(
    check &&
      check.status === "complete" &&
      check.service_date >= REWARD_LAUNCH_DATE &&
      isSubmissionOnTime(check.service_date, check.submitted_at)
  );
}

export function getFinishLinePointAward(serviceDate, submittedAt = new Date()) {
  if (isPreLaunchGraceDate(serviceDate)) {
    return {
      points: FULL_FINISH_LINE_POINTS,
      late: false,
      streakEligible: false,
      gracePeriod: true,
    };
  }

  const submittedDate =
    submittedAt instanceof Date
      ? getLocalDateString(submittedAt)
      : getLocalDateString(new Date(submittedAt));
  const late = submittedDate !== serviceDate;

  return {
    points: late ? LATE_FINISH_LINE_POINTS : FULL_FINISH_LINE_POINTS,
    late,
    streakEligible: !late,
    gracePeriod: false,
  };
}

export function buildSchoolWeekdaysThrough(todayString) {
  const end = todayString < SCHOOL_YEAR_END ? todayString : SCHOOL_YEAR_END;
  const dates = [];
  const cursor = new Date(`${SCHOOL_YEAR_START}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);

  while (cursor <= last) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      dates.push(getLocalDateString(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
