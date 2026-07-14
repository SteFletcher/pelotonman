// src/engine/season.js
// Calendar of real races. Each race carries a profile used by the race engine.
// Pure module — no DOM, no I/O.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthName(week) {
  return MONTHS[Math.min(11, Math.floor(week / 4))];
}

function flat(distanceKm, extra = []) {
  return [{ km: Math.max(0, distanceKm - 5), type: 'flat' }, { km: 5, type: 'finish' }, ...extra];
}

function hilly(distanceKm) {
  return [{ km: distanceKm * 0.55, type: 'flat' }, { km: distanceKm * 0.25, type: 'hilly' }, { km: distanceKm * 0.20 - 5, type: 'flat' }, { km: 5, type: 'finish' }];
}

function mountain(distanceKm, cat = 1) {
  return [{ km: distanceKm * 0.4, type: 'flat' }, { km: distanceKm * 0.35, type: 'climb', cat }, { km: distanceKm * 0.20, type: 'descent' }, { km: distanceKm * 0.05, type: 'finish', cat }];
}

function itt(distanceKm) {
  return [{ km: distanceKm, type: 'flat' }];
}

const RACES = {
  'omloop': { name: 'Omloop Het Nieuwsblad', kind: 'classic', distanceKm: 199, parcourType: 'hilly', profile: hilly(199) },
  'strade-bianche': { name: 'Strade Bianche', kind: 'classic', distanceKm: 215, parcourType: 'hilly', profile: hilly(215) },
  'tirreno': { name: 'Tirreno–Adriatico', kind: 'stage-race', stages: 7 },
  'milano-sanremo': { name: 'Milan–San Remo', kind: 'classic', isMonument: true, distanceKm: 294, parcourType: 'flat', profile: flat(294) },
  'e3': { name: 'E3 Saxo Classic', kind: 'classic', distanceKm: 207, parcourType: 'hilly', profile: hilly(207) },
  'gent-wevelgem': { name: 'Gent–Wevelgem', kind: 'classic', distanceKm: 253, parcourType: 'flat', profile: flat(253) },
  'ronde': { name: 'Tour of Flanders', kind: 'classic', isMonument: true, distanceKm: 270, parcourType: 'hilly', profile: hilly(270) },
  'roubaix': { name: 'Paris–Roubaix', kind: 'classic', isMonument: true, distanceKm: 260, parcourType: 'hilly', profile: hilly(260) },
  'itzulia': { name: 'Itzulia Basque Country', kind: 'stage-race', stages: 6 },
  'amstel': { name: 'Amstel Gold Race', kind: 'classic', distanceKm: 255, parcourType: 'hilly', profile: hilly(255) },
  'fleche': { name: 'Flèche Wallonne', kind: 'classic', distanceKm: 198, parcourType: 'hilly', profile: hilly(198) },
  'liege': { name: 'Liège–Bastogne–Liège', kind: 'classic', isMonument: true, distanceKm: 258, parcourType: 'hilly', profile: hilly(258) },
  'giro': { name: "Giro d'Italia", kind: 'gt', stages: 21 },
  'dauphine': { name: 'Critérium du Dauphiné', kind: 'stage-race', stages: 8 },
  'suisse': { name: 'Tour de Suisse', kind: 'stage-race', stages: 8 },
  'tour': { name: 'Tour de France', kind: 'gt', stages: 21 },
  'san-sebastian': { name: 'Clásica San Sebastián', kind: 'classic', distanceKm: 234, parcourType: 'hilly', profile: hilly(234) },
  'bretagne': { name: 'Bretagne Classic', kind: 'classic', distanceKm: 255, parcourType: 'flat', profile: flat(255) },
  'vuelta': { name: 'Vuelta a España', kind: 'gt', stages: 21 },
  'quebec': { name: 'GP de Québec', kind: 'classic', distanceKm: 202, parcourType: 'hilly', profile: hilly(202) },
  'emilia': { name: 'Giro dell\'Emilia', kind: 'classic', distanceKm: 204, parcourType: 'hilly', profile: hilly(204) },
  'lombardia': { name: 'Il Lombardia', kind: 'classic', isMonument: true, distanceKm: 253, parcourType: 'hilly', profile: hilly(253) },
};

