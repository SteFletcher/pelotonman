// src/data/teams.js
// Versioned data asset: 24 real professional teams with real-name rosters,
// fictional/game-tuned attributes. This module depends only on riders.js.

import { createRider } from '../engine/riders.js';
import { hashString } from '../engine/rng.js';

const DIV1 = 1;
const DIV2 = 2;

// Explicit headline overrides: team name -> rider name -> { power?, climb?, tt?, consistency? }.
const OVERRIDES = {
  'UAE Team Emirates': {
    'Tadej Pogačar': { power: 88, climb: 93 },
    'Adam Yates': { power: 80, climb: 84 },
    'João Almeida': { power: 82, climb: 85 },
    'Juan Ayuso': { power: 80, climb: 86 },
    'Tim Merlier': { power: 89, climb: 52 },
  },
  'Visma | Lease a Bike': {
    'Jonas Vingegaard': { power: 84, climb: 94 },
    'Wout van Aert': { power: 90, climb: 78 },
    'Matteo Jorgenson': { power: 78, climb: 80 },
    'Christophe Laporte': { power: 80, climb: 70 },
    'Olav Kooij': { power: 84, climb: 50 },
  },
  'Red Bull–Bora–Hansgrohe': {
    'Primož Rogliča': { power: 82, climb: 92 },
    'Jai Hindley': { power: 76, climb: 86 },
    'Dani Martínez': { power: 76, climb: 82 },
  },
  'Soudal–Quick-Step': {
    'Remco Evenepoel': { power: 86, climb: 90 },
    'Julian Alaphilippe': { power: 82, climb: 78 },
    'Kasper Asgreen': { power: 80, climb: 72 },
    'Fabio Jakobsen': { power: 86, climb: 48 },
  },
  'INEOS Grenadiers': {
    'Tom Pidcock': { power: 82, climb: 85 },
    'Egan Bernal': { power: 78, climb: 86 },
    'Geraint Thomas': { power: 76, climb: 80 },
    'Carlos Rodríguez': { power: 76, climb: 82 },
    'Filippo Ganna': { power: 88, climb: 64 },
  },
  'Alpecin–Deceuninck': {
    'Mathieu van der Poel': { power: 90, climb: 82 },
    'Jasper Philipsen': { power: 87, climb: 54 },
    'Kaden Groves': { power: 84, climb: 52 },
    'Søren Kragh Andersen': { power: 80, climb: 68 },
  },
  'Lidl–Trek': {
    'Mads Pedersen': { power: 86, climb: 74 },
    'Jonathan Milan': { power: 85, climb: 56 },
    'Giulio Ciccone': { power: 76, climb: 82 },
    'Tao Geoghegan Hart': { power: 74, climb: 80 },
  },
  'Movistar Team': {
    "Enric Mas": { power: 74, climb: 86 },
    "Nairo Quintana": { power: 72, climb: 85 },
    "Fernando Gaviria": { power: 86, climb: 54 },
    "Johan Jacobs": { power: 78, climb: 70 },
  },
  'EF Education–EasyPost': {
    'Richard Carapaz': { power: 78, climb: 87 },
    'Neilson Powless': { power: 78, climb: 80 },
    'Mikel Bissegger': { power: 80, climb: 72 },
  },
  'Bahrain Victorious': {
    'Matej Mohorič': { power: 86, climb: 78 },
    'Pello Bilbao': { power: 76, climb: 80 },
    'Antonio Tiberi': { power: 74, climb: 80 },
    'Phil Bauhaus': { power: 85, climb: 50 },
  },
  'Groupama–FDJ': {
    'David Gaudu': { power: 74, climb: 84 },
    'Stefan Küng': { power: 84, climb: 62 },
    'Arnaud Démare': { power: 85, climb: 52 },
  },
  'Decathlon–AG2R': {
    "Ben O'Connor": { power: 74, climb: 84 },
    'Felix Gall': { power: 74, climb: 83 },
    'Sam Bennett': { power: 86, climb: 50 },
  },
  'Cofidis': {
    "Iván García Cortina": { power: 83, climb: 70 },
    'Bryan Coquard': { power: 85, climb: 52 },
    'Guillaume Martin': { power: 74, climb: 80 },
  },
  'Israel–Premier Tech': {
    'Derek Gee': { power: 80, climb: 76 },
    'Michael Woods': { power: 72, climb: 82 },
    'Itamar Einhorn': { power: 82, climb: 52 },
    'Stephen Williams': { power: 78, climb: 72 },
  },
  'Uno-X Mobility': {
    'Magnus Cort': { power: 82, climb: 70 },
    'Alexander Kristoff': { power: 80, climb: 54 },
    'Jonas Abrahamsen': { power: 78, climb: 68 },
  },
  'Tud Pro Cycling': {
    'Marc Hirschi': { power: 84, climb: 76 },
    'Matteo Trentin': { power: 82, climb: 72 },
    'Riley Sheehan': { power: 78, climb: 68 },
  },
  'Q36.5 Pro Cycling': {
    'Gianni Moscon': { power: 78, climb: 70 },
    'Nicolò Parolini': { power: 74, climb: 72 },
    'Bert Van Lerberghe': { power: 80, climb: 56 },
  },
  'Team Jayco AlUla': {
    'Luke Plapp': { power: 78, climb: 76 },
    'Dylan Groenewegen': { power: 86, climb: 50 },
    'Chris Harper': { power: 74, climb: 76 },
    'Simon Yates': { power: 78, climb: 84 },
  },
  'Lotto Dstny': {
    'Arnaud De Lie': { power: 84, climb: 54 },
    'Victor Campenaerts': { power: 82, climb: 60 },
    'Brent Van Moer': { power: 78, climb: 68 },
  },
  'Picnic–PostNL': {
    'Oscar Onley': { power: 74, climb: 78 },
    'Sam Welsford': { power: 86, climb: 52 },
    'Marijn van den Berg': { power: 78, climb: 64 },
  },
  'Astana Qazaqstan': {
    'Mark Cavendish': { power: 84, climb: 44 },
    'Harold Tejada': { power: 74, climb: 76 },
    'Cees Bol': { power: 82, climb: 52 },
  },
  'dsm–firmenich PostNL': {
    'Romain Bardet': { power: 72, climb: 82 },
    'Pavel Bittner': { power: 82, climb: 56 },
    'John Degenkolb': { power: 80, climb: 52 },
    'Warren Barguil': { power: 74, climb: 78 },
  },
  'Burgos-BH': {
    "Jon Barrenetxea": { power: 78, climb: 68 },
    'Jesús Ezquerra': { power: 76, climb: 66 },
    'Eric Fagúndez': { power: 74, climb: 64 },
  },
  'Kern Pharma': {
    'Pablo Castrillo': { power: 72, climb: 78 },
    'Mikel Azparren': { power: 74, climb: 74 },
    'Jorge Gutiérrez': { power: 76, climb: 68 },
  },
};

