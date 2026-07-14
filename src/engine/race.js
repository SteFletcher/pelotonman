// src/engine/race.js
// Resumable km-by-km race simulation (peloton, breakaways, climbs, sprints, ITT).
// Pure module — no DOM, no I/O. Per-race state lives in StatLine objects keyed by
// rider id; the engine never mutates the input rider objects.

import { createRng } from './rng.js';
import { slotPenalty, RACE_TEAM_SIZE, MAX_LEADERS } from './squad.js';

export const CRASH_PROB = 0.0016;
export const BASE_BREAK_PROB = 0.18;
export const CHASE_EFFICIENCY = 0.85;

const FLAT_SPEED = 45.0; // km/h
const CLIMB_SPEED = 20.0; // km/h
const DESCENT_SPEED = 65.0;
const FINISH_SPEED = 50.0;
const ITT_SPEED = 47.0;

const KOM_POINTS = [20, 15, 10, 6, 4];
const SPRINT_POINTS = [20, 15, 10, 6, 4];

export class RaceSim {
  constructor(teams, profile, options = {}) {
    this.rng = options.rng || createRng(options.seed ?? options.rngState ?? 0);
    if (options.rngState !== undefined) this.rng.setState(options.rngState);

    this.profile = profile;
    this.distanceKm = profile.distanceKm || 0;
    this.kind = profile.kind || 'classic';
    this.km = 0;
    this.finished = false;
    this.result = null;
    this.timeline = [];
    this.events = [];
    this.autoOrders = options.autoOrders !== false;
    this.gtStage = options.gtStage || false;

    this.entries = normalizeTeams(teams, profile);
    this.riderMap = new Map();
    for (const e of this.entries) {
      for (const rr of e.riders) {
        this.riderMap.set(rr.rider.id, { ...rr, entry: e });
      }
    }

    // Per-race StatLine state keyed by rider id.
    this.statMap = new Map();
    for (const { rider } of this.riderMap.values()) {
      this.statMap.set(rider.id, createStatLine(rider));
    }

    this.pelotonMembers = Array.from(this.riderMap.keys());
    this.breakMembers = [];
    this.droppedMembers = [];
    this.abandonedMembers = [];
    this.breakGapSec = 0; // seconds the break is ahead of the peloton front
    this.pelotonKmTime = 0; // cumulative seconds of the peloton front
    this.breakKmTime = 0;   // cumulative seconds of the break front

    this.teamOrders = new Map(this.entries.map((e) => [e.shortName, emptyOrders()]));
    this.validate();
    this.pushSnapshot();
  }

  validate() {
    if (this.entries.length === 0) throw new Error('RaceSim: no teams');
    for (const e of this.entries) {
      if (e.riders.length !== RACE_TEAM_SIZE) {
        throw new Error(`RaceSim: ${e.name} has ${e.riders.length} starters, expected ${RACE_TEAM_SIZE}`);
      }
      const ldrs = e.riders.filter((r) => r.role === 'LDR');
      if (ldrs.length > MAX_LEADERS) {
        throw new Error(`RaceSim: ${e.name} has ${ldrs.length} LDR slots`);
      }
      const names = new Set(e.riders.map((r) => r.rider.name));
      if (names.size !== RACE_TEAM_SIZE) throw new Error(`RaceSim: duplicate names in ${e.name}`);
      for (const rr of e.riders) {
        if (rr.rider.power < 1 || rr.rider.power > 99 || rr.rider.climb < 1 || rr.rider.climb > 99) {
          throw new Error(`RaceSim: attribute out of range for ${rr.rider.name}`);
        }
      }
    }
  }

  /** Set team orders (chase, control, sendUpRoad, leadout, attack). */
  setOrders(teamKey, orders) {
    const e = this.entries.find((x) => x.name === teamKey || x.shortName === teamKey);
    if (!e) throw new Error(`RaceSim: unknown team ${teamKey}`);
    this.teamOrders.set(e.shortName, { ...emptyOrders(), ...orders });
  }

