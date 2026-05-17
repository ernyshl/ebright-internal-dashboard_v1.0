// Single source of truth for the sheet layout used by the
// "Testing NL to CT Breakdown" dashboard.
//
// Branches and time slots are hardcoded per the design — every weekly tab
// in the source spreadsheet uses the same shape. If the live sheet's
// column letters disagree with these, update them here (and the matching
// constants file in the frontend).

const SPREADSHEET_ID = '1GgZRY2MS8m4BJX2lzww-eEkIXcdJV8sLMURGu-ai4QQ';

// Order matches the source sheet (top-to-bottom). `row` is the 1-based row
// number in the sheet that holds the branch's data.
// Sheet layout: row 1 = parameter values (0.5, 0.55, …), row 2 = day-group
// headers (Wednesday/Thursday/Friday), row 3 = column header row
// (Branch/NL/CT@40%/4:30PM/…), row 4 = Goal/Actual/QAQC sub-headers,
// row 5 onwards = branch data.
const BRANCHES = [
  { code: 'ONL',  row: 5  },
  { code: 'ST',   row: 6  },
  { code: 'SA',   row: 7  },
  { code: 'SP',   row: 8  },
  { code: 'KD',   row: 9  },
  { code: 'PJY',  row: 10 },
  { code: 'AMP',  row: 11 },
  { code: 'CJY',  row: 12 },
  { code: 'KLG',  row: 13 },
  { code: 'DA',   row: 14 },
  { code: 'BBB',  row: 15 },
  { code: 'DK',   row: 16 },
  { code: 'SHA',  row: 17 },
  { code: 'BTHO', row: 18 },
  { code: 'EGR',  row: 19 },
  { code: 'BSP',  row: 20 },
  { code: 'RBY',  row: 21 },
  { code: 'TSG',  row: 22 },
  { code: 'KW',   row: 23 },
  { code: 'KTG',  row: 24 },
];

// Column-letter positions in the sheet. `qaqcCol: null` means the slot
// has no QAQC sub-column (verified against the screenshots: Wed 4:30PM,
// Fri 12:30PM, Fri 6:30PM all lack QAQC).
const TIME_SLOTS = [
  { key: 'wed_4_30pm',  day: 'Wed', time: '4:30PM',  goalCol: 'E',  actualCol: 'F',  qaqcCol: null  },
  { key: 'wed_5_30pm',  day: 'Wed', time: '5:30PM',  goalCol: 'G',  actualCol: 'H',  qaqcCol: 'I'   },
  { key: 'thu_12_30pm', day: 'Thu', time: '12:30PM', goalCol: 'K',  actualCol: 'L',  qaqcCol: 'M'   },
  { key: 'thu_5_30pm',  day: 'Thu', time: '5:30PM',  goalCol: 'N',  actualCol: 'O',  qaqcCol: 'P'   },
  { key: 'thu_7_00pm',  day: 'Thu', time: '7:00PM',  goalCol: 'Q',  actualCol: 'R',  qaqcCol: 'S'   },
  { key: 'fri_12_30pm', day: 'Fri', time: '12:30PM', goalCol: 'U',  actualCol: 'V',  qaqcCol: null  },
  { key: 'fri_4_30pm',  day: 'Fri', time: '4:30PM',  goalCol: 'W',  actualCol: 'X',  qaqcCol: 'Y'   },
  { key: 'fri_6_30pm',  day: 'Fri', time: '6:30PM',  goalCol: 'Z',  actualCol: 'AA', qaqcCol: null  },
];

const BRANCH_CODES = new Set(BRANCHES.map(b => b.code));
const SLOT_KEYS    = new Set(TIME_SLOTS.map(s => s.key));

// Column for the per-branch NL value (yellow column near the left of the sheet)
const NL_COL  = 'B';
// Column for the per-branch CT @ 40% value
const CT_COL  = 'C';

// Convert "A" → 0, "Z" → 25, "AA" → 26, etc.
function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

module.exports = {
  SPREADSHEET_ID,
  BRANCHES,
  TIME_SLOTS,
  BRANCH_CODES,
  SLOT_KEYS,
  NL_COL,
  CT_COL,
  colLetterToIndex,
};
