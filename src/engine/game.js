// src/engine/game.js
// Career orchestrator and state owner. Pure module — no DOM, no I/O.
// Maintains the single RNG, advances weeks, handles transfers, sponsorship,
// board, season-end transition, and save/restore.

import { createRng } from './rng.js';
import { TEAMS, buildTeams, teamFinances } from '../data/teams.js';
import { selectRaceTeam, RACE_PLANS, validateTeam } from './squad.js';
import { simulateRace } from './race.js';
import { createGrandTour, advanceStage, jerseyHolders } from './gt.js';
import { buildCalendar, raceProfile, monthName } from './season.js';
import { computeStandings, awardPoints } from './series.js';
import {
  askingPrice, evaluateBid, wageDemand, freeAgentWage,
  riderAgrees, canRelease, aiInterest, aiOfferAmount, searchRiders,
} from './transfers.js';
import { developRider, shouldRetire, isAvailable, ability, neoProId } from './riders.js';

export const SAVE_VERSION = 1;
export const SACK_THRESHOLD = 15;
export const SCOUT_FEE = 25000;

const MONTHLY_AWARD_MIN_RACE_DAYS = 3;

export class Game {
  constructor(managerName, teamName, seed, restoreData = null) {
    this.version = SAVE_VERSION;
    this.managerName = managerName;
    this.teamName = teamName;
    this.seed = seed;
    this.rng = createRng(seed);

    this.teams = buildTeams();
    this.freeAgents = [];
    this.seasonIndex = 0;
    this.week = 0;
    this.calendar = buildCalendar();
    this.results = [];
    this.grandTours = {
      giro: createGrandTour('giro', "Giro d'Italia", this.gtStartWeek('giro'), { totalStages: 21 }),
      tour: createGrandTour('tour', 'Tour de France', this.gtStartWeek('tour'), { totalStages: 21 }),
      vuelta: createGrandTour('vuelta', 'Vuelta a España', this.gtStartWeek('vuelta'), { totalStages: 21 }),
    };
    this.seriesStandings = [];
    this.seasonStats = {};
    this.monthly = {};
    this.inbox = [];
    this.pendingOffers = [];
    this.nextOfferId = 1;
    this.board = { confidence: 60 };
    this.racePlan = { plan: 'All-Round', aggression: 'normal' };
    this.history = [];
    this.reputation = 40;
    this.sacked = false;
    this.jobOffers = [];
    this.pendingJobOffer = null;
    this.scouted = {};
    this.pendingScouts = [];
    this.monthlyAwards = {};

    if (restoreData) {
      Object.assign(this, restoreData);
      this.rng = createRng(this.seed ?? 0);
      if (restoreData.rngState !== undefined) this.rng.setState(restoreData.rngState);
    }
  }

  gtStartWeek(raceId) {
    const week = this.calendar.findIndex((e) => e.raceId === raceId);
    return week < 0 ? 0 : week;
  }

  static newGame(managerName, teamName, seed) {
    return new Game(managerName, teamName, seed);
  }

  static restore(data) {
    if ((data.version || 0) !== SAVE_VERSION) {
      throw new Error(`Save version mismatch: expected ${SAVE_VERSION}, got ${data.version}`);
    }
    const g = new Game(data.managerName, data.teamName, data.seed ?? 0, data);
    return g;
  }

  serialize() {
    return {
      ...this,
      rngState: this.rng.getState(),
    };
  }

  userTeam() {
    return this.teams.find((t) => t.name === this.teamName);
  }

  currentEntry() {
    return this.calendar[this.week];
  }

  currentRaceProfile() {
    const entry = this.currentEntry();
    if (!entry) return null;
    return raceProfile(entry.raceId, entry.stage);
  }

  userHasRaceThisWeek() {
    const entry = this.currentEntry();
    return !!entry;
  }

  prepareTeamForRace(team) {
    const plan = team === this.userTeam() ? this.racePlan.plan : teamDefaultPlan(team, this.currentRaceProfile());
    const aggression = team === this.userTeam() ? this.racePlan.aggression : 'normal';
    const { starters } = selectRaceTeam(team, plan, 0, this.rng);
    return {
      name: team.name,
      shortName: team.shortName,
      plan,
      aggression,
      starters: starters.map((r) => ({ rider: r, role: r.type })),
    };
  }