  setRacePlan(teamKey, { plan, aggression }) {
    const e = this.entries.find((x) => x.name === teamKey || x.shortName === teamKey);
    if (!e) throw new Error(`RaceSim: unknown team ${teamKey}`);
    if (plan) e.plan = plan;
    if (aggression) e.aggression = aggression;
  }

  /** Mid-race role reassignment. */
  setRole(teamKey, riderId, newRole) {
    const e = this.entries.find((x) => x.name === teamKey || x.shortName === teamKey);
    if (!e) throw new Error(`RaceSim: unknown team ${teamKey}`);
    const rr = e.riders.find((r) => r.rider.id === riderId);
    if (!rr) throw new Error(`RaceSim: rider ${riderId} not in team ${teamKey}`);
    if (newRole === 'LDR') {
      const currentLdrs = e.riders.filter((r) => r.role === 'LDR');
      if (currentLdrs.length >= MAX_LEADERS && rr.role !== 'LDR') {
        throw new Error(`RaceSim: cannot have more than ${MAX_LEADERS} LDR`);
      }
    }
    rr.role = newRole;
  }

  simulateToEnd() {
    while (!this.finished) this.playSegment();
    return this.finish();
  }

  playSegment() {
    if (this.finished) return [];
    const remaining = this.distanceKm - this.km;
    if (remaining <= 0) {
      this.finish();
      return this.events.slice(-3);
    }

    const segLen = chooseSegmentLength(this.km, remaining);
    const fromKm = this.km;
    const toKm = Math.min(this.km + segLen, this.distanceKm);
    const midKm = (fromKm + toKm) / 2;
    const sector = sectorAt(this.profile, midKm);

    if (this.autoOrders) this.applyAiPolicy(sector);

    if (this.kind === 'itt') {
      this.advanceITT(toKm, sector);
    } else {
      this.advanceRoadSegment(fromKm, toKm, sector);
    }

    this.km = toKm;
    this.applyConditionDecay(segLen, sector);
    this.pushSnapshot();

    if (this.km >= this.distanceKm) {
      this.finish();
    }
    return this.events.slice(-8);
  }

  advanceITT(toKm, sector) {
    const segLen = toKm - this.km;
    for (const id of this.pelotonMembers) {
      const rr = this.riderMap.get(id);
      const eff = effectiveStrength(rr, sector, this.statMap.get(id));
      const speed = (ITT_SPEED + (eff - 50) * 0.4) * this.terrainSpeedFactor(sector);
      const segTime = (segLen / Math.max(1, speed)) * 3600;
      this.statMap.get(id).kmRidden += segLen;
      this.statMap.get(id).time += segTime;
    }
  }

