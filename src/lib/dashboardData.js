// Letter/period data + createEmptyData for the Student Dashboard

export const EN_LETTERS_ROW1 = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
export const EN_LETTERS_ROW2 = ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Spanish letters grouped by 9-week period, each period split into modules.
// Each module has a name + its letters. The grid renders a module header row
// that overarches (colSpans) the letters belonging to that module.
// {d: display, k: unique data key, p?: phoneme, bl?: black out Letra, tl?: thin left border}
export const ES_PERIODS = [
  {
    label: '1as 9 sem',
    defaultDate: 'oct. 10',
    modules: [
      { name: 'Módulo 1', letters: [
        {d:'O',k:'O'},{d:'o',k:'o',tl:1},{d:'I',k:'I'},{d:'i',k:'i',tl:1},
        {d:'A',k:'A'},{d:'a',k:'a',tl:1},{d:'U',k:'U'},{d:'u',k:'u',tl:1},
        {d:'E',k:'E'},{d:'e',k:'e',tl:1},{d:'M',k:'M'},{d:'m',k:'m',tl:1},
      ]},
      { name: 'Módulo 2', letters: [
        {d:'P',k:'P'},{d:'p',k:'p',tl:1},{d:'S',k:'S'},{d:'s',k:'s',tl:1},
        {d:'L',k:'L'},{d:'l',k:'l',tl:1},{d:'N',k:'N'},{d:'n',k:'n',tl:1},
      ]},
    ],
  },
  {
    label: '2as 9 sem',
    defaultDate: 'dic. 19',
    modules: [
      { name: 'Módulo 3', letters: [
        {d:'D',k:'D'},{d:'d',k:'d',tl:1},{d:'T',k:'T'},{d:'t',k:'t',tl:1},
      ]},
      { name: 'Módulo 4', letters: [
        {d:'F',k:'F'},{d:'f',k:'f',tl:1},{d:'B',k:'B'},{d:'b',k:'b',tl:1},
        {d:'R_',k:'R_'},{d:'r',k:'r',tl:1},
      ]},
      { name: 'Módulo 5', letters: [
        {d:'C',k:'C',p:'/k/'},{d:'c',k:'c',p:'/k/',tl:1},
        {d:'Q',k:'Q'},{d:'q',k:'q',tl:1},{d:'V',k:'V'},{d:'v',k:'v',tl:1},
      ]},
    ],
  },
  {
    label: '3as 9 sem',
    defaultDate: 'mar. 6',
    modules: [
      { name: 'Módulo 5', letters: [
        {d:'R_',k:'R_'},{d:'r',k:'r',tl:1},
      ]},
      { name: 'Módulo 6', letters: [
        {d:'Ll',k:'Ll',bl:1},{d:'ll',k:'ll',bl:1,tl:1},
        {d:'G',k:'G',p:'/g/'},{d:'g',k:'g',p:'/g/',tl:1},
        {d:'Y',k:'Y'},{d:'y',k:'y',tl:1},{d:'Z',k:'Z'},{d:'z',k:'z',tl:1},
      ]},
      { name: 'Módulo 7', letters: [
        {d:'H',k:'H'},{d:'h',k:'h',tl:1},{d:'J',k:'J'},{d:'j',k:'j',tl:1},
        {d:'C',k:'C_s',p:'/s/',bl:1},{d:'c',k:'c_s',p:'/s/',bl:1,tl:1},
        {d:'Ñ',k:'Ñ'},{d:'ñ',k:'ñ',tl:1},
        {d:'G',k:'G_j',p:'/j/',bl:1},{d:'g',k:'g_j',p:'/j/',bl:1,tl:1},
      ]},
    ],
  },
  {
    label: '4as 9 sem',
    defaultDate: 'may. 22',
    modules: [
      { name: 'Módulo 7', letters: [
        {d:'Ch',k:'Ch',bl:1},{d:'ch',k:'ch',bl:1,tl:1},
      ]},
      { name: 'Módulo 8', letters: [
        {d:'K',k:'K'},{d:'k',k:'k',tl:1},{d:'X',k:'X'},{d:'x',k:'x',tl:1},
        {d:'W',k:'W'},{d:'w',k:'w',tl:1},
      ]},
    ],
  },
];

// Flatten all letters across all modules for createEmptyData
export const ALL_ES_LETTERS = ES_PERIODS.flatMap(p => p.modules.flatMap(m => m.letters));

export const NUMBERS_ROW1 = ['0','1','2','3','4','5','6','7','8','9','10'];
export const NUMBERS_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];
export const COMPOSE_ROW1 = ['1','2','3','4','5','6','7','8','9','10'];
export const COMPOSE_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];
export const PERIODS = ['1st', '2nd', '3rd', '4th'];

export function createEmptyData() {
  const data = {
    letters: {},
    allUpper: false,
    allLower: false,
    allSounds: false,
    allFormation: false,
    periodDates: { '1st': 'oct. 10', '2nd': 'dic. 19', '3rd': 'mar. 6', '4th': 'may. 22' },
    lastLetterLearned: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    numbers: {},
    compose: {},
    counting: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    parentInitials: {
      letters: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      numbers: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      compose: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    },
  };
  for (const l of [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2]) {
    data.letters[l] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const l of ALL_ES_LETTERS) {
    data.letters[l.k] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const n of [...NUMBERS_ROW1, ...NUMBERS_ROW2]) {
    data.numbers[n] = { read: false, write: false };
  }
  for (const n of [...COMPOSE_ROW1, ...COMPOSE_ROW2]) {
    data.compose[n] = { compose: false, decompose2: false, decompose3: false };
  }
  return data;
}