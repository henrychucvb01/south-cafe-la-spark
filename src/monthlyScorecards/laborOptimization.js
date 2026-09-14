import { buildSchoolScorecard, getMplhTarget } from "./monthlyScorecardCalculations";

const n = (value) => Number(value) || 0;

const isVacant = (position) =>
  String(position?.employee_name || "").trim().toUpperCase() === "VACANT";

const isManager = (position) =>
  /food service manager/i.test(String(position?.classification_title || ""));

const isSenior = (position) =>
  /senior food service worker/i.test(String(position?.classification_title || ""));

const isMovableWorker = (position) =>
  !isVacant(position) &&
  !isManager(position) &&
  !isSenior(position) &&
  /food services? worker/i.test(String(position?.classification_title || ""));

const mplhFor = (equivalents, hours) => (hours > 0 ? equivalents / hours : null);

const getEmployeeKey = (emp) =>
  String(
    emp?.id ||
    emp?.position_id ||
    emp?.employee_id ||
    `${emp?.source_site_id}_${emp?.employee_name}_${emp?.classification_title}_${emp?.assigned_daily_hours}`
  );

function getHourDistanceToRange(hours, equivalents, target) {
  if (!equivalents || !target || target.min === null || target.max === null) return 0;
  const minHoursNeeded = equivalents / target.max;
  const maxHoursAllowed = equivalents / target.min;

  if (hours < minHoursNeeded) {
    return minHoursNeeded - hours;
  } else if (hours > maxHoursAllowed) {
    return hours - maxHoursAllowed;
  }
  return 0;
}

function makeSchoolState(school, dataset, startDate, endDate) {
  const target = getMplhTarget(school);
  const card = buildSchoolScorecard(school, dataset, { startDate, endDate });
  const positions = (dataset.staffing_positions || []).filter(
    (position) =>
      String(position.source_site_id) === String(school.source_site_id) &&
      position.active !== false &&
      !isVacant(position)
  );

  const fixedPositions = positions.filter((position) => isManager(position) || isSenior(position));
  const movableWorkers = positions.filter(isMovableWorker);

  const assignedHours = positions.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);
  const fixedHours = fixedPositions.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);
  const movableHours = movableWorkers.reduce((sum, position) => sum + n(position.assigned_daily_hours), 0);

  const days = card?.current?.operatingDays || 0;
  const averageEquivalents = days
    ? (card.current.totals.breakfast * 0.66 +
        card.current.totals.lunch +
        card.current.totals.supper) /
      days
    : null;

  const currentMplh = averageEquivalents !== null ? mplhFor(averageEquivalents, assignedHours) : null;

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
    averageEquivalents,
    currentMplh,
    projectedHours: assignedHours,
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
    state.averageEquivalents !== null &&
    state.assignedHours > 0
  );

function findBestMove(states, usedEmployees) {
  let best = null;

  const senders = states.filter(
    (state) => validState(state) && state.projectedMplh < state.target.min
  );

  // Allow receivers that are above max or running above midpoint with capacity
  const receivers = states.filter((state) => {
    if (!validState(state)) return false;
    const targetMid = (state.target.min + state.target.max) / 2;
    const targetMinHours = state.averageEquivalents / state.target.min;
    return state.projectedMplh >= targetMid || state.projectedHours < targetMinHours;
  });

  for (const sender of senders) {
    for (const employee of sender.movableWorkers) {
      const empKey = getEmployeeKey(employee);
      if (usedEmployees.has(empKey)) continue;

      const hours = n(employee.assigned_daily_hours);
      if (hours <= 0 || sender.projectedHours - hours <= sender.fixedHours) continue;

      const sendingProjectedHours = sender.projectedHours - hours;
      const sendingProjectedMplh = mplhFor(sender.averageEquivalents, sendingProjectedHours);

      // Do not over-strip sender
      if (sendingProjectedMplh > sender.target.max + 2.0) continue;

      for (const receiver of receivers) {
        if (receiver === sender) continue;

        const receivingProjectedHours = receiver.projectedHours + hours;
        const receivingProjectedMplh = mplhFor(receiver.averageEquivalents, receivingProjectedHours);

        const senderDistBefore = getHourDistanceToRange(sender.projectedHours, sender.averageEquivalents, sender.target);
        const senderDistAfter = getHourDistanceToRange(sendingProjectedHours, sender.averageEquivalents, sender.target);

        const receiverDistBefore = getHourDistanceToRange(receiver.projectedHours, receiver.averageEquivalents, receiver.target);
        const receiverDistAfter = getHourDistanceToRange(receivingProjectedHours, receiver.averageEquivalents, receiver.target);

        const senderImprovement = senderDistBefore - senderDistAfter;
        const receiverImprovement = receiverDistBefore - receiverDistAfter;
        const totalImprovement = senderImprovement + receiverImprovement;

        if (totalImprovement <= 0.05) continue;

        // Prevent overloading receiver beyond 1 shift buffer
        const maxHoursAllowed = receiver.averageEquivalents / receiver.target.min;
        if (receivingProjectedHours > maxHoursAllowed + hours) continue;

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
        };

        if (!best || candidate.improvement > best.improvement) {
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

  while (true) {
    const move = findBestMove(states, usedEmployees);
    if (!move) break;

    usedEmployees.add(move.empKey);

    move.sender.projectedHours -= move.hours;
    move.receiver.projectedHours += move.hours;

    move.sender.projectedMplh = move.sendingProjectedMplh;
    move.receiver.projectedMplh = move.receivingProjectedMplh;

    move.sender.outgoing.push(move);
    move.receiver.incoming.push(move);

    transfers.push({
      employee: move.employee,
      employeeName: move.employee.employee_name,
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

  return { recommendations, transfers };
}

export { isMovableWorker };