  /** Main weekly heartbeat. Pass a user RaceResult if the player managed the race. */
  advanceWeek(userResult = null) {
    if (this.week >= this.calendar.length) {
      return this.seasonEnd();
    }

    const entry = this.currentEntry();
    const profile = this.currentRaceProfile();
    // Run a single combined race with all 24 prepared teams. Every team sees the same result.
    const allSetups = this.teams.map((team) => this.prepareTeamForRace(team));
    const seedForRace = Math.floor(this.rng.next() * 0x100000000);
    const sharedResult = userResult || simulateRace(allSetups, profile, { rng: createRng(seedForRace) });

    this.results.push(sharedResult);
    this.applyRaceResult(sharedResult, entry);

    // Series points.
    const pts = awardPoints(sharedResult);
    this.seriesStandings = computeStandings(this.results);

    // Grand Tour stage handling.
    if (entry.type === 'gt') {
      const gt = this.grandTours[entry.raceId];
      if (gt) {
        advanceStage(gt, sharedResult);
        if (gt.finished) {
          this.board.confidence = Math.min(100, this.board.confidence + 10);
          this.reputation += 20;
          this.notify('Grand Tour won', `${gt.name} has finished. Your GC result counts toward the board.`);
        }
      }
    }

    // Weekly upkeep.
    this.weeklyUpkeep();
    this.tickInfrastructure();
    this.tickScouts();
    this.aiTransferActivity();
    this.updateBoard(entry, sharedResult);

    this.week += 1;

    // Monthly awards.
    if (this.week % 4 === 0 && this.week > 0) {
      this.issueMonthlyAward();
    }

    this.saveSnapshot();
    return sharedResult;
  }

  applyRaceResult(result, entry) {
    const userTeam = this.userTeam();
    for (const team of this.teams) {
      const gotResult = result.placings.some((p) => p.team === team.name);
      const best = result.placings.find((p) => p.team === team.name);
      if (best) {
        if (best.position === 1) {
          team.formGuide.push('W');
          team.marketability = Math.floor(Math.max(200, team.marketability * 1.01));
          this.updateMorale(team, +8);
        } else if (best.position <= 3) {
          team.formGuide.push('T');
          team.marketability = Math.floor(Math.max(200, team.marketability * 1.004));
          this.updateMorale(team, +3);
        } else if (best.position <= 10) {
          team.formGuide.push('T');
          team.marketability = Math.floor(Math.max(200, team.marketability * 1.002));
          this.updateMorale(team, +1);
        } else {
          team.formGuide.push('L');
          team.marketability = Math.floor(Math.max(200, team.marketability * 0.997));
          this.updateMorale(team, -2);
        }
        if (team.formGuide.length > 5) team.formGuide.shift();
      }

      // Prize money to balance.
      const pts = awardPoints(result);
      if (pts.perTeam.has(team.name)) {
        const purse = pts.perTeam.get(team.name) * 100;
        team.balance += purse;
      }

      // Injuries and condition from crashes.
      for (const c of result.crashes || []) {
        if (c.team === team.name) {
          const rider = team.riders.find((r) => r.name === c.rider.name);
          if (rider) {
            rider.condition = Math.max(20, rider.condition - 25);
            rider.injuryWeeks = Math.max(rider.injuryWeeks, c.weeksOut || 0);
            if (c.abandoned) rider.abandonedRace = result.raceId;
          }
        }
      }
    }
  }

  updateMorale(team, delta) {
    for (const r of team.riders) {
      r.morale = clamp(r.morale + delta, 20, 99);
    }
  }

  weeklyUpkeep() {
    for (const team of this.teams) {
      const weeklyWage = this.totalWageBill(team) / 52;
      team.balance = Math.round(team.balance - weeklyWage);
      for (const r of team.riders) {
        if (r.injuryWeeks > 0) r.injuryWeeks -= 1;
        r.condition = Math.min(100, Math.round(r.condition + 16));
        // Form drifts toward baseline.
        r.form = r.form * 0.8 + 6.0 * 0.2;
      }
    }
  }