// Extra real names for teams that would otherwise fall below the 22-rider
// floor. Keeping rosters at ≥22 makes promotions/retirements safe all season.
const ADDITIONAL_RIDERS = {
  'UAE Team Emirates': [
    ['Tim Wellens', 'LDR', 33],
    ['Pavel Sivakov', 'CLM', 27],
  ],
  'Alpecin–Deceuninck': [
    ['Senne Leysen', 'ROU', 26],
  ],
  'Tud Pro Cycling': [
    ['Casper van Uden', 'SPR', 23],
  ],
  'Q36.5 Pro Cycling': [
    ['Rudy Barbier', 'SPR', 30],
  ],
  'Team Jayco AlUla': [
    ['Caleb Ewan', 'SPR', 30],
  ],
  'Lotto Dstny': [
    ['Milan Fretin', 'SPR', 25],
  ],
  'Picnic–PostNL': [
    ['Oliver Wood', 'ROU', 29],
  ],
  'Astana Qazaqstan': [
    ['Anton Kuzmin', 'LDR', 26],
  ],
  'Burgos-BH': [
    ['Carlos Canal', 'SPR', 25],
  ],
  'Kern Pharma': [
    ['Unai Zubiaur', 'ROU', 25],
  ],
};

function riderBase(name, type, age, teamName) {
  // Deterministic, role-appropriate attributes from the rider's name + team.
  const h = hashString(name + '|' + teamName);
  const roleBias = { LDR: 1, SPR: 0, CLM: 1, ROU: 0 }[type]; // 1 bias climb, 0 bias power
  const spread = 12 + (h % 9); // 12..20
  const center = 60;
  let power = center - spread / 2 + (h % (spread + 1));
  let climb = center - spread / 2 + ((h >> 8) % (spread + 1));

  if (type === 'SPR' || type === 'ROU') {
    power += 4; climb -= 4;
  } else if (type === 'CLM' || type === 'LDR') {
    climb += 4; power -= 3;
  }

  // Apply explicit overrides if present.
  const over = OVERRIDES[teamName]?.[name];
  if (over) {
    if (over.power !== undefined) power = over.power;
    if (over.climb !== undefined) climb = over.climb;
  }

  const r = {
    name,
    type,
    age,
    power: Math.round(power),
    climb: Math.round(climb),
  };
  if (over && over.tt !== undefined) r.tt = over.tt;
  if (over && over.consistency !== undefined) r.consistency = over.consistency;
  return r;
}

function T(team) {
  return {
    name: team.name,
    shortName: team.shortName,
    uciCode: team.uciCode,
    tier: team.tier,
    division: team.division,
    expectation: team.expectation,
    marketability: team.marketability,
    riders: team.riders.map((r, i) => createRider({
      id: `${team.uciCode}-${i + 1}`,
      ...riderBase(r[0], r[1], r[2], team.name),
    })),
  };
}

