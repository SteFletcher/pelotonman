// js/app.js
// UI controller for Pelotonman. Thin client over the engine.

import { Game } from '../src/engine/game.js';
import { TEAMS } from '../src/data/teams.js';
import { RACE_PLANS, AGGRESSIONS, selectRaceTeam, planWarning } from '../src/engine/squad.js';
import { ability } from '../src/engine/riders.js';
import { jerseyHolders, overallGc } from '../src/engine/gt.js';
import { askingPrice, evaluateBid, SCOUT_FEE } from '../src/engine/transfers.js';
import { raceProfile } from '../src/engine/season.js';
import { RaceSim } from '../src/engine/race.js';

const SAVE_KEY = 'pelotonman-save';

const state = {
  game: null,
  screen: 'start',
  selectedRiderId: null,
  liveSim: null,
  raceTimer: null,
  raceSpeed: 'normal',
  pendingBid: null,
};

const els = {
  topbar: document.getElementById('topbar'),
  mainWrap: document.getElementById('main-wrap'),
  sidebar: document.getElementById('sidebar'),
  content: document.getElementById('screen-content'),
  hud: document.getElementById('hud'),
  continueBtn: document.getElementById('continue-btn'),
  saveBtn: document.getElementById('save-btn'),
  inboxBadge: document.getElementById('inbox-badge'),
};

function init() {
  document.getElementById('continue-btn').addEventListener('click', onContinue);
  document.getElementById('save-btn').addEventListener('click', saveGame);
  document.querySelectorAll('#sidebar button[data-screen]').forEach((b) => {
    b.addEventListener('click', () => selectScreen(b.dataset.screen));
  });

  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    try {
      state.game = Game.restore(JSON.parse(saved));
      showMainUI();
      selectScreen('inbox');
      return;
    } catch (e) {
      console.error('Failed to restore save:', e);
    }
  }
  renderStartScreen();
}

function saveGame() {
  if (!state.game) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.game.serialize()));
  alert('Career saved.');
}

function formatMoney(n) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `£${Math.round(n / 1000)}k`;
  return `£${n}`;
}

function showMainUI() {
  els.topbar.classList.remove('hidden');
  els.mainWrap.classList.remove('hidden');
  els.sidebar.classList.remove('hidden');
  updateHud();
}

function updateHud() {
  const g = state.game;
  const t = g.userTeam();
  els.hud.textContent = `${g.managerName} · ${t.name} · S${g.seasonIndex + 1} W${g.week + 1} · ${formatMoney(t.balance)}`;
  els.inboxBadge.textContent = g.pendingOffers.length || '';
}

function selectScreen(name) {
  stopRaceTimer();
  state.screen = name;
  render();
}

function render() {
  const g = state.game;
  if (!g) return renderStartScreen();
  updateHud();

  switch (state.screen) {
    case 'start': renderStartScreen(); break;
    case 'inbox': renderInbox(); break;
    case 'squad': renderSquad(); break;
    case 'race-plan': renderRacePlan(); break;
    case 'calendar': renderCalendar(); break;
    case 'series': renderSeries(); break;
    case 'grand-tours': renderGrandTours(); break;
    case 'transfers': renderTransfers(); break;
    case 'finances': renderFinances(); break;
    case 'team-board': renderTeamBoard(); break;
    case 'pre-race': renderPreRace(); break;
    case 'live-race': renderLiveRace(); break;
    case 'full-time': renderFullTime(); break;
    default: renderInbox();
  }
}