  totalWageBill(team) {
    return team.riders.reduce((s, r) => s + (r.wage || 0), 0);
  }

  updateBoard(entry, result) {
    const userTeam = this.userTeam();
    const idx = this.seriesStandings.findIndex((r) => r.team === userTeam.name);
    const position = idx >= 0 ? idx + 1 : this.teams.length;
    const expectation = userTeam.expectation || 12;
    const drift = clamp(expectation - position, -2, +2);
    let resultDelta = 0;
    const best = result.placings.find((p) => p.team === userTeam.name);
    if (best) {
      if (best.position === 1) resultDelta = +3;
      else if (best.position <= expectation) resultDelta = +1;
      else if (best.position > 10) resultDelta = -2;
    }
    this.board.confidence = clamp(this.board.confidence + drift + resultDelta, 0, 100);
    if (this.board.confidence < SACK_THRESHOLD) {
      this.sackManager();
    }
  }

  sackManager() {
    this.sacked = true;
    this.reputation = Math.max(5, this.reputation - 12);
    this.jobOffers = this.teams
      .filter((t) => t.tier <= this.reputation + 15 && t.name !== this.teamName)
      .slice(0, 2)
      .map((t) => t.name);
    this.notify('You have been sacked', 'Board confidence fell below the threshold. Job offers available.');
  }

  tickInfrastructure() {
    for (const team of this.teams) {
      if (team.infraBuild) {
        team.infraBuild.weeksLeft -= 1;
        if (team.infraBuild.weeksLeft <= 0) {
          team.infraLevel = Math.min(5, team.infraLevel + 1);
          team.infraBuild = null;
        }
      }
    }
  }

  buildInfrastructure(team, level) {
    const cost = level * 500000;
    if (team.balance < cost * 2) return { ok: false, reason: 'Insufficient funds' };
    team.balance -= cost;
    team.infraBuild = { level, weeksLeft: 12 };
    return { ok: true };
  }

  tickScouts() {
    for (const scout of this.pendingScouts) {
      scout.weeksLeft -= 1;
      if (scout.weeksLeft <= 0) {
        this.scouted[scout.riderId] = true;
      }
    }
    this.pendingScouts = this.pendingScouts.filter((s) => s.weeksLeft > 0);
  }

  scoutRider(rider) {
    const team = this.userTeam();
    if (team.balance < SCOUT_FEE) return false;
    team.balance -= SCOUT_FEE;
    this.pendingScouts.push({ riderId: rider.id, weeksLeft: 1 });
    return true;
  }

  attrDisplay(rider) {
    if (this.isOwnRider(rider) || this.scouted[rider.id]) return { exact: true };
    return { exact: false };
  }

  isOwnRider(rider) {
    return this.userTeam().riders.some((r) => r.id === rider.id);
  }

  aiTransferActivity() {
    // AI team vs AI team transfers.
    for (const team of this.teams) {
      if (team.name === this.teamName) continue;
      if (this.rng.chance(0.15)) {
        this.runAiTransfer(team);
      }
    }
    // AI offers for a user rider.
    if (this.rng.chance(0.22)) {
      this.aiOfferForUserRider();
    }
  }

  runAiTransfer(buyer) {
    const sellers = this.teams.filter((t) => t.name !== buyer.name);
    const rider = this.pickAiTransferTarget(buyer, sellers);
    if (!rider) return;
    const amount = aiOfferAmount(this.rng, rider);
    if (buyer.transferBudget >= amount && canRelease(rider.teamObj, rider)) {
      this.transferRider(rider, rider.teamObj, buyer, amount);
    }
  }

  pickAiTransferTarget(buyer, sellers) {
    const pool = [];
    for (const team of sellers) {
      for (const r of team.riders) {
        const interest = aiInterest(buyer, r) * (r.listed ? 2.5 : 1);
        if (interest > 0) pool.push({ r, team, interest });
      }
    }
    if (pool.length === 0) return null;
    const pick = this.rng.weightedPick(pool.map((p) => ({ item: p, weight: p.interest })));
    return { ...pick.r, teamObj: pick.team };
  }