  advanceRoadSegment(fromKm, toKm, sector) {
    const segLen = toKm - fromKm;

    // Break formation.
    if (this.breakMembers.length === 0) {
      const breakup = computeBreakFormChance(this.entries, this.teamOrders, sector, this.rng);
      if (this.rng.chance(breakup.prob)) {
        this.formBreak(breakup.riders);
        this.addEvent(fromKm, 'break', `${breakup.riders.length}-rider break forms`);
      }
    }

    // Speeds in km/h for each group.
    const pelotonSpeed = this.computePelotonSpeed(sector, segLen);
    const breakSpeed = this.breakMembers.length ? this.computeBreakSpeed(sector, segLen) : pelotonSpeed;

    // Advance group cumulative times.
    const pelotonSegTime = (segLen / Math.max(1, pelotonSpeed)) * 3600;
    this.pelotonKmTime += pelotonSegTime;
    if (this.breakMembers.length) {
      const breakSegTime = (segLen / Math.max(1, breakSpeed)) * 3600;
      this.breakKmTime += breakSegTime;
      // breakGapSec positive means break is ahead (less time to finish)
      this.breakGapSec = this.pelotonKmTime - this.breakKmTime;
      if (this.breakGapSec <= 0) {
        this.catchBreak();
      }
    }

    // Climb drops: move weak riders to dropped.
    if (sector.type === 'climb') {
      this.resolveClimbDrops(sector);
    }

    // Intermediate sprint or finish points.
    if (sector.type === 'finish' && toKm >= this.distanceKm) {
      // finish is handled by finish()
    } else if (['flat', 'hilly'].includes(sector.type) && this.isIntermediateSprint(fromKm, toKm)) {
      this.resolveIntermediateSprint();
    }

    if (sector.type === 'climb' && this.isSectorEnd(toKm, sector)) {
      this.resolveKOM(sector);
    }

    // Crashes & mechanicals.
    this.resolveCrashes(fromKm, segLen);

    // Update km ridden and quiet domestique work.
    for (const id of this.pelotonMembers) {
      const st = this.statMap.get(id);
      st.kmRidden += segLen;
      if (this.isPulling(id)) st.pullsKm += segLen;
      if (st.pullsKm > 0 && this.rng.chance(0.05)) st.pulls += 1;
    }
    for (const id of this.breakMembers) {
      const st = this.statMap.get(id);
      st.kmRidden += segLen;
      st.pullsKm += segLen * 0.5;
    }
  }

  applyAiPolicy(sector) {
    for (const e of this.entries) {
      const orders = this.teamOrders.get(e.shortName);
      const hasLeaderInBreak = e.riders.some((rr) => this.breakMembers.includes(rr.rider.id));
      const leaderIsStrongGc = e.riders.some((rr) => rr.role === 'LDR' && abilityProxy(rr.rider) > 80);
      if (this.breakMembers.length && !hasLeaderInBreak && leaderIsStrongGc) {
        orders.chase = true;
        orders.sendUpRoad = false;
      } else if (this.breakMembers.length && hasLeaderInBreak) {
        orders.chase = false;
        orders.control = true;
      } else if (sector.type === 'flat' && e.riders.some((rr) => rr.rider.type === 'SPR')) {
        orders.control = true;
      } else {
        orders.control = true;
      }
      orders.attack = e.aggression === 'attacking' && sector.type !== 'flat';
    }
  }

  computePelotonSpeed(sector, segLen) {
    const base = this.baseTerrainSpeed(sector);
    const rrList = this.pelotonMembers.map((id) => this.riderMap.get(id));
    const pooled = pooledStrength(rrList, sector);
    const chaseFactor = this.chaseIntensity();
    const pace = base * (0.85 + 0.003 * pooled) * chaseFactor * (0.996 + this.rng.next() * 0.008);
    return clamp(pace, 15, 80);
  }

  computeBreakSpeed(sector, segLen) {
    const base = this.baseTerrainSpeed(sector);
    const rrList = this.breakMembers.map((id) => this.riderMap.get(id));
    const pooled = pooledStrength(rrList, sector);
    // Breaks gamble, so slightly higher variance.
    const pace = base * (0.82 + 0.0032 * pooled) * (0.985 + this.rng.next() * 0.025);
    return clamp(pace, 18, 80);
  }

  baseTerrainSpeed(sector) {
    if (!sector) return FLAT_SPEED;
    switch (sector.type) {
      case 'climb': return CLIMB_SPEED * (1 - 0.08 * (sector.cat || 1));
      case 'descent': return DESCENT_SPEED;
      case 'finish': return FINISH_SPEED;
      default: return FLAT_SPEED;
    }
  }

  terrainSpeedFactor(sector) {
    if (!sector) return 1.0;
    switch (sector.type) {
      case 'climb': return 0.95 - 0.08 * (sector.cat || 1);
      case 'descent': return 1.18;
      case 'finish': return 1.0;
      default: return 1.0;
    }
  }

  chaseIntensity() {
    let chasingTeams = 0;
    for (const e of this.entries) {
      const o = this.teamOrders.get(e.shortName);
      if (o.chase) chasingTeams++;
    }
    if (chasingTeams === 0) return 0.97;
    return 1.0 + CHASE_EFFICIENCY * Math.log1p(chasingTeams);
  }