export function raceProfile(raceId, stageNumber = null) {
  const race = RACES[raceId];
  if (!race) throw new Error(`Unknown race ${raceId}`);
  if (race.kind === 'stage-race' || race.kind === 'gt') {
    const stage = stageNumber ?? 1;
    const kind = race.kind === 'gt' ? 'gt-stage' : 'stage';
    const mix = stageMix(race.kind, race.stages, stage);
    return {
      id: `${raceId}-s${stage}`,
      name: `${race.name} · stage ${stage}`,
      kind,
      distanceKm: mix.distanceKm,
      parcourType: mix.parcourType,
      profile: mix.profile,
      isMonument: false,
    };
  }
  return { id: raceId, ...race };
}

function stageMix(kind, total, stage) {
  // A simple deterministic mix; GT has flat/hilly/mountain/ITT and 2 rest days.
  const i = stage;
  if (kind === 'gt') {
    // Rest days: stage 9 and 15.
    if (i === 9 || i === 15) return { distanceKm: 0, parcourType: 'rest', profile: [{ km: 0, type: 'flat' }] };
    if (i === 1) return { distanceKm: 6, parcourType: 'itt', profile: itt(6) };
    if (i === total - 1 || i === total) return { distanceKm: 150, parcourType: 'flat', profile: flat(150) };
    if ([10, 14, 17, 20].includes(i)) return { distanceKm: 185, parcourType: 'mountain', profile: mountain(185, 1) };
    if ([5, 11, 21].includes(i)) return { distanceKm: 35, parcourType: 'itt', profile: itt(35) };
    return { distanceKm: 180 + (i % 3) * 10, parcourType: 'hilly', profile: hilly(180 + (i % 3) * 10) };
  }
  // stage-race
  if (i === 1) return { distanceKm: 8, parcourType: 'itt', profile: itt(8) };
  if (i % 2 === 0) return { distanceKm: 170, parcourType: 'mountain', profile: mountain(170, 1 + (i % 2)) };
  return { distanceKm: 190, parcourType: 'flat', profile: flat(190) };
}

export function buildCalendar() {
  const entries = [
    { type: 'classic', raceId: 'omloop' },
    { type: 'classic', raceId: 'strade-bianche' },
    ...stageEntries('tirreno', 3),
    { type: 'classic', raceId: 'milano-sanremo' },
    { type: 'classic', raceId: 'e3' },
    { type: 'classic', raceId: 'gent-wevelgem' },
    { type: 'classic', raceId: 'ronde' },
    { type: 'classic', raceId: 'roubaix' },
    ...stageEntries('itzulia', 9),
    { type: 'classic', raceId: 'amstel' },
    { type: 'classic', raceId: 'fleche' },
    { type: 'classic', raceId: 'liege' },
    ...gtEntries('giro', 13),
    ...stageEntries('dauphine', 16),
    ...stageEntries('suisse', 17),
    ...gtEntries('tour', 18),
    { type: 'classic', raceId: 'san-sebastian' },
    { type: 'classic', raceId: 'bretagne' },
    ...gtEntries('vuelta', 23),
    { type: 'classic', raceId: 'quebec' },
    { type: 'classic', raceId: 'emilia' },
    { type: 'classic', raceId: 'lombardia' },
  ];
  return entries.map((e, i) => ({ ...e, week: i }));
}

function stageEntries(raceId, startWeek) {
  const race = RACES[raceId];
  const arr = [];
  for (let i = 1; i <= race.stages; i++) {
    arr.push({ type: 'stage', raceId, stage: i });
  }
  return arr;
}

function gtEntries(raceId, startWeek) {
  const race = RACES[raceId];
  const arr = [];
  for (let i = 1; i <= race.stages; i++) {
    arr.push({ type: 'gt', raceId, stage: i });
  }
  return arr;
}

export { RACES };
