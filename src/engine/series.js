// src/engine/series.js
// Season points series: UCI-style point tables and division standings.
// Pure module — no DOM, no I/O.

const CLASSIC_POINTS = [100, 70, 50, 40, 35, 30, 25, 20, 15, 10, 6, 5, 4, 3, 2, 2, 2, 2, 1, 1];
const MONUMENT_POINTS = [200, 150, 110, 90, 80, 70, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 9, 8, 7];
const GT_STAGE_POINTS = [120, 80, 60, 50, 45, 40, 35, 30, 25, 20, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3];
const GT_GC_POINTS = [1000, 800, 640, 520, 480, 440, 400, 380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 190, 180, 170];

function pointsForPlace(table, place) {
  if (place < 1) return 0;
  return table[place - 1] || 0;
}

function pointsForRace(result) {
  let table = CLASSIC_POINTS;
  if (result.isMonument) table = MONUMENT_POINTS;
  if (result.kind === 'gt-stage') table = GT_STAGE_POINTS;
  if (result.kind === 'gt-gc') table = GT_GC_POINTS;
  return table;
}

export function awardPoints(result, options = {}) {
  const table = pointsForRace(result);
  const perTeam = new Map();
  const perRider = new Map();

  for (const p of result.placings || []) {
    const place = p.position;
    const pts = pointsForPlace(table, place);
    if (pts <= 0) continue;
    const team = p.team;
    perTeam.set(team, (perTeam.get(team) || 0) + pts);
    perRider.set(p.rider.id, { rider: p.rider, points: (perRider.get(p.rider.id)?.points || 0) + pts });
  }

  if (options.komPoints) {
    for (const { rider, points } of options.komPoints) {
      perRider.set(rider.id, { rider, points: (perRider.get(rider.id)?.points || 0) + points });
    }
  }
  if (options.sprintPoints) {
    for (const { rider, points } of options.sprintPoints) {
      perRider.set(rider.id, { rider, points: (perRider.get(rider.id)?.points || 0) + points });
    }
  }

  return { perTeam, perRider };
}

export function computeStandings(results) {
  const rows = new Map();

  function ensureRow(team) {
    if (!rows.has(team)) {
      rows.set(team, { team, points: 0, wins: 0, podiums: 0, top10s: 0, races: 0 });
    }
    return rows.get(team);
  }

  for (const r of results) {
    if (!r || !r.placings) continue;
    const pts = awardPoints(r);
    for (const [team, teamPts] of pts.perTeam) {
      const row = ensureRow(team);
      row.points += teamPts;
      row.races += 1;
    }
    for (const p of r.placings) {
      const row = ensureRow(p.team);
      if (p.position === 1) row.wins += 1;
      if (p.position <= 3) row.podiums += 1;
      if (p.position <= 10) row.top10s += 1;
    }
  }

  const arr = Array.from(rows.values());
  arr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    return (a.team || '').localeCompare(b.team || '');
  });

  arr.forEach((r, i) => (r.position = i + 1));
  return arr;
}
