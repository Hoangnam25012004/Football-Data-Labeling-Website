/* ============================================================
   Seed dataset — the Saint Lucia channel.

   Every number here was read out of the four match reports in
   /Result (Haiti, Aruba, Curaçao, Barbados). Nothing is invented.
   The app uses this when Supabase has no published data to serve
   yet, so the site always has one fully worked channel to show.

   Shape matches what supa.js returns, so the UI never knows which
   source it is rendering.
   ============================================================ */
(function (global) {
  'use strict';

  /* Saint Lucia's own column in each match's team comparison. */
  var M = {
    haiti: {
      id: '45956', slug: 'haiti', date: '2024-06-07', dateLabel: 'Friday, 7 June 2024',
      home: { name: 'Haiti', crest: 'HAI', score: 2 },
      away: { name: 'Saint Lucia', crest: 'SLU', score: 1 },
      side: 'away', result: 'L', opponent: 'Haiti', venue: 'Away',
      timeline: [
        { min: 14, at: 15.6, type: 'yellow', side: 'them', text: "14' Yellow — Sainte (#18), Haiti" },
        { min: 18, at: 20.0, type: 'goal', side: 'us', text: "18' Elva (#14) — 0–1" },
        { min: 47, at: 52.2, type: 'goal', side: 'them', text: "47' Dueverne (#22), assist Picault (#7) — 1–1" },
        { min: 74, at: 82.2, type: 'yellow', side: 'us', text: "74' Yellow — Pearson (#13), Saint Lucia" },
        { min: 77, at: 85.6, type: 'goal', side: 'them', text: "77' Nazon (#9) — 2–1" },
        { min: 91, at: 96.0, type: 'yellow', side: 'them', text: "90+1' Yellow — Attys (#21), Haiti" },
        { min: 93, at: 98.0, type: 'yellow', side: 'us', text: "90+3' Yellow — Doxilly (#6), Saint Lucia" }
      ],
      us:   { poss: 35.0, goals: 1, assists: 0, keyPasses: 1, shots: 2, onTarget: 1, offTarget: 1, blocked: 0, missed: 0, shotAcc: 50.0,
              passes: 272, passesDone: 196, passAcc: 72.1, crosses: 15, crossesDone: 2, takeOns: 8, takeOnsWon: 1, stepIns: 2,
              tackles: 38, tacklesWon: 23, tackleAcc: 60.5, interceptions: 6, recoveries: 63, clearances: 36, blocks: 17,
              aerial: 25, aerialWon: 10, ground: 20, groundWon: 10, mistakes: 2 },
      them: { poss: 65.0, goals: 2, assists: 1, keyPasses: 11, shots: 25, onTarget: 5, offTarget: 12, blocked: 6, missed: 2, shotAcc: 20.0,
              passes: 506, passesDone: 453, passAcc: 89.5, crosses: 41, crossesDone: 9, takeOns: 11, takeOnsWon: 4, stepIns: 7,
              tackles: 33, tacklesWon: 21, tackleAcc: 63.6, interceptions: 7, recoveries: 82, clearances: 16, blocks: 10,
              aerial: 24, aerialWon: 15, ground: 19, groundWon: 9, mistakes: 3 }
    },

    aruba: {
      id: '55357', slug: 'aruba', date: '2024-06-12', dateLabel: 'Wednesday, 12 June 2024',
      home: { name: 'Saint Lucia', crest: 'SLU', score: 2 },
      away: { name: 'Aruba', crest: 'ARU', score: 2 },
      side: 'home', result: 'D', opponent: 'Aruba', venue: 'Home',
      timeline: [
        { min: 21, at: 23.3, type: 'goal', side: 'them', text: "21' Bennett (#8), assist Perret Gentil (#21) — 0–1" },
        { min: 43, at: 47.8, type: 'goal', side: 'them', text: "43' Marselia (#20), penalty, assist Rua (#7) — 0–2" },
        { min: 47, at: 51.0, type: 'goal', side: 'us', text: "45+2' Stanislas (#11), assist Elva (#14) — 1–2" },
        { min: 67, at: 74.4, type: 'goal', side: 'us', text: "67' Pearson (#13), assist Elva (#14) — 2–2" },
        { min: 92, at: 97.0, type: 'yellow', side: 'us', text: "90+2' Yellow — Doxilly (#6), Saint Lucia" },
        { min: 93, at: 98.5, type: 'yellow', side: 'them', text: "90+3' Yellow — Lewis (#3), Aruba" }
      ],
      us:   { poss: 55.3, goals: 2, assists: 2, keyPasses: 13, shots: 15, onTarget: 9, offTarget: 4, blocked: 2, missed: 0, shotAcc: 60.0,
              passes: 453, passesDone: 395, passAcc: 87.2, crosses: 29, crossesDone: 13, takeOns: 6, takeOnsWon: 1, stepIns: 5,
              tackles: 42, tacklesWon: 31, tackleAcc: 73.8, interceptions: 3, recoveries: 60, clearances: 10, blocks: 12,
              aerial: 12, aerialWon: 8, ground: 20, groundWon: 9, mistakes: 6 },
      them: { poss: 44.7, goals: 2, assists: 2, keyPasses: 9, shots: 11, onTarget: 8, offTarget: 2, blocked: 1, missed: 0, shotAcc: 72.7,
              passes: 366, passesDone: 301, passAcc: 82.2, crosses: 12, crossesDone: 3, takeOns: 8, takeOnsWon: 2, stepIns: 3,
              tackles: 36, tacklesWon: 18, tackleAcc: 50.0, interceptions: 8, recoveries: 53, clearances: 13, blocks: 14,
              aerial: 12, aerialWon: 4, ground: 20, groundWon: 12, mistakes: 3 }
    },

    curacao: {
      id: '51977', slug: 'curacao', date: '2025-06-07', dateLabel: 'Saturday, 7 June 2025',
      home: { name: 'Curaçao', crest: 'CUW', score: 4 },
      away: { name: 'Saint Lucia', crest: 'SLU', score: 0 },
      side: 'away', result: 'L', opponent: 'Curaçao', venue: 'Away',
      timeline: [
        { min: 37, at: 41.1, type: 'goal', side: 'them', text: "37' Kastaneer (#9), assist Comenencia (#8) — 1–0" },
        { min: 52, at: 57.8, type: 'goal', side: 'them', text: "52' Kastaneer (#9), assist Gorré (#14) — 2–0" },
        { min: 57, at: 63.3, type: 'goal', side: 'them', text: "57' Kastaneer (#9), assist Brenet (#20) — 3–0" },
        { min: 74, at: 82.2, type: 'goal', side: 'them', text: "74' Bacuna J (#7), assist Gorré (#14) — 4–0" },
        { min: 90, at: 96.0, type: 'yellow', side: 'them', text: "90' Yellow — Roemeratoe (#6), Curaçao" }
      ],
      us:   { poss: 35.3, goals: 0, assists: 0, keyPasses: 5, shots: 5, onTarget: 1, offTarget: 3, blocked: 1, missed: 0, shotAcc: 20.0,
              passes: 272, passesDone: 208, passAcc: 76.5, crosses: 9, crossesDone: 2, takeOns: 10, takeOnsWon: 2, stepIns: 2,
              tackles: 35, tacklesWon: 24, tackleAcc: 68.6, interceptions: 7, recoveries: 59, clearances: 21, blocks: 15,
              aerial: 14, aerialWon: 1, ground: 9, groundWon: 3, mistakes: 4 },
      them: { poss: 64.7, goals: 4, assists: 4, keyPasses: 17, shots: 23, onTarget: 9, offTarget: 8, blocked: 6, missed: 0, shotAcc: 39.1,
              passes: 499, passesDone: 463, passAcc: 92.8, crosses: 36, crossesDone: 8, takeOns: 12, takeOnsWon: 4, stepIns: 5,
              tackles: 31, tacklesWon: 26, tackleAcc: 83.9, interceptions: 9, recoveries: 68, clearances: 7, blocks: 6,
              aerial: 15, aerialWon: 14, ground: 9, groundWon: 6, mistakes: 6 }
    },

    barbados: {
      id: '32746', slug: 'barbados', date: '2025-06-11', dateLabel: 'Wednesday, 11 June 2025',
      home: { name: 'Saint Lucia', crest: 'SLU', score: 2 },
      away: { name: 'Barbados', crest: 'BRB', score: 1 },
      side: 'home', result: 'W', opponent: 'Barbados', venue: 'Home',
      formation: '3-2-2-2-1',
      timeline: [
        { min: 12, at: 13.3, type: 'goal', side: 'them', text: "12' Richards (#22), assist Reid-Stephen (#10) — 0–1" },
        { min: 17, at: 18.9, type: 'yellow', side: 'them', text: "17' Yellow — Small (#13), Barbados" },
        { min: 42, at: 46.7, type: 'goal', side: 'us', text: "42' Elva (#14), penalty, assist Caull (#15) — 1–1" },
        { min: 61, at: 67.8, type: 'red', side: 'them', text: "61' Second yellow → red — Small (#13), Barbados" },
        { min: 72, at: 80.0, type: 'yellow', side: 'us', text: "72' Yellow — Aman (#13), Saint Lucia" },
        { min: 91, at: 96.0, type: 'goal', side: 'us', text: "90+1' Elva (#14), penalty — 2–1" },
        { min: 92, at: 97.0, type: 'yellow', side: 'them', text: "90+2' Yellow — Hinkson (#12), Barbados" },
        { min: 95, at: 99.0, type: 'yellow', side: 'them', text: "90+5' Yellow — Morris (#2), Barbados" }
      ],
      us:   { poss: 53.7, goals: 2, assists: 1, keyPasses: 7, shots: 17, onTarget: 5, offTarget: 5, blocked: 6, missed: 1, shotAcc: 29.4,
              passes: 356, passesDone: 279, passAcc: 78.4, crosses: 21, crossesDone: 7, takeOns: 5, takeOnsWon: 1, stepIns: 3,
              tackles: 30, tacklesWon: 19, tackleAcc: 63.3, interceptions: 6, recoveries: 86, clearances: 17, blocks: 13,
              aerial: 20, aerialWon: 9, ground: 18, groundWon: 10, mistakes: 4 },
      them: { poss: 46.3, goals: 1, assists: 1, keyPasses: 8, shots: 11, onTarget: 3, offTarget: 6, blocked: 2, missed: 0, shotAcc: 27.3,
              passes: 307, passesDone: 241, passAcc: 78.5, crosses: 11, crossesDone: 0, takeOns: 2, takeOnsWon: 0, stepIns: 2,
              tackles: 33, tacklesWon: 23, tackleAcc: 69.7, interceptions: 8, recoveries: 61, clearances: 28, blocks: 16,
              aerial: 19, aerialWon: 10, ground: 16, groundWon: 7, mistakes: 8 },
      /* Saint Lucia's attacking player table, exactly as the report lists it. */
      players: [
        { no: 14, name: 'Elva',            goals: 2, assists: 0, shots: 6, onTarget: 4, offTarget: 1, blocked: 0, missed: 1, shotAcc: '67%', freekicks: 0, corners: 0 },
        { no: 15, name: 'Caull',           goals: 0, assists: 1, shots: 3, onTarget: 0, offTarget: 1, blocked: 2, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 2,  name: 'Frederick',       goals: 0, assists: 0, shots: 3, onTarget: 1, offTarget: 1, blocked: 1, missed: 0, shotAcc: '33%', freekicks: 8, corners: 3 },
        { no: 13, name: 'Aman',            goals: 0, assists: 0, shots: 2, onTarget: 0, offTarget: 1, blocked: 1, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 7,  name: 'Jude-Boyd',       goals: 0, assists: 0, shots: 1, onTarget: 0, offTarget: 1, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 1, corners: 3 },
        { no: 6,  name: 'Doxilly',         goals: 0, assists: 0, shots: 1, onTarget: 0, offTarget: 0, blocked: 1, missed: 0, shotAcc: '0%',  freekicks: 1, corners: 0 },
        { no: 11, name: 'Richard',         goals: 0, assists: 0, shots: 1, onTarget: 0, offTarget: 0, blocked: 1, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 1,  name: 'Barclett',        goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 2, corners: 0 },
        { no: 21, name: 'Nelson',          goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 1, corners: 1 },
        { no: 20, name: 'Jn Baptiste',     goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 4,  name: 'Thomas',          goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 3,  name: 'Alexander',       goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 8,  name: 'Henville',        goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 12, name: 'Charlery',        goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 17, name: 'Solomon-Davies',  goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 },
        { no: 19, name: 'Myers',           goals: 0, assists: 0, shots: 0, onTarget: 0, offTarget: 0, blocked: 0, missed: 0, shotAcc: '0%',  freekicks: 0, corners: 0 }
      ]
    }
  };

  /* Campaign scorers, read off the four timelines. Squad numbers differ
     between the 2024 and 2025 call-ups, so each entry carries the number
     it was tagged under in the match it happened in. */
  var CONTRIBUTORS = [
    { name: 'Elva',      no: 14, goals: 3, assists: 2,
      detail: 'Goal v Haiti (18\'), two assists v Aruba, two penalties v Barbados' },
    { name: 'Stanislas', no: 11, goals: 1, assists: 0, detail: 'Goal v Aruba (45+2\')' },
    { name: 'Pearson',   no: 13, goals: 1, assists: 0, detail: 'Goal v Aruba (67\')' },
    { name: 'Caull',     no: 15, goals: 0, assists: 1, detail: 'Assist v Barbados (42\')' }
  ];

  var ORDER = ['haiti', 'aruba', 'curacao', 'barbados'];

  global.HNA_SEED = {
    club: {
      id: 'seed-saint-lucia',
      slug: 'saint-lucia',
      name: 'Saint Lucia',
      crest: 'SLU',
      competition: 'FIFA World Cup 26 Qualifying',
      stage: 'Concacaf Second Round · Group C',
      seed: true
    },
    matches: ORDER.map(function (k) { return M[k]; }),
    contributors: CONTRIBUTORS
  };
})(window);