  aiOfferForUserRider() {
    const team = this.userTeam();
    const listed = team.riders.filter((r) => r.listed);
    const pool = listed.length ? listed : team.riders.slice();
    const rider = this.rng.pick(pool);
    const bidder = this.rng.pick(this.teams.filter((t) => t.name !== team.name && t.tier >= team.tier - 10));
    if (!bidder) return;
    const amount = aiOfferAmount(this.rng, rider);
    if (bidder.transferBudget < amount) return;
    this.pendingOffers.push({
      id: this.nextOfferId++,
      riderId: rider.id,
      riderName: rider.name,
      from: bidder.name,
      amount,
      week: this.week,
    });
  }

  acceptOffer(offerId) {
    const idx = this.pendingOffers.findIndex((o) => o.id === offerId);
    if (idx < 0) return false;
    const offer = this.pendingOffers[idx];
    this.pendingOffers.splice(idx, 1);
    const buyer = this.teams.find((t) => t.name === offer.from);
    const seller = this.userTeam();
    const rider = seller.riders.find((r) => r.id === offer.riderId);
    if (!buyer || !rider || !canRelease(seller, rider)) return false;
    this.transferRider(rider, seller, buyer, offer.amount);
    return true;
  }

  rejectOffer(offerId) {
    this.pendingOffers = this.pendingOffers.filter((o) => o.id !== offerId);
  }

  /** Bid for a rider from another team or free agent (toTeam = user team). */
  bidForRider(rider, sellerTeam, amount) {
    const team = this.userTeam();
    if (!canRelease(sellerTeam, rider)) return { ok: false, reason: 'Seller cannot release rider' };
    if (team.transferBudget < amount) return { ok: false, reason: 'Transfer budget too low' };
    const bid = evaluateBid(sellerTeam, rider, amount);
    if (bid.status === 'accepted' || amount >= askingPrice(sellerTeam, rider)) {
      const wage = freeAgentWage(rider);
      if (team.balance < wage) return { ok: false, reason: 'Cannot afford wage' };
      this.transferRider(rider, sellerTeam, team, amount, wage);
      return { ok: true };
    }
    return { ok: false, reason: `Bid ${bid.status}${bid.counter ? `; counter ${bid.counter}` : ''}` };
  }

  transferRider(rider, fromTeam, toTeam, amount, newWage = null) {
    fromTeam.riders = fromTeam.riders.filter((r) => r.id !== rider.id);
    toTeam.riders.push(rider);
    fromTeam.balance += amount;
    fromTeam.transferBudget -= amount;
    toTeam.transferBudget -= amount;
    if (newWage) rider.wage = newWage;
    rider.contractYears = Math.max(rider.contractYears, 2);
    this.notify('Transfer completed', `${rider.name} moves to ${toTeam.name} for £${amount.toLocaleString()}`);
  }

  listRider(rider, listed = true) {
    rider.listed = listed;
  }

  renewContract(rider) {
    const team = this.userTeam();
    if (team.balance < rider.wage) return false;
    team.balance -= rider.wage;
    rider.contractYears += 2;
    return true;
  }

  offerContractToFreeAgent(rider) {
    const team = this.userTeam();
    if (team.riders.length >= team.capacity) return { ok: false, reason: 'Squad full' };
    if (team.balance < freeAgentWage(rider)) return { ok: false, reason: 'Wage budget' };
    if (!riderAgrees(this.rng, rider, 50, team.tier)) return { ok: false, reason: 'Rider unwilling' };
    this.freeAgents = this.freeAgents.filter((r) => r.id !== rider.id);
    rider.contractYears = 2;
    team.riders.push(rider);
    team.balance -= freeAgentWage(rider);
    return { ok: true };
  }

