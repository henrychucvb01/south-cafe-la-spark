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

  // Reuse the scorecard's official-meal/date-range aggregation for workload,
  // but use the MPLH Report's budgeted-hours source for Labor Optimization.
  const operatingDays = n(card?.current?.operatingDays);
  const baselineDailyHours = n(school?.budget_labor_hours) || null;
  const totalMealEquivalents =
    n(card?.current?.totals?.breakfast) * 0.66 +
    n(card?.current?.totals?.lunch) +
    n(card?.current?.totals?.supper);
  const averageMealEquivalents =
    operatingDays > 0 ? totalMealEquivalents / operatingDays : null;
  const currentMplh =
    card?.current?.hasMeals && baselineDailyHours > 0
      ? averageMealEquivalents / baselineDailyHours
      : null;

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
    currentMplh,
    baselineDailyHours,
    averageMealEquivalents,
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
    state.baselineDailyHours !== null &&
    state.baselineDailyHours > 0
  );

const projectedMplhFor = (state, dailyHoursDelta) => {
  if (!validState(state)) return null;
  const projectedHours = state.baselineDailyHours + dailyHoursDelta;
  if (projectedHours <= 0) return null;
  return state.averageMealEquivalents / projectedHours;
};

export function buildManualWhatIf(result, fromSchoolId, positionId, toSchoolId) {
  const recommendations = result?.recommendations || [];
  const from = recommendations.find(
    (row) => String(row.school.location_id) === String(fromSchoolId)
  );
  const to = recommendations.find(
    (row) => String(row.school.location_id) === String(toSchoolId)
  );
  const position = from?.movableWorkers.find(
    (row) => String(getEmployeeKey(row)) === String(positionId)
  );
  if (!from || !to || from === to || !position || !validState(from) || !validState(to)) {
    return null;
  }
  const hours = n(position.assigned_daily_hours);
  const fromProjectedMplh = projectedMplhFor(from, -hours);
  const toProjectedMplh = projectedMplhFor(to, hours);
  if (hours <= 0 || fromProjectedMplh === null || toProjectedMplh === null) return null;
  return {
    position,
    hours,
    isVacantPosition: isVacant(position),
    from,
    to,
    fromCurrentMplh: from.currentMplh,
    fromProjectedMplh,
    toCurrentMplh: to.currentMplh,
    toProjectedMplh,
  };
}

export { getEmployeeKey };

function findBestMove(states, usedEmployees) {
  let best = null;

  const senders = states.filter(
    (state) =>
      validState(state) &&
      state.projectedMplh < state.target.min - MPLH_INTERVENTION_THRESHOLD
  );

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
      if (hours <= 0) continue;

      const sendingProjectedMplh = projectedMplhFor(
        sender,
        sender.projectedDailyHoursDelta - hours
      );
      if (sendingProjectedMplh === null) continue;

      // Do not remove so much labor that the sender jumps above its target max.
      if (sendingProjectedMplh > sender.target.max) continue;

      for (const receiver of receivers) {
        if (receiver === sender) continue;

        const receivingProjectedMplh = projectedMplhFor(
          receiver,
          receiver.projectedDailyHoursDelta + hours
        );
        if (receivingProjectedMplh === null) continue;

        // Do not add so much labor that the receiver falls materially below target.
        if (receivingProjectedMplh < receiver.target.min - 0.5) continue;

        const senderDistBefore = distanceToRange(sender.projectedMplh, sender.target);
        const senderDistAfter = distanceToRange(sendingProjectedMplh, sender.target);
        const receiverDistBefore = distanceToRange(receiver.projectedMplh, receiver.target);
        const receiverDistAfter = distanceToRange(receivingProjectedMplh, receiver.target);

        if (senderDistAfter >= senderDistBefore) continue;
        if (receiverDistAfter >= receiverDistBefore) continue;

        const totalImprovement =
          (senderDistBefore - senderDistAfter) +
          (receiverDistBefore - receiverDistAfter);

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
          vacancyPriority: isVacant(employee) ? 1 : 0,
        };

        // Operational priority: when valid moves are otherwise comparable,
        // move a vacant position before disrupting a filled employee.
        if (
          !best ||
          candidate.receiverGap > best.receiverGap + 0.1 ||
          (Math.abs(candidate.receiverGap - best.receiverGap) <= 0.1 &&
            candidate.vacancyPriority > best.vacancyPriority) ||
          (Math.abs(candidate.receiverGap - best.receiverGap) <= 0.1 &&
            candidate.vacancyPriority === best.vacancyPriority &&
            candidate.improvement > best.improvement)
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
