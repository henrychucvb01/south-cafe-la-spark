import { buildSchoolScorecard, getMplhTarget } from "./monthlyScorecardCalculations";

const n = (value) => Number(value) || 0;
export const MPLH_INTERVENTION_THRESHOLD = 6;

const isVacant = (position) =>
  String(position?.employee_name || "").trim().toUpperCase() === "VACANT";

const isManager = (position) =>
  /food service manager/i.test(String(position?.classification_title || ""));

const isSenior = (position) =>
  /senior food service worker/i.test(String(position?.classification_title || ""));

const isMovableWorker = (position) =>
  !isManager(position) &&
  !isSenior(position) &&
  /food services? worker/i.test(String(position?.classification_title || ""));

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const distanceToRange = (value, target) =>
  value < target.min ? target.min - value : value > target.max ? value - target.max : 0;

const getEmployeeKey = (emp) =>
  String(
    emp?.id ||
    emp?.position_id ||
    emp?.employee_id ||
    `${emp?.source_site_id}_${emp?.employee_name}_${emp?.classification_title}_${emp?.assigned_daily_hours}`
  );

function makeSchoolState(school, dataset, startDate, endDate) {
  const target = getMplhTarget(school);
  const card = buildSchoolScorecard(school, dataset, { startDate, endDate });
  const positions = (dataset.staffing_positions || []).filter(
  (position) =>
    String(position.location_id) === String(school.location_id) &&
    position.active !== false
  );

  const fixedPositions = positions.filter((position) => isManager(position) || isSenior(position));
  const movableWorkers = positions.filter(isMovableWorker);

  const assignedHours = positions.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);
  const fixedHours = fixedPositions.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);
  const movableHours = movableWorkers.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);

  const laborByDate = new Map();
  (dataset.labor_hours || []).forEach((row) => {
    if (String(row.location_id) === String(school.location_id)) {
      laborByDate.set(String(row.service_date).slice(0, 10), row);
    }
  });
  const dailyBaselines = (card?.current?.participationTrend || []).map((day) => {
    const adjustment = laborByDate.get(day.date);
    return {
      date: day.date,
      equivalents: n(day.breakfast) * 0.66 + n(day.lunch) + n(day.supper),
      hours:
        n(school.budget_labor_hours) +
        n(adjustment?.additional_worker_hours) +
        n(adjustment?.manager_overtime_hours),
    };
  }).filter((day) => day.hours > 0);

  const currentMplh = card?.current?.averageMplh ?? null;

  return {
  school,
  card,
  target,
  positions,
  fixedPositions,
  movableWorkers,
  assignedHours,
  fixedHours,
  movableHours,
  dailyBaselines,
  currentMplh,
  projectedHours: assignedHours,
  projectedDailyHoursDelta: 0,
  projectedMplh: currentMplh,
  incoming: [],
  outgoing: [],
};
}

const validState = (state) =>
  Boolean(
    state?.target &&
    state.target.min !== null &&
    state.target.max !== null &&
    state.currentMplh !== null &&
    state.dailyBaselines.length > 0 &&
    state.projectedHours > 0
  );

const projectedMplhFor = (state, dailyHoursDelta) => {
  const daily = state.dailyBaselines
    .map((row) => row.hours + dailyHoursDelta > 0 ? row.equivalents / (row.hours + dailyHoursDelta) : null)
    .filter((value) => value !== null);
  return mean(daily);
};