// Teams are listed in the design order: WorldTour 1-12, ProTeam 13-24.
const RAW_TEAMS = [
  // --- WorldTour division ---
  {
    name: 'UAE Team Emirates', shortName: 'UAE', uciCode: 'UAD', tier: 92, division: DIV1, expectation: 1, marketability: 950,
    riders: [
      ['Tadej Pogačar', 'LDR', 26], ['Adam Yates', 'LDR', 32], ['João Almeida', 'LDR', 26], ['Juan Ayuso', 'LDR', 22],
      ['Nils Politt', 'ROU', 30], ['Brandon McNulty', 'ROU', 26], ['Mikkel Bjerg', 'ROU', 25], ['Felix Großschartner', 'ROU', 32],
      ['Tim Merlier', 'SPR', 32], ['Diego Ulissi', 'SPR', 34], ['Alessandro Covi', 'SPR', 24],
      ['Jay Vine', 'CLM', 28], ['George Bennett', 'CLM', 34], ['Antonio Morgado', 'CLM', 21], ['Igor Arrieta', 'CLM', 23], ['Rui Oliveira', 'CLM', 30],
      ['Marc Hirschi', 'SPR', 30], ['Domen Novak', 'ROU', 29], ['Vegard Stake Laengen', 'ROU', 35], ['Mikkel Honoré', 'ROU', 27],
    ],
  },
  {
    name: 'Visma | Lease a Bike', shortName: 'TVM', uciCode: 'TVM', tier: 90, division: DIV1, expectation: 2, marketability: 920,
    riders: [
      ['Jonas Vingegaard', 'LDR', 28], ['Matteo Jorgenson', 'LDR', 24], ['Sepp Kuss', 'LDR', 29], ['Wilco Kelderman', 'LDR', 33],
      ['Wout van Aert', 'SPR', 30], ['Olav Kooij', 'SPR', 22], ['Christophe Laporte', 'ROU', 31], ['Tiesj Benoot', 'ROU', 30],
      ['Attila Valter', 'CLM', 26], ['Robert Gesink', 'CLM', 38], ['Cian Uijtdebroeks', 'CLM', 21], ['Bart Lemmen', 'CLM', 27],
      ['Dylan van Baarle', 'ROU', 32], ['Tim van Dijke', 'ROU', 23], ['Julius Johansen', 'ROU', 25],
      ['Loe van Belle', 'SPR', 24], ['Per Strand Hagenes', 'SPR', 22], ['Ben Tulett', 'CLM', 25], ['Steven Kruijswijk', 'CLM', 37],
      ['Mick van Dijke', 'ROU', 23], ['Milan Vader', 'CLM', 29], ['Tosh Van der Sande', 'ROU', 33],
    ],
  },
  {
    name: 'Red Bull–Bora–Hansgrohe', shortName: 'RBB', uciCode: 'RBB', tier: 87, division: DIV1, expectation: 3, marketability: 860,
    riders: [
      ['Primož Rogliča', 'LDR', 35], ['Jai Hindley', 'LDR', 28], ['Dani Martínez', 'LDR', 28], ['Bob Jungels', 'LDR', 31],
      ['Jordi Meeus', 'SPR', 26], ['Marco Haller', 'ROU', 33], ['Nico Denz', 'ROU', 30], ['Ryan Mullen', 'ROU', 29],
      ['Matteo Fabbro', 'CLM', 29], ['Patrick Gamper', 'CLM', 28], ['Lennard Kämna', 'CLM', 27], ['Giovanni Aleotti', 'CLM', 26],
      ['Ralf Matzka', 'SPR', 28], ['Ben Zwiehoff', 'CLM', 31], ['Cesare Benedetti', 'ROU', 38],
      ['Emil Herzog', 'LDR', 21], ['Florian Lipowitz', 'CLM', 26], ['Anton Palzer', 'CLM', 31], ['Maximilian Schachmann', 'LDR', 32],
      ['Vinzenz Plapp', 'ROU', 25], ['Pascal Ackermann', 'SPR', 30], ['Nils Politt', 'ROU', 30],
    ],
  },
  {
    name: 'Soudal–Quick-Step', shortName: 'SQS', uciCode: 'SQS', tier: 86, division: DIV1, expectation: 4, marketability: 840,
    riders: [
      ['Remco Evenepoel', 'LDR', 24], ['Julian Alaphilippe', 'SPR', 32], ['Kasper Asgreen', 'ROU', 30], ['Fabio Jakobsen', 'SPR', 28],
      ['Tim Merlier', 'SPR', 32], ['Louis Vervaeke', 'CLM', 31], ['Ilan Van Wilder', 'LDR', 24], ['Mauri Vansevenant', 'CLM', 24],
      ['Josef Černý', 'ROU', 31], ['Pieter Serry', 'CLM', 35], ['Casper Pedersen', 'ROU', 28], ['Paul Magnier', 'SPR', 21],
      ['Bert Van Lerberghe', 'ROU', 32], ['James Knox', 'ROU', 29], ['Andrea Bagioli', 'CLM', 25],
      ['Federico Savini', 'SPR', 22], ['Luca Vergallito', 'ROU', 25], ['Martin Svrček', 'SPR', 22], ['Antonio Morgado', 'SPR', 21], ['Ayco Bastiaens', 'ROU', 26],
      ['Ethan Vernon', 'SPR', 23], ['Rémi Cavagna', 'ROU', 29],
    ],
  },
  {
    name: 'INEOS Grenadiers', shortName: 'IGD', uciCode: 'IGD', tier: 85, division: DIV1, expectation: 5, marketability: 820,
    riders: [
      ['Tom Pidcock', 'LDR', 25], ['Egan Bernal', 'LDR', 27], ['Geraint Thomas', 'LDR', 38], ['Carlos Rodríguez', 'LDR', 23],
      ['Filippo Ganna', 'ROU', 28], ['Luke Rowe', 'ROU', 34], ['Jonathan Castroviejo', 'ROU', 41], ['Owain Doull', 'ROU', 31],
      ['Ben Turner', 'SPR', 24], ['Ethan Hayter', 'SPR', 26], ['Elia Viviani', 'SPR', 39], ['Kim Heiduk', 'SPR', 24],
      ['Thymen Arensman', 'CLM', 24], ['Salvatore Puccio', 'CLM', 35], ['Brandon Rivera', 'CLM', 27],
      ['Andrew August', 'CLM', 21], ['Magnus Sheffield', 'CLM', 22], ['Tobias Foss', 'LDR', 27], ['Laurens De Plus', 'LDR', 29],
      ['Michael Leonard', 'LDR', 22], ['Jhonatan Narváez', 'LDR', 28], ['Connor Swift', 'ROU', 29],
    ],
  },
  {
    name: 'Alpecin–Deceuninck', shortName: 'ADC', uciCode: 'ADC', tier: 82, division: DIV1, expectation: 6, marketability: 780,
    riders: [
      ['Mathieu van der Poel', 'SPR', 29], ['Jasper Philipsen', 'SPR', 26], ['Kaden Groves', 'SPR', 25], ['Søren Kragh Andersen', 'ROU', 29],
      ['Tibor Del Grosso', 'LDR', 22], ['Stan Dewulf', 'CLM', 27], ['Gianni Vermeersch', 'ROU', 30], ['Silvan Dillier', 'ROU', 34],
      ['Quinten Hermans', 'SPR', 28], ['Jimmy Janssens', 'CLM', 33], ['Xandro Meurisse', 'CLM', 32], ['Alexander Krieger', 'ROU', 31],
      ['Tobias Bayer', 'SPR', 25], ['Edward Planckaert', 'ROU', 28], ['Luca Vergallito', 'ROU', 25],
      ['Henri Uhlig', 'SPR', 23], ['Andreas Kron', 'LDR', 25], ['Piet Allegaert', 'ROU', 30],
      ['Maurice Ballerstedt', 'SPR', 24], ['Ram Sinkeldam', 'SPR', 35], ['Dario Belletta', 'ROU', 28],
    ],
  },
  {
    name: 'Lidl–Trek', shortName: 'TWG', uciCode: 'TWG', tier: 80, division: DIV1, expectation: 7, marketability: 750,
    riders: [
      ['Mads Pedersen', 'SPR', 28], ['Jonathan Milan', 'SPR', 23], ['Giulio Ciccone', 'LDR', 29], ['Tao Geoghegan Hart', 'LDR', 29],
      ['Daan Hoole', 'ROU', 25], ['Mathias Vacek', 'ROU', 23], ['Jasper Stuyven', 'ROU', 32], ['Tim Declercq', 'ROU', 35],
      ['Steff Cras', 'CLM', 27], ['Andreas Leknessund', 'CLM', 25], ['Amanuel Ghebreigzabhier', 'CLM', 34],
      ['Sam Oomen', 'CLM', 29], ['Sven De Wolf', 'LDR', 23], ['Ryan Mullen', 'ROU', 29], ['Edward Theuns', 'SPR', 33],
      ['Quinn Simmons', 'LDR', 23], ['Victor Campenaerts', 'ROU', 32], ['Juan Pedro López', 'LDR', 27], ['Patrick Konrad', 'LDR', 32],
      ['Emils Liepins', 'SPR', 28], ['Otto Vergaerde', 'ROU', 31], ['Filippo Baroncini', 'SPR', 24],
    ],
  },
  {
    name: 'Movistar Team', shortName: 'MOV', uciCode: 'MOV', tier: 78, division: DIV1, expectation: 8, marketability: 720,
    riders: [
      ['Enric Mas', 'LDR', 29], ['Nairo Quintana', 'LDR', 35], ['Fernando Gaviria', 'SPR', 30], ['Johan Jacobs', 'ROU', 27],
      ['Einer Rubio', 'CLM', 25], ['Ruben Guerreiro', 'CLM', 30], ['Iván Ramiro Sosa', 'CLM', 27], ['Gregorio Mamen', 'ROU', 24],
      ['Lorenzo Milesi', 'SPR', 23], ['Manlio Moro', 'ROU', 23], ['Albert Torres', 'ROU', 33], ['Davide Cimolai', 'SPR', 35],
      ['Will Barta', 'LDR', 28], ['Jorge Arcas', 'ROU', 35], ['Alex Aranburu', 'SPR', 30], ['Gonzalo Serrano', 'SPR', 29],
      ['Eduardo Sepúlveda', 'CLM', 33], ['Nelson Oliveira', 'ROU', 35], ['Vinícius Rangel', 'LDR', 24], ['Sergio Samitier', 'CLM', 29],
      ['Pelayo Sánchez', 'CLM', 24], ['Oier Lazkano', 'SPR', 25],
    ],
  },
  {
    name: 'EF Education–EasyPost', shortName: 'EFE', uciCode: 'EFE', tier: 77, division: DIV1, expectation: 9, marketability: 700,
    riders: [
      ['Richard Carapaz', 'LDR', 31], ['Neilson Powless', 'LDR', 27], ['Mikel Bissegger', 'ROU', 26], ['Marijn van den Berg', 'SPR', 24],
      ['Stefan Bissegger', 'ROU', 26], ['Ben Healy', 'CLM', 24], ['Esteban Chaves', 'CLM', 34], ['James Shaw', 'ROU', 28],
      ['Julius van den Berg', 'ROU', 26], ['Lachlan Morton', 'LDR', 36], ['Mark Padun', 'CLM', 27], ['Owain Doull', 'ROU', 31],
      ['Rigoberto Urán', 'LDR', 37], ['Sean Quinn', 'SPR', 25], ['Jack Rootkin-Gray', 'SPR', 22],
      ['Archie Ryan', 'CLM', 23], ['Jardi Christiaan', 'SPR', 24], ['Yuhi Todome', 'SPR', 21], ['Darren Rafferty', 'LDR', 22],
      ['Andrey Amador', 'ROU', 37], ['Merhawi Kudus', 'CLM', 30], ['Freds Frigo', 'SPR', 25],
    ],
  },
  {
    name: 'Bahrain Victorious', shortName: 'TBV', uciCode: 'TBV', tier: 76, division: DIV1, expectation: 10, marketability: 680,
    riders: [
      ['Matej Mohorič', 'SPR', 30], ['Pello Bilbao', 'LDR', 34], ['Antonio Tiberi', 'LDR', 23], ['Phil Bauhaus', 'SPR', 30],
      ['Wout Poels', 'CLM', 36], ['Santiago Buitrago', 'LDR', 25], ['Damiano Caruso', 'LDR', 36], ['Dylan Teuns', 'CLM', 32],
      ['Niklas Eg', 'ROU', 29], ['Andrea Pasqualon', 'SPR', 36], ['Edoardo Zambanini', 'LDR', 23], ['Jasha Sütterlin', 'ROU', 31],
      ['Coby Jungels', 'LDR', 24], ['Rainer Kepplinger', 'CLM', 28], ['Josef Černý', 'ROU', 31], ['Fran Miholjević', 'SPR', 24],
      ['Vladyslav Soltasiuk', 'SPR', 22], ['Torstein Træen', 'CLM', 29], ['Filippo Magli', 'CLM', 25], ['Jonathan Milan', 'SPR', 26],
      ['Alessio Portello', 'LDR', 24], ['Nikias Arndt', 'SPR', 32],
    ],
  },
  {
    name: 'Groupama–FDJ', shortName: 'GFC', uciCode: 'GFC', tier: 74, division: DIV1, expectation: 11, marketability: 650,
    riders: [
      ['David Gaudu', 'LDR', 28], ['Stefan Küng', 'ROU', 30], ['Arnaud Démare', 'SPR', 32], ['Romain Grégoire', 'LDR', 23],
      ['Lenny Martinez', 'CLM', 21], ['Valentin Madouas', 'CLM', 28], ['Quentin Pacher', 'CLM', 32], ['Cyril Barthe', 'SPR', 29],
      ['Thibaud Gruel', 'LDR', 21], ['Laurence Pithie', 'SPR', 23], ['Jake Stewart', 'SPR', 25], ['Eddy Le Huitouze', 'ROU', 24],
      ['Kévin Geniets', 'ROU', 27], ['Reuben Thompson', 'CLM', 23], ['Lars van den Berg', 'ROU', 25],
      ['Lewis Askey', 'SPR', 23], ['Clément Russo', 'ROU', 30], ['Alexys Brunel', 'ROU', 26], ['Georg Zimmermann', 'CLM', 28],
      ['Bruno Armirail', 'ROU', 30], ['Enzo Paleni', 'LDR', 23], ['Tom Mainguenaud', 'SPR', 23],
    ],
  },
  {
    name: 'Decathlon–AG2R', shortName: 'DAG', uciCode: 'DAG', tier: 72, division: DIV1, expectation: 12, marketability: 620,
    riders: [
      ["Ben O'Connor", 'LDR', 28], ['Felix Gall', 'LDR', 26], ['Sam Bennett', 'SPR', 34], ['Benoît Cosnefroy', 'SPR', 29],
      ['Bruno Armirail', 'ROU', 30], ['Clément Berthet', 'CLM', 27], ['Alex Baudin', 'CLM', 23], ['Pierre Gautherat', 'ROU', 23],
      ['Oliver Naesen', 'ROU', 33], ['Dorian Godon', 'SPR', 28], ['Valentin Paret-Peintre', 'LDR', 24], ['Victor Lafay', 'LDR', 28],
      ['Romain Grégoire', 'LDR', 22], ['Joris Delbove', 'ROU', 24], ['Sandy Dujardin', 'SPR', 25],
      ['Noa Isidore', 'SPR', 22], ['Jordan Labrosse', 'ROU', 24], ['Valentin Retailleau', 'SPR', 23], ['Nicolas Prodhomme', 'CLM', 28],
      ['Alexis Renard', 'SPR', 26], ['Gilles De Wilde', 'LDR', 22], ['Jaakko Hänninen', 'CLM', 27],
    ],
  },
  // --- ProTeam division ---
  {
    name: 'Cofidis', shortName: 'COF', uciCode: 'COF', tier: 66, division: DIV2, expectation: 1, marketability: 520,
    riders: [
      ["Iván García Cortina", 'SPR', 29], ['Bryan Coquard', 'SPR', 32], ['Guillaume Martin', 'CLM', 31], ['Ion Izagirre', 'LDR', 35],
      ['Hugo Hofstetter', 'SPR', 29], ['Alexis Renard', 'SPR', 26], ['Simone Consonni', 'SPR', 30], ['Thomas Champion', 'CLM', 27],
      ['Axel Mariault', 'ROU', 29], ['Lorenzo Manzin', 'SPR', 31], ['Alexis Gougeard', 'ROU', 31],
      ['Jesús Herrada', 'LDR', 34], ['Jonathan Lastra', 'CLM', 29], ['Rubén Fernández', 'LDR', 33], ['Sandy Dujardin', 'SPR', 25],
      ['Valentin Ferron', 'CLM', 25], ['Jelle Wallays', 'ROU', 35], ['Oliver Knight', 'ROU', 24], ['Gorka Izagirre', 'ROU', 37],
      ['Eddy Finé', 'CLM', 27], ['Harrison Wood', 'LDR', 24], ['Benjamin Thomas', 'SPR', 29],
    ],
  },
  {
    name: 'Israel–Premier Tech', shortName: 'IPT', uciCode: 'IPT', tier: 64, division: DIV2, expectation: 2, marketability: 500,
    riders: [
      ['Derek Gee', 'LDR', 26], ['Michael Woods', 'LDR', 37], ['Itamar Einhorn', 'SPR', 29], ['Stephen Williams', 'ROU', 27],
      ['Sep Vanmarcke', 'ROU', 35], ['Hugo Houle', 'ROU', 33], ['Krists Neilands', 'CLM', 30], ['Nick Schultz', 'CLM', 30],
      ['Jake Stewart', 'SPR', 25], ['Simon Clarke', 'ROU', 38], ['Pierre Barbier', 'SPR', 29], ['Matthew Riccitello', 'LDR', 22],
      ['Nadav Raisberg', 'LDR', 26], ['Riley Sheehan', 'SPR', 25], ['Marco Frigo', 'SPR', 25], ['Oscar Onley', 'LDR', 22],
      ['Tom Van Asbroeck', 'SPR', 34], ['Guillaume Boivin', 'ROU', 35], ['Jenthe Biermans', 'SPR', 29], ['Rotem Tene', 'LDR', 26],
      ['Alec Segaert', 'CLM', 21], ['Oded Kogut', 'SPR', 24],
    ],
  },
  {
    name: 'Uno-X Mobility', shortName: 'UXM', uciCode: 'UXM', tier: 63, division: DIV2, expectation: 3, marketability: 490,
    riders: [
      ['Magnus Cort', 'SPR', 31], ['Alexander Kristoff', 'SPR', 37], ['Jonas Abrahamsen', 'ROU', 27], ['Søren Wærenskjold', 'SPR', 24],
      ['Anders Halland Johannessen', 'LDR', 26], ['Tobias Halland Johannessen', 'LDR', 26], ['Rasmus Tiller', 'SPR', 27],
      ['Erlend Blikra', 'SPR', 26], ['Markus Hoelgaard', 'ROU', 29], ['Jørgen Nordhagen', 'CLM', 20],
      ['Andreas Leknessund', 'CLM', 25], ['Ådne Holter', 'CLM', 23], ['Fredrik Dversnes', 'ROU', 27],
      ['Syver Wærsted', 'ROU', 28], ['Ludvig Aasheim', 'SPR', 25], ['Elias Marthinsson', 'LDR', 22],
      ['William Blume Levy', 'SPR', 23], ['Jacob Madsen', 'ROU', 26], ['Morten Hulgaard', 'ROU', 30], ['Idar Andersen', 'CLM', 26],
      ['Eirik Lunder', 'SPR', 24], ['Martin Urianstad', 'CLM', 27],
    ],
  },
  {
    name: 'Tud Pro Cycling', shortName: 'TUD', uciCode: 'TUD', tier: 62, division: DIV2, expectation: 4, marketability: 480,
    riders: [
      ['Marc Hirschi', 'SPR', 30], ['Matteo Trentin', 'SPR', 35], ['Riley Sheehan', 'ROU', 25], ['Lorenzo Milesi', 'SPR', 23],
      ['Alberto Dainese', 'SPR', 26], ['Patrick Konrad', 'LDR', 32], ['Simon Pellaud', 'ROU', 32], ['Yannis Voisard', 'LDR', 25],
      ['Jakob Fuglsang', 'LDR', 39], ['Arvid de Kleijn', 'SPR', 29], ['Joel Suter', 'ROU', 27],
      ['Antonio Tiberi', 'LDR', 22], ['Sean Flynn', 'LDR', 23], ['Hamish Beadle', 'CLM', 25],
      ['Robin Froidevaux', 'SPR', 28], ['Johan Price-Pejtersen', 'ROU', 26], ['Mats Wenzel', 'LDR', 23], ['Davide De Pretto', 'SPR', 23],
      ['Daniel Årnes', 'CLM', 24], ['Vegard Stake Laengen', 'ROU', 35], ['Markus Freiberger', 'ROU', 31],
    ],
  },
  {
    name: 'Q36.5 Pro Cycling', shortName: 'Q36', uciCode: 'Q36', tier: 61, division: DIV2, expectation: 5, marketability: 470,
    riders: [
      ['Gianni Moscon', 'ROU', 30], ['Nicolò Parolini', 'LDR', 23], ['Bert Van Lerberghe', 'ROU', 32], ['Rohan Dennis', 'LDR', 33],
      ['Damiano Caruso', 'LDR', 36], ['Nickolas Zukowsky', 'SPR', 26], ['Kyle Murphy', 'ROU', 30], ['Floris De Tier', 'CLM', 32],
      ['Tom Van Asbroeck', 'SPR', 34], ['Stanisław Aniołkowski', 'SPR', 27], ['Davide Ballerini', 'SPR', 30],
      ['Marco Brenner', 'LDR', 22], ['Casper Pedersen', 'ROU', 28], ['Justin Wolf', 'ROU', 28],
      ['Chris Harper', 'LDR', 30], ['Dion Smith', 'ROU', 31], ['Mark Stewart', 'ROU', 29], ['Jannik Steimle', 'SPR', 28],
      ['Iljo Keisse', 'ROU', 42], ['Alexander Kristoff', 'SPR', 37], ['Matteo Moschetti', 'SPR', 27],
    ],
  },
  {
    name: 'Team Jayco AlUla', shortName: 'JAY', uciCode: 'JAY', tier: 60, division: DIV2, expectation: 6, marketability: 460,
    riders: [
      ['Luke Plapp', 'LDR', 24], ['Dylan Groenewegen', 'SPR', 30], ['Chris Harper', 'LDR', 29], ['Simon Yates', 'LDR', 32],
      ['Michael Matthews', 'SPR', 34], ['Luka Mezgec', 'SPR', 36], ['Esteban Chaves', 'CLM', 34], ['Simon Phillip Yates', 'LDR', 32],
      ['Lukas Pöstlberger', 'ROU', 32], ['Campbell Stewart', 'SPR', 27], ['Max Walscheid', 'SPR', 31], ['Amund Grøndahl Jansen', 'ROU', 30],
      ['Jan Maas', 'ROU', 27], ['Callum Scotson', 'ROU', 28], ['Felix Engelhardt', 'LDR', 23],
      ['Kelland O\'Brien', 'ROU', 28], ['Vinzenz Plapp', 'ROU', 25], ['Alessandro De Marchi', 'CLM', 38],
      ['Matteo Sobrero', 'ROU', 27], ['Zdeněk Štybar', 'ROU', 39], ['Sam Bewley', 'ROU', 37],
    ],
  },
  {
    name: 'Lotto Dstny', shortName: 'LTD', uciCode: 'LTD', tier: 58, division: DIV2, expectation: 7, marketability: 440,
    riders: [
      ['Arnaud De Lie', 'SPR', 22], ['Victor Campenaerts', 'ROU', 32], ['Brent Van Moer', 'ROU', 28], ['Lennert Van Eetvelt', 'LDR', 23],
      ['Sébastien Grignard', 'ROU', 26], ['Florian Vermeersch', 'LDR', 25], ['Maxim Van Gils', 'LDR', 25], ['Jasper De Buyst', 'SPR', 30],
      ['Harm Vanhoucke', 'CLM', 28], ['Lars De Pauw', 'SPR', 24], ['Eduardo Sepúlveda', 'CLM', 33],
      ['Robin Orins', 'SPR', 26], ['Sylvain Moniquet', 'CLM', 26], ['Lionel Taminiaux', 'SPR', 29], ['Jonas Gregaard', 'LDR', 27],
      ['Tom Paquot', 'ROU', 26], ['Jarrad Drizners', 'SPR', 25], ['Logan Currie', 'ROU', 24], ['Steff Cras', 'CLM', 27],
      ['Jelle Wallays', 'ROU', 35], ['Briek Van de Vijvere', 'SPR', 24],
    ],
  },
  {
    name: 'Picnic–PostNL', shortName: 'PIC', uciCode: 'PIC', tier: 57, division: DIV2, expectation: 8, marketability: 430,
    riders: [
      ['Oscar Onley', 'LDR', 22], ['Sam Welsford', 'SPR', 28], ['Marijn van den Berg', 'SPR', 25], ['Pavel Bittner', 'SPR', 23],
      ['Romain Bardet', 'LDR', 34], ['Casper van Uden', 'SPR', 23], ['Tobias Lund Andresen', 'SPR', 23],
      ['Gijs Leemreize', 'ROU', 25], ['Julius van den Berg', 'ROU', 26], ['Mark Donovan', 'CLM', 26],
      ['Guy Sagiv', 'ROU', 29], ['Matthew Brennan', 'SPR', 21], ['Bram Welten', 'SPR', 28],
      ['Kevin Vermaerke', 'LDR', 24], ['Patrick Eddy', 'ROU', 24], ['Tim Naberman', 'ROU', 27],
      ['Frank van den Broek', 'LDR', 22], ['Ide Schelling', 'CLM', 27], ['Sean Flynn', 'LDR', 23],
      ['Axel Zingle', 'SPR', 25], ['Florian Stork', 'ROU', 27],
    ],
  },
  {
    name: 'Astana Qazaqstan', shortName: 'AST', uciCode: 'AST', tier: 56, division: DIV2, expectation: 9, marketability: 420,
    riders: [
      ['Mark Cavendish', 'SPR', 39], ['Harold Tejada', 'LDR', 27], ['Cees Bol', 'SPR', 29], ['Davide Ballerini', 'SPR', 30],
      ['Luis León Sánchez', 'LDR', 41], ['Michele Gazzoli', 'SPR', 26], ['Henok Mulubrhan', 'SPR', 25], ['Gleb Brussenskiy', 'ROU', 24],
      ['Gianmarco Garofoli', 'LDR', 22], ['Christian Scaroni', 'LDR', 28], ['Javier Romo', 'LDR', 26],
      ['Andrey Zeits', 'ROU', 37], ['Yevgeniy Fedorov', 'ROU', 25], ['Igor Chzhan', 'LDR', 24], ['Dmitriy Gruzdev', 'ROU', 38],
      ['Samuele Battistella', 'CLM', 25], ['Vadim Pronskiy', 'CLM', 26], ['Nicolas Vinokurov', 'SPR', 23],
      ['Alexey Lutsenko', 'LDR', 32], ['Rüdiger Selig', 'SPR', 35], ['Enrico Zanoncello', 'SPR', 25],
    ],
  },
  {
    name: 'dsm–firmenich PostNL', shortName: 'DSM', uciCode: 'DSM', tier: 55, division: DIV2, expectation: 10, marketability: 410,
    riders: [
      ['Romain Bardet', 'LDR', 34], ['Pavel Bittner', 'SPR', 23], ['John Degenkolb', 'SPR', 35], ['Warren Barguil', 'CLM', 32],
      ['Romain Combaud', 'ROU', 31], ['Chris Hamilton', 'ROU', 29], ['Max Kanter', 'SPR', 26], ['Nils Eekhoff', 'SPR', 26],
      ['Niklas Märkl', 'SPR', 25], ['Sean Flynn', 'LDR', 23], ['Marius Mayrhofer', 'LDR', 24], ['Oscar Onley', 'LDR', 23],
      ['Florian Stork', 'ROU', 27], ['Patrick Bevin', 'ROU', 33], ['Sam Welsford', 'SPR', 28],
      ['Martijn Tusveld', 'CLM', 30], ['Lorenzo Milesi', 'SPR', 23], ['Tobias Lund Andresen', 'SPR', 23], ['Alberto Dainese', 'SPR', 26],
      ['Pavel Sivakov', 'LDR', 27], ['Benjamin Thomas', 'SPR', 29], ['Gijs Leemreize', 'ROU', 25],
    ],
  },
  {
    name: 'Burgos-BH', shortName: 'BBH', uciCode: 'BBH', tier: 52, division: DIV2, expectation: 11, marketability: 380,
    riders: [
      ["Jon Barrenetxea", 'SPR', 25], ['Jesús Ezquerra', 'SPR', 29], ['Eric Fagúndez', 'SPR', 25], ['Mikel Landa', 'LDR', 35],
      ['Juan Pedro López', 'LDR', 27], ['Daniel Navarro', 'CLM', 40], ['Jorge Arcas', 'ROU', 35], ['Óscar Cabedo', 'CLM', 30],
      ['Victor Langellotti', 'LDR', 28], ['Cyril Barthe', 'SPR', 29], ['Ander Okamika', 'SPR', 28],
      ['Jokin Murguialday', 'LDR', 25], ['Javier Serrano', 'LDR', 23], ['Jordi López', 'ROU', 24],
      ['Vicente Hernaiz', 'CLM', 24], ['Pelayo Sánchez', 'CLM', 24], ['Antonio Jesús Soto', 'ROU', 29], ['Álex Millán', 'SPR', 25],
      ['Sergio Merchan', 'ROU', 27], ['Diego Pablo Sevilla', 'SPR', 26], ['Mario Aparicio', 'LDR', 23],
    ],
  },
  {
    name: 'Kern Pharma', shortName: 'KPH', uciCode: 'KPH', tier: 50, division: DIV2, expectation: 12, marketability: 360,
    riders: [
      ['Pablo Castrillo', 'LDR', 24], ['Mikel Azparren', 'LDR', 28], ['Jorge Gutiérrez', 'LDR', 25], ['Héctor Carretero', 'CLM', 29],
      ['Jokin Murguialday', 'LDR', 25], ['Mikel Iturria', 'ROU', 34], ['Diego López', 'SPR', 25], ['Urko Berrade', 'CLM', 25],
      ['Antonio Jesús Soto', 'ROU', 29], ['Ibon Ruiz', 'ROU', 27], ['Julián Barrientos', 'SPR', 25],
      ['Pau Miquel', 'LDR', 23], ['Francisco Galván', 'CLM', 25], ['Asier Etxeberria', 'ROU', 26],
      ['Sergio Merchan', 'ROU', 27], ['Haimar Etxeberria', 'SPR', 24], ['Ander Ganzábal', 'LDR', 24],
      ['Iker Ballarin', 'SPR', 25], ['Xabier Berasategi', 'CLM', 24], ['Markel Beloki', 'LDR', 21], ['Ander Okamika', 'SPR', 28],
    ],
  },
];

export function teamFinances(tier) {
  const balance = Math.round((Math.pow(tier / 10, 3.4) * 12000) / 50000) * 50000;
  return { balance, transferBudget: Math.round((balance * 0.5) / 25000) * 25000 };
}

export function buildTeams() {
  return RAW_TEAMS
    .map((raw) => ({ ...raw, riders: raw.riders.concat(ADDITIONAL_RIDERS[raw.name] || []) }))
    .map(T)
    .map((team) => {
    const fin = teamFinances(team.tier);
    team.balance = fin.balance;
    team.transferBudget = fin.transferBudget;
    team.capacity = 30;
    team.lastExposure = 0;
    team.exposureSum = 0;
    team.exposureN = 0;
    team.infraLevel = 1;
    team.infraBuild = null;
    team.formGuide = [];
    return team;
  });
}

export const TEAMS = buildTeams();

export const TEAMS_BY_NAME = new Map(TEAMS.map((t) => [t.name, t]));

export function findTeam(nameOrShortOrUci) {
  return TEAMS.find(
    (t) => t.name === nameOrShortOrUci || t.shortName === nameOrShortOrUci || t.uciCode === nameOrShortOrUci
  );
}