  seasonEnd() {
    const userTeam = this.userTeam();
    this.seriesStandings = computeStandings(this.results);

    // Promotion / relegation.
    const div1 = this.teams.filter((t) => t.division === 1);
    const div2 = this.teams.filter((t) => t.division === 2);
    div1.sort((a, b) => this.standingOf(a) - this.standingOf(b));
    div2.sort((a, b) => this.standingOf(a) - this.standingOf(b));
    const relegated = div1.slice(-2);
    const promoted = div2.slice(0, 2);
    for (const t of relegated) t.division = 2;
    for (const t of promoted) t.division = 1;

    // Reputation and board verdict.
    const userPos = this.standingOf(userTeam);
    if (relegated.some((t) => t.name === userTeam.name)) this.reputation -= 8;
    if (this.seriesStandings[0]?.team === userTeam.name) {
      this.reputation += 8;
    }

    // Awards.
    const pointsLeader = this.seriesLeaderRider();
    const riderOfSeason = this.riderOfSeason();
    this.history.push({
      season: this.seasonIndex,
      seriesChampion: this.seriesStandings[0]?.team || null,
      promoted: promoted.map((t) => t.name),
      relegated: relegated.map((t) => t.name),
      userPosition: userPos,
      userDivision: userTeam.division,
      giro: this.gtPodium(this.grandTours.giro),
      tour: this.gtPodium(this.grandTours.tour),
      vuelta: this.gtPodium(this.grandTours.vuelta),
      topPointsScorer: pointsLeader,
      riderOfSeason,
    });

    // Development & retirement.
    for (const team of this.teams) {
      team.riders = team.riders
        .map((r) => developRider(r, this.rng))
        .filter((r) => !shouldRetire(r, this.rng));
      // Fill eliminated leaders slot if needed.
      while (team.riders.filter((r) => r.type === 'LDR').length < 2) {
        team.riders.push(this.generateNeoPro(team));
      }
      while (team.riders.length < 22) {
        team.riders.push(this.generateNeoPro(team));
      }
      // Contract expiry. The user must renew deliberately; AI teams retain 70%.
      const retained = [];
      for (const r of team.riders) {
        if (r.contractYears === 0) {
          if (team.name === userTeam.name || this.rng.chance(0.7)) {
            r.contractYears = 2;
            retained.push(r);
          } else {
            this.freeAgents.push(r);
          }
        } else {
          retained.push(r);
        }
      }
      team.riders = retained;
      if (team.name !== userTeam.name && this.rng.chance(0.3)) {
        this.aiBuildInfrastructure(team);
      }
    }

    // Reset free agents cap.
    if (this.freeAgents.length > 60) this.freeAgents = this.rng.shuffle(this.freeAgents).slice(0, 60);

    // Calendar & GT reset.
    this.seasonIndex += 1;
    this.week = 0;
    this.calendar = buildCalendar();
    this.results = [];
    this.grandTours = {
      giro: createGrandTour('giro', "Giro d'Italia", this.gtStartWeek('giro'), { totalStages: 21 }),
      tour: createGrandTour('tour', 'Tour de France', this.gtStartWeek('tour'), { totalStages: 21 }),
      vuelta: createGrandTour('vuelta', 'Vuelta a España', this.gtStartWeek('vuelta'), { totalStages: 21 }),
    };
    this.seriesStandings = [];
    this.seasonStats = {};
    this.monthly = {};
    this.pendingOffers = [];
    this.pendingScouts = [];
    this.monthlyAwards = {};
    for (const t of this.teams) {
      t.expectation = this.newExpectation(t);
      t.formGuide = [];
    }
    return this.history[this.history.length - 1];
  }

  standingOf(team) {
    const idx = this.seriesStandings.findIndex((r) => r.team === team.name);
    return idx >= 0 ? idx + 1 : this.teams.length;
  }

  seriesLeaderRider() {
    let best = null;
    for (const id in this.seasonStats) {
      const s = this.seasonStats[id];
      if (!best || (s.raceDays >= 3 && (s.pointsSum || 0) > (best.pointsSum || 0))) {
        best = s;
      }
    }
    if (!best) return null;
    return { name: best.name, team: best.team, points: best.pointsSum };
  }