function renderStartScreen() {
  const saved = localStorage.getItem(SAVE_KEY);
  els.topbar.classList.add('hidden');
  els.mainWrap.classList.add('hidden');
  els.sidebar.classList.add('hidden');

  let html = `
    <section id="start-screen">
      <h1>🚴 Pelotonman</h1>
      <div class="panel">
        <label>Manager name</label>
        <input id="manager-name" placeholder="Your name" value="Directeur Sportif">
        ${saved ? '<button id="continue-save">▶ Continue saved career</button>' : ''}
      </div>
      <h2>Select a team</h2>
      <table class="grid clickable">
        <thead><tr><th>Team</th><th>Div</th><th>Tier</th><th>LDR</th><th>SPR</th><th>CLM</th><th>ROU</th><th>OVR</th></tr></thead>
        <tbody>
  `;
  for (const team of TEAMS) {
    const ratings = selectRaceTeam(team, 'All-Round').starters.reduce((acc, r) => {
      acc[r.type].push(ability(r));
      return acc;
    }, { LDR: [], SPR: [], CLM: [], ROU: [] });
    const byRole = (role) => ratings[role].length ? Math.round(ratings[role].reduce((a, b) => a + b, 0) / ratings[role].length) : 0;
    const ovr = Math.round((byRole('LDR') + byRole('SPR') + byRole('CLM') + byRole('ROU')) / 4);
    html += `<tr class="team-row" data-team="${team.name}">
      <td>${team.name}</td><td>${team.division}</td><td>${team.tier}</td>
      <td>${byRole('LDR')}</td><td>${byRole('SPR')}</td><td>${byRole('CLM')}</td><td>${byRole('ROU')}</td><td>${ovr}</td>
    </tr>`;
  }
  html += '</tbody></table></section>';
  els.content.innerHTML = html;

  els.content.querySelectorAll('.team-row').forEach((row) => {
    row.addEventListener('click', () => {
      els.content.querySelectorAll('.team-row').forEach((r) => r.classList.remove('selected'));
      row.classList.add('selected');
    });
    row.addEventListener('dblclick', () => startCareer(row.dataset.team));
  });

  const savedBtn = document.getElementById('continue-save');
  if (savedBtn) savedBtn.addEventListener('click', loadCareer);
}

function startCareer(teamName) {
  const manager = document.getElementById('manager-name')?.value || 'Manager';
  state.game = Game.newGame(manager, teamName, Date.now().toString());
  showMainUI();
  selectScreen('inbox');
  saveGame();
}

function loadCareer() {
  const data = JSON.parse(localStorage.getItem(SAVE_KEY));
  state.game = Game.restore(data);
  showMainUI();
  selectScreen('inbox');
}

function onContinue() {
  const g = state.game;
  if (state.screen === 'live-race') {
    // If currently racing, just speed up.
    state.raceSpeed = state.raceSpeed === 'normal' ? 'fast' : 'instant';
    return;
  }
  if (g.week >= g.calendar.length) {
    g.seasonEnd();
    selectScreen('team-board');
    return;
  }
  const entry = g.currentEntry();
  if (entry) {
    selectScreen('pre-race');
  } else {
    g.advanceWeek();
    selectScreen('inbox');
  }
}

function renderInbox() {
  const g = state.game;
  let html = '<section class="screen"><h1>Inbox</h1>';
  if (g.inbox.length === 0) html += '<p>No news this week.</p>';
  for (const item of g.inbox.slice(0, 20)) {
    html += `<div class="panel"><strong>${item.subject}</strong><div>${item.body}</div><small>S${item.season + 1} W${item.week + 1}</small></div>`;
  }
  html += '</section>';
  els.content.innerHTML = html;
}

