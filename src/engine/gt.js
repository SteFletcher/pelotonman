// src/engine/gt.js
// Grand Tour multi-stage GC, jerseys, and stage sequencing.
// Depends on series.js for points award helper (currently not directly required).
// Pure module — no DOM, no I/O.

const TIME_BONUSES = [10, 6, 4];

export function createGrandTour(id, name, startWeek, options = {}) {
  return {
    id,
    name,
    startWeek,
    totalStages: options.totalStages || 21,
    stages: [],
    gc: {}, // riderId -> { rider, team, totalTime, ... }
    points: {}, // riderId -> { rider, team, points }
    kom: {}, // riderId -> { rider, team, points }
    white: {}, // riderId -> { rider, team, gcTime }
    finished: false,
  };
}

export function advanceStage(gt, result) {
  if (gt.finished) throw new Error(`Grand Tour ${gt.id} is already finished`);
  if (!result) throw new TypeError('advanceStage: result required');

  gt.stages.push(result);
  const isITT = result.profileKind === 'itt';

  // GC time and points jersey points from placings.
  for (const p of result.placings || []) {
    const rider = p.rider;
    if (rider.abandonedRace) continue; // don't update after abandon

    const bonus = !isITT && p.position <= 3 ? TIME_BONUSES[p.position - 1] || 0 : 0;
    const time = Math.max(0, (p.timeGap || 0) - bonus);

    const cur = gt.gc[rider.id];
    if (!cur) {
      gt.gc[rider.id] = createGcEntry(rider, p.team, time);
    } else {
      cur.totalTime += time;
      cur.stagesCompleted += 1;
    }

    // Points use result points table, converted from placing points.
    const pts = stagePointsForPosition(p.position);
    addLeaderboard(gt.points, rider, p.team, pts);
  }

  // KOM points.
  for (const { rider, points } of result.komPoints || []) {
    const team = teamNameForRider(result, rider);
    addLeaderboard(gt.kom, rider, team, points);
  }

  // Intermediate/print-sprint points.
  for (const { rider, points } of result.sprintPoints || []) {
    const team = teamNameForRider(result, rider);
    addLeaderboard(gt.points, rider, team, points);
  }

  rebuildWhiteJersey(gt);

  if (gt.stages.length >= gt.totalStages) {
    gt.finished = true;
  }
  return gt;
}

function stagePointsForPosition(position) {
  const table = [50, 30, 20, 14, 10, 8, 6, 4, 2, 1];
  return table[position - 1] || 0;
}

function teamNameForRider(result, rider) {
  const found = result.placings.find((p) => p.rider.id === rider.id);
  return found?.team || 'Unknown';
}

function createGcEntry(rider, team, time) {
  return {
    rider,
    team,
    totalTime: time,
    stagesCompleted: 1,
    abandoned: false,
  };
}

function addLeaderboard(map, rider, team, points) {
  if (!points) return;
  const cur = map[rider.id];
  if (!cur) {
    map[rider.id] = { rider, team, points };
  } else {
    cur.points += points;
    cur.team = team; // refresh team if moved
  }
}

function rebuildWhiteJersey(gt) {
  gt.white = {};
  const sorted = sortGc(gt.gc);
  for (const ent of sorted) {
    if (ent.rider.abandonedRace || ent.abandoned) continue;
    if (ent.rider.age <= 25) {
      gt.white[ent.rider.id] = { rider: ent.rider, team: ent.team, gcTime: ent.totalTime };
      break;
    }
  }
}

export function jerseyHolders(gt) {
  const sorted = sortGc(gt.gc);
  const gc = sorted[0] || null;
  const points = sortByPoints(gt.points)[0] || null;
  const kom = sortByPoints(gt.kom)[0] || null;
  const white = sortByPoints(gt.white)[0] || null;
  return { gc, points, kom, white };
}

export function overallGc(gt, limit = 10) {
  return sortGc(gt.gc).slice(0, limit);
}

function sortGc(gcMap) {
  const arr = Object.values(gcMap).filter((e) => !e.rider?.abandonedRace && !e.abandoned);
  arr.sort((a, b) => a.totalTime - b.totalTime);
  return arr;
}

function sortByPoints(pointsMap) {
  const arr = Object.values(pointsMap);
  arr.sort((a, b) => b.points - a.points);
  return arr;
}
