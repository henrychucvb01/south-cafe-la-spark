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

  // Senders MUST be below target.min (overstaffed)
  const senders = states.filter(
    (state) => validState(state) && state.projectedMplh < state.target.min
  );

  // Receivers MUST be strictly ABOVE target.max (understaffed)
  // Schools already within [target.min, target.max] are NEVER receivers
  const receivers = states.filter(
    (state) => validState(state) && state.projectedMplh > state.target.max
  );

  for (const sender of senders) {
    for (const employee of sender.movableWorkers) {
      const empKey = getEmployeeKey(employee);
      if (usedEmployees.has(empKey)) continue;

      const hours = n(employee.assigned_daily_hours);
      if (hours <= 0 || sender.projectedHours - hours <= sender.fixedHours) continue;

      const sendingProjectedHours = sender.projectedHours - hours;
      const sendingProjectedMplh = mplhFor(sender.averageEquivalents, sendingProjectedHours);

      // Sender cannot be stripped past its target max
      if (sendingProjectedMplh > sender.target.max) continue;

      for (const receiver of receivers) {
        if (receiver === sender) continue;

        const receivingProjectedHours = receiver.projectedHours + hours;
        const receivingProjectedMplh = mplhFor(receiver.averageEquivalents, receivingProjectedHours);

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