function renderSquad() {
  const team = state.game.userTeam();
  const rows = team.riders.slice().sort((a, b) => b.ability - a.ability);
  let html = `<section class="screen"><h1>Squad · ${team.riders.length} riders</h1>
    <p>Annual wage bill: ${formatMoney(state.game.totalWageBill(team))}</p>
    <table class="grid"><thead><tr><th>Role</th><th>Name</th><th>Age</th><th>Pwr</th><th>Clm</th><th>Con</th><th>Form</th><th>Mor</th><th>Wage</th><th>Value</th><th>Contract</th><th>Status</th><th>Action</th></tr></thead><tbody>`;
  for (const r of rows) {
    const status = [];
    if (r.injuryWeeks > 0) status.push(`INJ ${r.injuryWeeks}w`);
    if (r.abandonedRace) status.push('DNF');
    if (r.listed) status.push('LISTED');
    html += `<tr><td>${r.type}</td><td>${r.name}</td><td>${r.age}</td><td>${r.power}</td><td>${r.climb}</td>` +
      `<td><div class="bar-wrap"><div class="bar-fill" style="width:${r.condition}%"></div></div></td>` +
      `<td>${r.form.toFixed(1)}</td><td>${r.morale}</td><td>${formatMoney(r.wage)}</td><td>${formatMoney(r.value)}</td>` +
      `<td class="${r.contractYears <= 1 ? 'warning' : ''}">${r.contractYears}y</td>` +
      `<td>${status.join(' ')}</td>` +
      `<td class="inline-actions">` +
        `<button data-list="${r.id}">${r.listed ? 'Unlist' : 'List'}</button>` +
        `<button data-renew="${r.id}">Renew</button>` +
      `</td></tr>`;
  }
  html += '</tbody></table></section>';
  els.content.innerHTML = html;

  els.content.querySelectorAll('button[data-list]').forEach((b) => b.addEventListener('click', () => {
    const r = team.riders.find((x) => x.id === b.dataset.list);
    if (r) { r.listed = !r.listed; renderSquad(); }
  }));
  els.content.querySelectorAll('button[data-renew]').forEach((b) => b.addEventListener('click', () => {
    const r = team.riders.find((x) => x.id === b.dataset.renew);
    if (r) { state.game.renewContract(r) || alert('Cannot afford renewal'); renderSquad(); }
  }));
}

function renderRacePlan() {
  const g = state.game;
  const team = g.userTeam();
  const profile = g.currentRaceProfile();
  const plan = g.racePlan.plan;
  const warn = profile ? planWarning(plan, profile.parcourType) : null;

  const { starters, reserves } = selectRaceTeam(team, plan, 0);
  const rows = (arr) => arr.map((r) => `<tr><td>${r.type}</td><td>${r.name}</td><td>${Math.round(r.ability)}</td></tr>`).join('');

  let html = `<section class="screen"><h1>Race Plan</h1>
    <div class="row">
      <div class="col panel">
        <label>Plan</label>
        <select id="rp-plan">${RACE_PLANS.map((p) => `<option ${p === plan ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <label>Aggression</label>
        <select id="rp-aggr">${AGGRESSIONS.map((a) => `<option ${a === g.racePlan.aggression ? 'selected' : ''}>${a}</option>`).join('')}</select>
        ${warn ? `<div class="warning">⚠ ${warn}</div>` : ''}
        <button id="auto-pick">Auto-pick</button>
      </div>
      <div class="col panel">
        <h3>Race Team (8)</h3>
        <table class="grid"><thead><tr><th>Role</th><th>Name</th><th>Abil</th></tr></thead><tbody>${rows(starters)}</tbody></table>
      </div>
      <div class="col panel">
        <h3>Reserves</h3>
        <table class="grid"><thead><tr><th>Role</th><th>Name</th><th>Abil</th></tr></thead><tbody>${rows(reserves)}</tbody></table>
      </div>
    </div>
    </section>`;
  els.content.innerHTML = html;
  document.getElementById('rp-plan').addEventListener('change', (e) => { g.racePlan.plan = e.target.value; renderRacePlan(); });
  document.getElementById('rp-aggr').addEventListener('change', (e) => { g.racePlan.aggression = e.target.value; renderRacePlan(); });
  document.getElementById('auto-pick').addEventListener('click', () => renderRacePlan());
}

function renderCalendar() {
  const g = state.game;
  const current = g.currentEntry();
  let html = '<section class="screen"><h1>Calendar &amp; Results</h1><table class="grid"><thead><tr><th>Wk</th><th>Race</th><th>Type</th><th>Stage</th><th>Result</th></tr></thead><tbody>';
  for (let i = 0; i < g.calendar.length; i++) {
    const e = g.calendar[i];
    const result = g.results[i];
    const best = result ? result.placings.find((p) => p.team === g.userTeam().name) : null;
    const resText = best ? `#${best.position} ${best.rider.name}` : (i < g.week ? 'DNS' : '');
    const cls = i === g.week ? 'selected' : '';
    html += `<tr class="${cls}"><td>${i + 1}</td><td>${raceProfile(e.raceId, e.stage).name}</td>` +
      `<td>${e.type}</td><td>${e.stage || '-'}</td><td>${resText}</td></tr>`;
  }
  html += '</tbody></table></section>';
  els.content.innerHTML = html;
}