  formBreak(riderIds) {
    for (const id of riderIds) {
      move(this.pelotonMembers, this.breakMembers, id);
      const st = this.statMap.get(id);
      st.komPoints += 0;
    }
    this.breakGapSec = 5 + this.rng.next() * 45; // 5-50s initial gap
  }

  catchBreak() {
    while (this.breakMembers.length) {
      const id = this.breakMembers.pop();
      this.pelotonMembers.push(id);
    }
    this.breakGapSec = 0;
    this.addEvent(this.km, 'catch', 'The break is caught');
  }

  resolveClimbDrops(sector) {
    const threshold = 45 + (sector.cat || 1) * 8;
    for (const id of Array.from(this.pelotonMembers)) {
      const rr = this.riderMap.get(id);
      const eff = effectiveClimb(rr, this.statMap.get(id));
      if (eff < threshold - this.rng.next() * 10) {
        move(this.pelotonMembers, this.droppedMembers, id);
        this.statMap.get(id).dropped = true;
      }
    }
    for (const id of Array.from(this.breakMembers)) {
      const rr = this.riderMap.get(id);
      const eff = effectiveClimb(rr, this.statMap.get(id));
      if (eff < threshold - this.rng.next() * 8) {
        move(this.breakMembers, this.droppedMembers, id);
        this.statMap.get(id).dropped = true;
        if (this.breakMembers.length === 0 && this.pelotonMembers.length) {
          this.breakGapSec = 0;
        }
      }
    }
  }

  resolveKOM(sector) {
    const contenders = [
      ...this.breakMembers,
      ...this.pelotonMembers.filter(() => this.rng.chance(0.3)),
    ].filter((id) => !this.abandonedMembers.includes(id));
    contenders.sort((a, b) => {
      const ca = effectiveClimb(this.riderMap.get(a), this.statMap.get(a));
      const cb = effectiveClimb(this.riderMap.get(b), this.statMap.get(b));
      return cb - ca;
    });
    if (contenders.length === 0) return;
    for (let i = 0; i < Math.min(KOM_POINTS.length, contenders.length); i++) {
      const st = this.statMap.get(contenders[i]);
      st.komPoints += KOM_POINTS[i];
      st.rating += KOM_POINTS[i] * 0.05;
    }
    this.addEvent(this.km, 'kom', `KOM points to ${this.riderMap.get(contenders[0]).rider.name}`);
  }

  resolveIntermediateSprint() {
    const pool = this.breakMembers.length ? [...this.breakMembers] : [...this.pelotonMembers];
    if (pool.length === 0) return;
    pool.sort((a, b) => {
      const sa = effectivePower(this.riderMap.get(a), this.statMap.get(a));
      const sb = effectivePower(this.riderMap.get(b), this.statMap.get(b));
      return sb - sa;
    });
    for (let i = 0; i < Math.min(SPRINT_POINTS.length, pool.length); i++) {
      this.statMap.get(pool[i]).sprintPoints += SPRINT_POINTS[i];
    }
  }

  resolveCrashes(fromKm, segLen) {
    const density = this.km > this.distanceKm - 50 ? 1.2 : 1.0;
    for (const id of Array.from(this.pelotonMembers)) {
      const rr = this.riderMap.get(id);
      const pr = rr.rider.injuryProne / 50;
      if (this.rng.chance(CRASH_PROB * pr * density)) {
        this.statMap.get(id).crashed = true;
        this.statMap.get(id).crashMinute = Math.round(this.pelotonKmTime / 60);
        this.statMap.get(id).rating -= 1.0;
        if (this.rng.chance(0.35)) {
          this.statMap.get(id).abandoned = true;
          this.statMap.get(id).weeksOut = 2 + Math.floor(this.rng.next() * 6);
          move(this.pelotonMembers, this.abandonedMembers, id);
          this.addEvent(fromKm, 'crash', `${rr.rider.name} crashes and abandons`);
        } else {
          this.statMap.get(id).weeksOut = 0;
          move(this.pelotonMembers, this.droppedMembers, id);
          this.statMap.get(id).dropped = true;
          this.addEvent(fromKm, 'crash', `${rr.rider.name} crashes and loses time`);
        }
      }
    }
  }