function findBestMove(states, usedEmployees) {
  let best = null;

  // Senders MUST be below target.min (overstaffed)
  const senders = states.filter(
    (state) =>
      validState(state) &&
      state.projectedMplh < state.target.min - MPLH_INTERVENTION_THRESHOLD
  );

  // Receivers MUST be strictly ABOVE target.max (understaffed)
  // Schools already within [target.min, target.max] are NEVER receivers
  const receivers = states.filter(
    (state) =>
      validState(state) &&
      state.projectedMplh > state.target.max + MPLH_INTERVENTION_THRESHOLD
  );

  for (const sender of senders) {
    for (const employee of sender.movableWorkers) {
      const empKey = getEmployeeKey(employee);
      if (usedEmployees.has(empKey)) continue;

      const hours = n(employee.assigned_daily_hours);
      if (hours <= 0 || sender.projectedHours - hours <= sender.fixedHours) continue;

      const sendingProjectedHours = sender.projectedHours - hours;
      const sendingProjectedMplh = projectedMplhFor(
        sender,
        sender.projectedDailyHoursDelta - hours
      );

      // Sender cannot be stripped past its target max
      if (sendingProjectedMplh > sender.target.max) continue;

      for (const receiver of receivers) {
        if (receiver === sender) continue;

        const receivingProjectedHours = receiver.projectedHours + hours;
        const receivingProjectedMplh = projectedMplhFor(
          receiver,
          receiver.projectedDailyHoursDelta + hours
        );

        // HARD PROTECTION: Do not dump workers on a receiver if it crashes below target.min
        // Allow at most 0.5 MPLH buffer below min so discrete shifts don't block good moves
        if (receivingProjectedMplh < receiver.target.min - 0.5) continue;

        const senderDistBefore = distanceToRange(sender.projectedMplh, sender.target);
        const senderDistAfter = distanceToRange(sendingProjectedMplh, sender.target);

        const receiverDistBefore = distanceToRange(receiver.projectedMplh, receiver.target);
        const receiverDistAfter = distanceToRange(receivingProjectedMplh, receiver.target);

        // The receiver MUST actually benefit (distance to target must decrease)
        if (receiverDistAfter >= receiverDistBefore) continue;

        const totalImprovement = (senderDistBefore - senderDistAfter) + (receiverDistBefore - receiverDistAfter);

        const candidate = {
          employee,
          empKey,
          hours,
          sender,
          receiver,
          sendingCurrentMplh: sender.projectedMplh,
          sendingProjectedMplh,
          receivingCurrentMplh: receiver.projectedMplh,
          receivingProjectedMplh,
          improvement: totalImprovement,
          receiverGap: receiver.projectedMplh - receiver.target.max,
        };

        // Prioritize schools with the largest understaffing gaps
        if (
          !best ||
          candidate.receiverGap > best.receiverGap ||
          (Math.abs(candidate.receiverGap - best.receiverGap) < 0.1 && candidate.improvement > best.improvement)
        ) {
          best = candidate;
        }
      }
    }
  }

  return best;
}

export function buildLaborOptimization(dataset, month, startDate, endDate) {
  const states = (dataset?.schools || []).map((school) =>
    makeSchoolState(school, dataset, startDate, endDate)
  );

  const transfers = [];
  const usedEmployees = new Set();
  const allMovablePositions = states.flatMap((state) => state.movableWorkers);
  const filledMovableWorkers = allMovablePositions.filter((position) => !isVacant(position)).length;
  const vacantMovablePositions = allMovablePositions.filter(isVacant).length;
  const qualifyingSenders = states.filter(
    (state) => validState(state) && state.currentMplh < state.target.min - MPLH_INTERVENTION_THRESHOLD
  ).length;
  const qualifyingReceivers = states.filter(
    (state) => validState(state) && state.currentMplh > state.target.max + MPLH_INTERVENTION_THRESHOLD
  ).length;

  while (true) {
    const move = findBestMove(states, usedEmployees);
    if (!move) break;

    usedEmployees.add(move.empKey);

    move.sender.projectedHours -= move.hours;
    move.receiver.projectedHours += move.hours;
    move.sender.projectedDailyHoursDelta -= move.hours;
    move.receiver.projectedDailyHoursDelta += move.hours;

    move.sender.projectedMplh = move.sendingProjectedMplh;
    move.receiver.projectedMplh = move.receivingProjectedMplh;

    move.sender.outgoing.push(move);
    move.receiver.incoming.push(move);

    transfers.push({
      employee: move.employee,
      employeeName: isVacant(move.employee) ? null : move.employee.employee_name,
      isVacantPosition: isVacant(move.employee),
      transferLabel: isVacant(move.employee)
        ? `Move VACANT ${move.hours.toFixed(1)}-hour FSW position`
        : move.employee.employee_name,
      classification: move.employee.classification_title,
      hours: move.hours,
      from: move.sender.school,
      to: move.receiver.school,
      sendingCurrentMplh: move.sendingCurrentMplh,
      sendingProjectedMplh: move.sendingProjectedMplh,
      receivingCurrentMplh: move.receivingCurrentMplh,
      receivingProjectedMplh: move.receivingProjectedMplh,
    });
  }

  const recommendations = states.map((state) => {
    const insufficient = !validState(state);
    const status = insufficient
      ? "insufficient"
      : state.outgoing.length
      ? "move-out"
      : state.incoming.length
      ? "add"
      : "keep";

    return {
      ...state,
      status,
      action: insufficient
        ? "Insufficient data"
        : status === "move-out"
        ? `SEND ${state.outgoing.length} WORKER${state.outgoing.length === 1 ? "" : "S"}`
        : status === "add"
        ? `RECEIVE ${state.incoming.length} WORKER${state.incoming.length === 1 ? "" : "S"}`
        : "KEEP STAFFING UNCHANGED",
      workerCount: state.movableWorkers.length,
      currentWorkerHours: state.movableHours,
      recommendedWorkerHours:
        state.movableHours -
        state.outgoing.reduce((sum, item) => sum + item.hours, 0) +
        state.incoming.reduce((sum, item) => sum + item.hours, 0),
      mplh: state.currentMplh,
    };
  });

  return {
    recommendations,
    transfers,
    qualifyingSenders,
    qualifyingReceivers,
    filledMovableWorkers,
    vacantMovablePositions,
  };
}

export { isMovableWorker, isVacant };