function renderSeries() {
  const g = state.game;
  const byDiv = (div) => g.teams.filter((t) => t.division === div).map((t) => {
    const row = g.seriesStandings.find((s) => s.team === t.name);
    return { team: t, ...row, pos: row?.position || 99 };
  }).sort((a, b) => a.pos - b.pos);

  const table = (rows, maxCut) => `<table class="grid"><thead><tr><th>#</th><th>Team</th><th>R</th><th>W</th><th>PD</th><th>T10</th><th>PTS</th></tr></thead><tbody>` +
    rows.map((r, i) => `<tr class="${r.team.name === g.userTeam().name ? 'selected' : ''} ${i < 2 ? 'promoted' : ''} ${i >= rows.length - 2 ? 'relegated' : ''}">` +
      `<td>${r.pos}</td><td>${r.team.shortName}</td><td>${r.races || 0}</td><td>${r.wins || 0}</td>` +
      `<td>${r.podiums || 0}</td><td>${r.top10s || 0}</td><td>${r.points || 0}</td></tr>`).join('') +
    '</tbody></table>';

  let html = '<section class="screen"><h1>Series Standings</h1>';
  html += '<div class="row"><div class="col"><h2>WorldTour</h2>' + table(byDiv(1)) + '</div>';
  html += '<div class="col"><h2>ProTeam</h2>' + table(byDiv(2)) + '</div></div></section>';
  els.content.innerHTML = html;
}