  applyConditionDecay(segLen, sector) {
    const hard = sector.type === 'climb' || sector.type === 'finish';
    for (const id of this.riderMap.keys()) {
      const st = this.statMap.get(id);
      if (st.abandoned) continue;
      const working = this.isPulling(id) || this.breakMembers.includes(id) || this.droppedMembers.includes(id);
      if (working) {
        st.condition = Math.max(20, st.condition - (hard ? 0.22 : 0.10) * segLen);
      } else {
        st.condition = Math.max(20, st.condition - (hard ? 0.06 : 0.02) * segLen);
      }
    }
  }

  isPulling(id) {
    if (!this.pelotonMembers.includes(id)) return false;
    const rr = this.riderMap.get(id);
    const o = this.teamOrders.get(rr.entry.shortName);
    return o.chase || o.control;
  }

  isIntermediateSprint(fromKm, toKm) {
    const sprints = [Math.round(this.distanceKm * 0.25), Math.round(this.distanceKm * 0.55)];
    return sprints.some((s) => fromKm < s && s <= toKm);
  }

  isSectorEnd(toKm, sector) {
    // Approximate sector end = sector start + sector.km
    const start = this.profile.profile.findIndex((s) => sector === s);
    if (start < 0) return false;
    const accum = this.profile.profile.slice(0, start + 1).reduce((a, s) => a + (s.km || 0), 0);
    return toKm >= accum;
  }

  addEvent(km, type, text) {
    const rr = this.entries.find((e) => e.shortName === this.userTeamShort()) || this.entries[0];
    this.events.push({ km: Math.round(km), type, text, team: rr.shortName });
  }

  userTeamShort() {
    // Placeholder: first team with a leader; UI can override.
    return this.entries[0]?.shortName;
  }

  pushSnapshot() {
    this.timeline.push({
      km: this.km,
      breakGap: Math.round(this.breakGapSec),
      pelotonSize: this.pelotonMembers.length,
      breakSize: this.breakMembers.length,
      droppedSize: this.droppedMembers.length,
    });
  }

  finish() {
    if (this.result) return this.result;
    this.finished = true;

    if (this.kind === 'itt') {
      return this.finishITT();
    }

    const sector = this.profile.profile[this.profile.profile.length - 1] || { type: 'flat' };
    // Build finish ordering.
    const orderIds = this.computeFinishOrder(sector);

    // Map to total race time.
    let currentTime = 0;
    let lastId = null;
    const gapMap = new Map();
    for (const id of orderIds) {
      if (lastId === null) {
        gapMap.set(id, 0);
      } else {
        const prevGap = gapMap.get(lastId);
        const inc = finishGapBetween(lastId, id, sector, this);
        gapMap.set(id, prevGap + inc);
      }
      lastId = id;
    }

    const placings = orderIds.map((id, idx) => {
      const rr = this.riderMap.get(id);
      const teamName = rr.entry.name;
      const gap = gapMap.get(id);
      const bunch = gap < 1;
      const st = this.statMap.get(id);
      if (idx === 0) st.rating += 1.5;
      else if (idx < 3) st.rating += 0.7;
      else if (idx < 10) st.rating += 0.25;
      return {
        rider: rr.rider,
        team: teamName,
        position: idx + 1,
        timeGap: gap,
        bunch,
      };
    });

    this.assignPullRatings();

    this.result = {
      seed: this.rng.getState(),
      raceId: this.profile.id,
      raceName: this.profile.name,
      kind: this.kind === 'gt-stage' ? 'gt-stage' : (this.kind === 'stage' ? 'stage' : 'classic'),
      profileKind: this.profile.kind,
      distanceKm: this.distanceKm,
      placings,
      winner: { rider: placings[0].rider, team: placings[0].team },
      komPoints: this.komLeaderboard(),
      sprintPoints: this.sprintLeaderboard(),
      playerStats: Array.from(this.statMap.values()),
      groups: [{
        km: this.km,
        label: 'finish',
        riders: orderIds.map((id) => this.riderMap.get(id).rider.name),
        gapSec: 0,
      }],
      events: this.events,
      crashes: this.crashReport(),
      timeline: this.timeline,
    };
    return this.result;
  }