  riderOfSeason() {
    let best = null;
    for (const id in this.seasonStats) {
      const s = this.seasonStats[id];
      if (!best || (s.raceDays >= 3 && (s.ratingAvg || 0) > (best.ratingAvg || 0))) {
        best = s;
      }
    }
    if (!best) return null;
    return { name: best.name, team: best.team, avg: best.ratingAvg };
  }

  gtPodium(gt) {
    const sorted = Object.values(gt.gc).sort((a, b) => a.totalTime - b.totalTime);
    return {
      winner: sorted[0]?.rider?.name || null,
      gc2: sorted[1]?.rider?.name || null,
      gc3: sorted[2]?.rider?.name || null,
    };
  }

  newExpectation(team) {
    const strength = team.riders.reduce((s, r) => s + ability(r), 0) / Math.max(1, team.riders.length);
    const division = team.division || 1;
    let exp = 12 - Math.floor((strength - 50) / 4);
    if (exp < 1) exp = 1;
    if (exp > 12) exp = 12;
    if (division === 1) return exp;
    return exp; // same 1-12 scale within division expectations
  }

  generateNeoPro(team) {
    const idx = team.riders.filter((r) => r.id.includes('-Y')).length + 1;
    const role = this.rng.pick(['LDR', 'SPR', 'CLM', 'ROU']);
    const name = `Neo-pro ${team.shortName} ${idx}`;
    const base = 45 + this.rng.int(0, 18);
    const attrs = role === 'SPR' || role === 'ROU'
      ? { power: base + 6, climb: Math.max(1, base - 6) }
      : { power: Math.max(1, base - 4), climb: base + 4 };
    const rider = {
      id: neoProId(team.uciCode, idx),
      name,
      type: role,
      age: 19 + this.rng.int(0, 3),
      power: clamp(attrs.power, 1, 99),
      climb: clamp(attrs.climb, 1, 99),
      tt: Math.round(0.6 * attrs.power + 0.4 * 55),
      consistency: 50 + this.rng.int(0, 25),
      injuryProne: 40 + this.rng.int(0, 30),
      wage: 25000,
      value: 25000,
      contractYears: 3,
      condition: 100,
      form: 6.0,
      morale: 70,
      injuryWeeks: 0,
      abandonedRace: null,
      listed: false,
    };
    rider.ability = ability(rider);
    return rider;
  }

  aiBuildInfrastructure(team) {
    if (team.infraLevel >= 5 || team.infraBuild) return;
    const next = team.infraLevel + 1;
    const cost = next * 500000;
    if (team.balance >= cost * 2) {
      team.balance -= cost;
      team.infraBuild = { level: next, weeksLeft: 12 };
    }
  }

  issueMonthlyAward() {
    let best = null;
    for (const id in this.monthly) {
      const m = this.monthly[id];
      if (m.n >= MONTHLY_AWARD_MIN_RACE_DAYS && (!best || m.sum / m.n > best.avg)) {
        best = { id, avg: m.sum / m.n };
      }
    }
    if (best) {
      this.monthlyAwards[this.week] = best.id;
    }
    this.monthly = {};
  }

  notify(subject, body) {
    this.inbox.unshift({
      week: this.week,
      season: this.seasonIndex,
      subject,
      body,
    });
    if (this.inbox.length > 120) this.inbox.pop();
  }

  saveSnapshot() {
    // Placeholder for auto-save trigger; the UI calls serialize() to localStorage.
  }

  oppositionReport(teamName) {
    const team = this.teams.find((t) => t.name === teamName);
    if (!team) return null;
    const { starters } = selectRaceTeam(team, teamDefaultPlan(team, this.currentRaceProfile()));
    const danger = team.riders.reduce((best, r) => (!best || ability(r) > ability(best) ? r : best));
    return {
      team,
      formGuide: team.formGuide,
      predicted: starters,
      danger,
    };
  }
}

function teamDefaultPlan(team, profile) {
  if (!profile) return 'All-Round';
  const parcour = profile.parcourType;
  if (parcour === 'mountain') return 'Climbing Block';
  if (parcour === 'flat') return 'Sprint Train';
  if (parcour === 'itt') return 'All-Round';
  return 'All-Round';
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