function renderGrandTours() {
  const g = state.game;
  let html = '<section class="screen"><h1>Grand Tours</h1><div class="tabs"><button data-gt="giro" class="active">Giro</button><button data-gt="tour">Tour</button><button data-gt="vuelta">Vuelta</button></div>';
  html += '<div id="gt-body">';
  for (const key of ['giro', 'tour', 'vuelta']) {
    const gt = g.grandTours[key];
    const jerseys = jerseyHolders(gt);
    html += `<div id="gt-${key}" class="gt-panel hidden">`;
    html += `<p><span class="kit-gc">GC</span> ${jerseys.gc?.rider?.name || '—'} ` +
      `<span class="kit-pts">PTS</span> ${jerseys.points?.rider?.name || '—'} ` +
      `<span class="kit-kom">KOM</span> ${jerseys.kom?.rider?.name || '—'} ` +
      `<span class="kit-white">WHT</span> ${jerseys.white?.rider?.name || '—'}</p>`;
    html += '<table class="grid"><thead><tr><th>Stage</th><th>Winner</th></tr></thead><tbody>';
    for (let i = 0; i < gt.stages.length; i++) {
      const s = gt.stages[i];
      html += `<tr><td>${i + 1}</td><td>${s.winner?.rider?.name || '—'}</td></tr>`;
    }
    html += '</tbody></table>';
    html += '<h3>GC Top 10</h3><table class="grid"><thead><tr><th>#</th><th>Rider</th><th>Team</th><th>Gap</th></tr></thead><tbody>';
    overallGc(gt, 10).forEach((e, i) => {
      html += `<tr><td>${i + 1}</td><td>${e.rider.name}</td><td>${shorten(e.team)}</td><td>${formatGap(e.totalTime)}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }
  html += '</div></section>';
  els.content.innerHTML = html;

  const switchGt = (key) => {
    document.querySelectorAll('.gt-panel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`gt-${key}`).classList.remove('hidden');
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.gt === key));
  };
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchGt(b.dataset.gt)));
  switchGt('giro');
}

function shorten(name) {
  const map = { 'UAE Team Emirates': 'UAE', 'Visma | Lease a Bike': 'TVM', 'Soudal–Quick-Step': 'SQS', 'Alpecin–Deceuninck': 'ADC', 'INEOS Grenadiers': 'IGD', 'Lidl–Trek': 'TWG', 'Movistar Team': 'MOV', 'EF Education–EasyPost': 'EFE', 'Bahrain Victorious': 'TBV', 'Groupama–FDJ': 'GFC', 'Decathlon–AG2R': 'DAG', 'Red Bull–Bora–Hansgrohe': 'RBB', 'Israel–Premier Tech': 'IPT', 'Uno-X Mobility': 'UXM', 'Tud Pro Cycling': 'TUD', 'Q36.5 Pro Cycling': 'Q36', 'Team Jayco AlUla': 'JAY', 'Lotto Dstny': 'LTD', 'Picnic–PostNL': 'PIC', 'Astana Qazaqstan': 'AST', 'dsm–firmenich PostNL': 'DSM', 'Burgos-BH': 'BBH', 'Kern Pharma': 'KPH', 'Cofidis': 'COF' };
  return map[name] || name.slice(0, 3);
}

function formatGap(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderTransfers() {
  const g = state.game;
  const team = g.userTeam();
  const types = ['LDR', 'SPR', 'CLM', 'ROU'];
  let html = `<section class="screen"><h1>Transfers</h1>
    <div class="panel row">
      <div class="col">Budget: ${formatMoney(team.transferBudget)} · Balance: ${formatMoney(team.balance)} · Scout fee: ${formatMoney(SCOUT_FEE)}</div>
      <div class="col"><label>Role</label><select id="filter-type"><option value="">All</option>${types.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div class="col"><label>Max value</label><input id="filter-value" type="number" placeholder="£"></div>
    </div>
    <table class="grid"><thead><tr><th>Role</th><th>Name</th><th>Age</th><th>Team</th><th>Pwr</th><th>Clm</th><th>Value</th><th>Asking</th><th>Actions</th></tr></thead><tbody>`;

  for (const t of g.teams) {
    if (t.name === team.name) continue;
    for (const r of t.riders) {
      const ft = document.getElementById('filter-type')?.value;
      if (ft && r.type !== ft) continue;
      const fv = document.getElementById('filter-value')?.value;
      if (fv && r.value > +fv) continue;
      const exact = g.scouted[r.id] || g.isOwnRider(r);
      const ask = askingPrice(t, r);
      html += `<tr><td>${r.type}</td><td>${r.name}</td><td>${r.age}</td><td>${shorten(t.name)}</td>` +
        `<td>${exact ? r.power : '?'}</td><td>${exact ? r.climb : '?'}</td>` +
        `<td>${formatMoney(r.value)}</td><td>${formatMoney(ask)}</td>` +
        `<td class="inline-actions">` +
          `<button data-scout="${r.id}" data-team="${t.name}">Scout</button>` +
          `<button data-bid="${r.id}" data-team="${t.name}">Bid</button>` +
        `</td></tr>`;
    }
  }

  html += '</tbody></table>';
  if (g.pendingOffers.length) {
    html += '<h2>Offers for your riders</h2>';
    for (const o of g.pendingOffers) {
      html += `<div class="panel">${o.from} offers ${formatMoney(o.amount)} for ${o.riderName}` +
        `<button data-accept="${o.id}">Accept</button><button data-reject="${o.id}">Reject</button></div>`;
    }
  }
  html += '</section>';
  els.content.innerHTML = html;

  ['filter-type', 'filter-value'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderTransfers);
  });
  els.content.querySelectorAll('button[data-scout]').forEach((b) => b.addEventListener('click', () => {
    const ok = g.scoutRider(g.teams.find((t) => t.name === b.dataset.team).riders.find((r) => r.id === b.dataset.scout));
    if (!ok) alert('Insufficient funds'); renderTransfers();
  }));
  els.content.querySelectorAll('button[data-bid]').forEach((b) => b.addEventListener('click', () => {
    const seller = g.teams.find((t) => t.name === b.dataset.team);
    const rider = seller.riders.find((r) => r.id === b.dataset.bid);
    const amount = askingPrice(seller, rider);
    const res = g.bidForRider(rider, seller, amount);
    if (!res.ok) alert(res.reason);
    renderTransfers();
  }));
  els.content.querySelectorAll('button[data-accept]').forEach((b) => b.addEventListener('click', () => { g.acceptOffer(+b.dataset.accept); renderTransfers(); }));
  els.content.querySelectorAll('button[data-reject]').forEach((b) => b.addEventListener('click', () => { g.rejectOffer(+b.dataset.reject); renderTransfers(); }));
}

function renderFinances() {
  const t = state.game.userTeam();
  const nextLevel = t.infraLevel + 1;
  const cost = nextLevel * 500000;
  let html = `<section class="screen"><h1>Finances</h1>
    <div class="row">
      <div class="col panel"><h2>Balance</h2><p class="gold">${formatMoney(t.balance)}</p></div>
      <div class="col panel"><h2>Transfer budget</h2><p>${formatMoney(t.transferBudget)}</p></div>
      <div class="col panel"><h2>Wage bill</h2><p>${formatMoney(state.game.totalWageBill(t))}/yr</p></div>
    </div>
    <div class="panel">
      <h2>Infrastructure</h2>
      <p>Current level: ${t.infraLevel}/5</p>
      ${t.infraBuild ? `<p>Building to level ${t.infraBuild.level} (${t.infraBuild.weeksLeft} weeks)</p>` : ''}
      <button id="build-infra" ${t.infraBuild || nextLevel > 5 ? 'disabled' : ''}>Build level ${nextLevel} (${formatMoney(cost)})</button>
    </div>
  </section>`;
  els.content.innerHTML = html;
  document.getElementById('build-infra')?.addEventListener('click', () => {
    const res = state.game.buildInfrastructure(t, nextLevel);
    if (!res.ok) alert(res.reason);
    renderFinances();
  });
}

function renderTeamBoard() {
  const g = state.game;
  const t = g.userTeam();
  let html = `<section class="screen"><h1>Team &amp; Board</h1>
    <div class="row">
      <div class="col panel">
        <h2>Board confidence</h2>
        <div class="bar-wrap"><div class="bar-fill" style="width:${g.board.confidence}%"></div></div>
        <p>${g.board.confidence}/100</p>
        <h2>Reputation</h2><p>${g.reputation}</p>
        <h2>Expectation</h2><p>${t.division === 1 ? 'WorldTour' : 'ProTeam'} target ~${t.expectation}</p>
      </div>
      <div class="col panel">
        <h2>History</h2>
        ${g.history.length === 0 ? '<p>First season in progress.</p>' : `<table class="grid"><thead><tr><th>Season</th><th>Pos</th><th>Div</th><th>Champion</th></tr></thead><tbody>` +
          g.history.map((h) => `<tr><td>${h.season + 1}</td><td>${h.userPosition}</td><td>${h.userDivision}</td><td>${h.seriesChampion || '—'}</td></tr>`).join('') +
          '</tbody></table>'}
      </div>
    </div>
  </section>`;
  els.content.innerHTML = html;
}

function renderPreRace() {
  const g = state.game;
  const profile = g.currentRaceProfile();
  const team = g.userTeam();
  const { starters } = selectRaceTeam(team, g.racePlan.plan);
  const opp = g.oppositionReport('Visma | Lease a Bike'); // example opponent for display
  let html = `<section class="screen"><h1>Pre-race · ${profile.name}</h1>
    <div class="row">
      <div class="col panel"><h3>Your team</h3><table class="grid"><tbody>` +
        starters.map((r) => `<tr><td>${r.type}</td><td>${r.name}</td></tr>`).join('') +
      `</tbody></table></div>
      <div class="col panel"><h3>Opposition report</h3>
        <p><strong>${opp.team.name}</strong> · ${shorten(opp.team.name)} · Form ${opp.formGuide.join('-') || '—'}</p>
        <p>Danger rider: ${opp.danger.name}</p>
        <p>Predicted 8: ${opp.predicted.map((r) => shortenName(r.name)).join(', ')}</p>
      </div>
    </div>
    <button class="primary" id="roll-out">Roll out ▸</button>
  </section>`;
  els.content.innerHTML = html;
  document.getElementById('roll-out').addEventListener('click', startLiveRace);
}

function shortenName(name) {
  return name.split(' ').pop();
}

function startLiveRace() {
  const g = state.game;
  const profile = g.currentRaceProfile();
  const setups = g.teams.map((team) => g.prepareTeamForRace(team));
  state.liveSim = new RaceSim(setups, profile, { rng: g.rng, autoOrders: false });
  state.raceSpeed = 'normal';
  selectScreen('live-race');
  startRaceTimer();
}

function renderLiveRace() {
  const sim = state.liveSim;
  const profile = sim?.profile;
  if (!sim) { selectScreen('inbox'); return; }
  let html = `<section class="screen"><h1>${profile.name}</h1>
    <div class="panel row">
      <div class="col"><strong>${Math.round(sim.km)} / ${sim.distanceKm} km</strong></div>
      <div class="col">Break gap: ${Math.round(sim.breakGapSec)}s</div>
      <div class="col">Peloton: ${sim.pelotonMembers.length} · Break: ${sim.breakMembers.length}</div>
    </div>
    <div id="track"></div>
    <div class="row">
      <button data-speed="normal">Normal</button><button data-speed="fast">Fast</button><button data-speed="instant">Instant</button><button id="pause-race">Pause</button>
    </div>
    <div class="row">
      <button data-order="chase">Chase</button>
      <button data-order="control">Control</button>
      <button data-order="attack">Attack</button>
      <button data-order="leadout">Leadout</button>
    </div>
    <div id="commentary" role="log" aria-live="polite"></div>
  </section>`;
  els.content.innerHTML = html;
  refreshCommentary();

  document.querySelectorAll('button[data-speed]').forEach((b) => b.addEventListener('click', () => { state.raceSpeed = b.dataset.speed; startRaceTimer(); }));
  document.getElementById('pause-race').addEventListener('click', stopRaceTimer);
  document.querySelectorAll('button[data-order]').forEach((b) => b.addEventListener('click', () => {
    const t = state.game.userTeam().shortName;
    const o = {};
    o[b.dataset.order] = true;
    sim.setOrders(t, o);
  }));
}

function refreshCommentary() {
  const sim = state.liveSim;
  const box = document.getElementById('commentary');
  if (!box) return;
  box.innerHTML = '';
  for (const ev of sim.events.slice(-10)) {
    const cls = ev.type || '';
    box.innerHTML += `<div class="event ${cls}">${ev.km} km · ${ev.text}</div>`;
  }
}

function startRaceTimer() {
  stopRaceTimer();
  const delay = state.raceSpeed === 'instant' ? 0 : state.raceSpeed === 'fast' ? 80 : 300;
  const step = () => {
    if (!state.liveSim || state.liveSim.finished) {
      stopRaceTimer();
      if (state.liveSim?.finished) selectScreen('full-time');
      return;
    }
    if (state.raceSpeed === 'instant') {
      const result = state.liveSim.simulateToEnd();
      state.game.advanceWeek(result);
      selectScreen('full-time');
      return;
    }
    state.liveSim.playSegment();
    refreshCommentary();
    if (state.liveSim.finished) {
      stopRaceTimer();
      const result = state.liveSim.finish();
      state.game.advanceWeek(result);
      selectScreen('full-time');
      return;
    }
    state.raceTimer = setTimeout(step, delay);
  };
  step();
}

function stopRaceTimer() {
  if (state.raceTimer) clearTimeout(state.raceTimer);
  state.raceTimer = null;
}

function renderFullTime() {
  const g = state.game;
  const result = g.results[g.results.length - 1];
  if (!result) { selectScreen('inbox'); return; }
  let html = `<section class="screen"><h1>Full Time · ${result.raceName}</h1>
    <table class="grid"><thead><tr><th>#</th><th>Rider</th><th>Team</th><th>Gap</th></tr></thead><tbody>`;
  for (const p of result.placings.slice(0, 20)) {
    const cls = p.team === g.userTeam().name ? 'selected' : '';
    html += `<tr class="${cls}"><td>${p.position}</td><td>${p.rider.name}</td><td>${shorten(p.team)}</td><td>${formatGap(p.timeGap)}</td></tr>`;
  }
  html += '</tbody></table>';
  html += '<button class="primary" id="continue-after-race">Continue ▸</button></section>';
  els.content.innerHTML = html;
  document.getElementById('continue-after-race').addEventListener('click', () => selectScreen('inbox'));
}

init();