  finishITT() {
    const ids = Array.from(this.riderMap.keys());
    ids.sort((a, b) => this.statMap.get(a).time - this.statMap.get(b).time);
    const placings = ids.map((id, idx) => {
      const rr = this.riderMap.get(id);
      const gap = this.statMap.get(id).time - this.statMap.get(ids[0]).time;
      return { rider: rr.rider, team: rr.entry.name, position: idx + 1, timeGap: gap, bunch: gap < 1 };
    });
    this.result = {
      seed: this.rng.getState(),
      raceId: this.profile.id,
      raceName: this.profile.name,
      kind: 'classic',
      profileKind: this.profile.kind,
      distanceKm: this.distanceKm,
      placings,
      winner: { rider: placings[0].rider, team: placings[0].team },
      komPoints: [],
      sprintPoints: [],
      playerStats: Array.from(this.statMap.values()),
      groups: [],
      events: this.events,
      crashes: this.crashReport(),
      timeline: this.timeline,
    };
    return this.result;
  }

  computeFinishOrder(sector) {
    const front = [...this.breakMembers, ...this.pelotonMembers];
    const back = [...this.droppedMembers];
    if (front.length === 0 && back.length) {
      // everyone abandoned except dropped somehow
      front.push(...back.splice(0));
    }

    const sortKey = (id) => {
      const rr = this.riderMap.get(id);
      const st = this.statMap.get(id);
      let base;
      if (sector.type === 'climb') base = effectiveClimb(rr, st) + (rr.role === 'LDR' ? 3 : 0);
      else base = effectivePower(rr, st) * (sector.type === 'hilly' ? 1.0 : 1.08);
      if (this.breakMembers.includes(id)) base += 6; // break advantage
      if (this.droppedMembers.includes(id)) base -= 20;
      if (rr.role === 'SPR' && sector.type === 'flat') base += leadoutBonus(rr, this) + 4;
      // One-day racing is inherently stochastic; strong riders are favoured but the
      // result is not pre-ordained. Variance is deterministic per seed.
      return base + this.rng.next() * 24;
    };

    front.sort((a, b) => sortKey(b) - sortKey(a));
    back.sort((a, b) => sortKey(b) - sortKey(a));
    return [...front, ...back];
  }

  assignPullRatings() {
    for (const id of this.riderMap.keys()) {
      const st = this.statMap.get(id);
      if (st.pullsKm > 0) st.rating += st.pullsKm * 0.005;
      if (st.pullsAtFront) st.rating += 0.06 * st.pullsAtFront;
      if (st.leadouts) st.rating += 0.4 * st.leadouts;
      if (st.dropped) st.rating -= 0.6;
      if (st.abandoned) st.rating -= 1.3;
      st.rating = clamp(st.rating, 1, 10);
    }
  }

  komLeaderboard() {
    const arr = Array.from(this.statMap.entries())
      .filter(([, st]) => st.komPoints > 0)
      .map(([id, st]) => ({ rider: this.riderMap.get(id).rider, points: st.komPoints }))
      .sort((a, b) => b.points - a.points);
    return arr.slice(0, 10);
  }

  sprintLeaderboard() {
    const arr = Array.from(this.statMap.entries())
      .filter(([, st]) => st.sprintPoints > 0)
      .map(([id, st]) => ({ rider: this.riderMap.get(id).rider, points: st.sprintPoints }))
      .sort((a, b) => b.points - a.points);
    return arr.slice(0, 10);
  }

  crashReport() {
    return Array.from(this.statMap.entries())
      .filter(([, st]) => st.crashed)
      .map(([id, st]) => ({
        rider: this.riderMap.get(id).rider,
        team: this.riderMap.get(id).entry.name,
        km: Math.round(st.crashMinute / 60 * 50),
        weeksOut: st.weeksOut,
        abandoned: st.abandoned,
      }));
  }
}

export function simulateRace(teams, profile, options) {
  return new RaceSim(teams, profile, options).simulateToEnd();
}

function emptyOrders() {
  return { chase: false, control: false, sendUpRoad: false, leadout: false, attack: false };
}

function createStatLine(rider) {
  return {
    id: rider.id,
    name: rider.name,
    type: rider.type,
    role: rider.type,
    started: true,
    kmRidden: 0,
    rating: 6.0,
    pulls: 0,
    pullsKm: 0,
    pullsAtFront: 0,
    leadouts: 0,
    position: null,
    timeGap: null,
    komPoints: 0,
    sprintPoints: 0,
    dropped: false,
    abandoned: false,
    crashed: false,
    crashMinute: null,
    weeksOut: 0,
    condition: rider.condition ?? 100,
    morale: rider.morale ?? 70,
    form: rider.form ?? 6.0,
    time: 0,
  };
}

function normalizeTeams(teams, profile) {
  if (!Array.isArray(teams)) throw new TypeError('RaceSim: teams must be an array');
  return teams.map((team) => {
    if (team.starters) {
      // prepared lineup
      return {
        name: team.name,
        shortName: team.shortName || team.name.slice(0, 3),
        plan: team.plan || 'All-Round',
        aggression: team.aggression || 'normal',
        riders: team.starters.map((s) => ({ rider: s.rider, role: s.role || s.rider.type, entry: team })),
      };
    }
    const riders = team.riders || [];
    const use = riders.length <= MAX_BENCH + RACE_TEAM_SIZE
      ? riders
      : riders.slice(0, RACE_TEAM_SIZE); // caller is expected to pass selected 8
    return {
      name: team.name,
      shortName: team.shortName || team.name.slice(0, 3),
      plan: team.plan || 'All-Round',
      aggression: team.aggression || 'normal',
      riders: use.map((r) => ({ rider: r, role: r.role || r.type, entry: team })),
    };
  });
}

function sectorAt(profile, km) {
  if (!profile || !Array.isArray(profile.profile) || profile.profile.length === 0) {
    return { type: 'flat', km: 1000 };
  }
  let accum = 0;
  for (const s of profile.profile) {
    accum += (s.km || 0);
    if (km <= accum) return s;
  }
  return profile.profile[profile.profile.length - 1];
}

function chooseSegmentLength(km, remaining) {
  if (remaining <= 5) return 1;
  if (remaining <= 15) return 2;
  if (remaining <= 30) return 5;
  return 10;
}

function effectiveStrength(rr, sector, st) {
  const attr = sector.type === 'climb' ? rr.rider.climb : rr.rider.power;
  const penalty = slotPenalty(rr.rider, rr.role);
  const sharp = sharpness(rr.rider, st);
  const cond = 0.7 + 0.3 * (st ? st.condition : 100) / 100;
  return clamp(attr * penalty * sharp * cond, 1, 120);
}

function effectiveClimb(rr, st) {
  const attr = rr.rider.climb * (rr.role === 'LDR' ? 1.02 : 1.0);
  const penalty = slotPenalty(rr.rider, rr.role);
  const sharp = sharpness(rr.rider, st);
  const cond = 0.7 + 0.3 * (st ? st.condition : 100) / 100;
  return clamp(attr * penalty * sharp * cond, 1, 120);
}

function effectivePower(rr, st) {
  const attr = rr.rider.power;
  const penalty = slotPenalty(rr.rider, rr.role);
  const sharp = sharpness(rr.rider, st);
  const cond = 0.7 + 0.3 * (st ? st.condition : 100) / 100;
  return clamp(attr * penalty * sharp * cond, 1, 120);
}

function pooledStrength(rrList, sector) {
  if (rrList.length === 0) return 1;
  const scores = rrList.map((rr) => (sector.type === 'climb' ? effectiveClimb(rr) : effectivePower(rr)));
  // top half dominates
  scores.sort((a, b) => b - a);
  const half = Math.max(1, Math.ceil(rrList.length / 2));
  let total = 0;
  for (let i = 0; i < half; i++) total += scores[i];
  return total / half;
}

function sharpness(rider, st) {
  const base = 1.0;
  const morale = ((st ? st.morale : rider.morale) - 50) / 200; // -0.245 .. +0.245
  const form = ((st ? st.form : rider.form) - 6.0) / 30; // small
  const con = ((st ? st.condition : rider.condition) - 80) / 400;
  return base + morale + form + con;
}

function computeBreakFormChance(entries, orders, sector, rng) {
  const r = { prob: BASE_BREAK_PROB, riders: [] };
  // Breaks are more likely on rolling/flat terrain before climbs; very rare in a
  // summit finish segment.
  if (sector.type === 'finish') {
    r.prob *= 0.2;
  }
  // Collect candidates from attacking/non-sprint teams.
  const candidates = [];
  for (const e of entries) {
    if (e.plan === 'Sprint Train') continue;
    for (const rr of e.riders) {
      if (rr.role === 'SPR') continue;
      candidates.push(rr);
    }
  }
  if (candidates.length === 0) return r;
  // pick 2-6 riders
  const size = 2 + Math.floor(rng.next() * 5);
  r.riders = rng.shuffle(candidates).slice(0, size).map((rr) => rr.rider.id);
  // scale probability by candidate count; capped to ensure most races see action
  r.prob = Math.min(0.75, r.prob * (candidates.length / 10));
  return r;
}

function move(src, dst, id) {
  const idx = src.indexOf(id);
  if (idx >= 0) src.splice(idx, 1);
  if (!dst.includes(id)) dst.push(id);
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function abilityProxy(rider) {
  return rider.ability || (0.6 * rider.power + 0.4 * rider.climb);
}

function finishGapBetween(idA, idB, sector, sim) {
  const rrA = sim.riderMap.get(idA);
  const rrB = sim.riderMap.get(idB);
  const stA = sim.statMap.get(idA);
  const stB = sim.statMap.get(idB);
  const a = sector.type === 'climb' ? effectiveClimb(rrA, stA) : effectivePower(rrA, stA);
  const b = sector.type === 'climb' ? effectiveClimb(rrB, stB) : effectivePower(rrB, stB);
  const diff = a - b;
  // sprinters bunch on flat; gaps small
  let base = sector.type === 'flat' ? 0.05 : 0.25;
  if (sector.type === 'climb') base = 1.2;
  if (sim.droppedMembers.includes(idB)) base += 8;
  // bonus for breakaway if b is in peloton after a in break
  if (sim.breakMembers.includes(idA) && sim.pelotonMembers.includes(idB)) base += sim.breakGapSec * 0.6;
  const gap = base + Math.max(0, diff * -0.08);
  const noise = sim.rng.next() * 0.3;
  return clamp(gap + noise, 0.01, 300);
}

function leadoutBonus(rr, sim) {
  const team = rr.entry;
  const helpers = team.riders.filter((x) =>
    x.rider.id !== rr.rider.id &&
    (x.rider.type === 'SPR' || x.rider.type === 'ROU') &&
    !sim.statMap.get(x.rider.id).abandoned &&
    sim.statMap.get(x.rider.id).condition > 50
  );
  return Math.min(8, helpers.reduce((s, x) => s + x.rider.power * 0.04, 0));
}
