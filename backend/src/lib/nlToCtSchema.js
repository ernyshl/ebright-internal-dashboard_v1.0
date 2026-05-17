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
const BRANCHES = [
  { code: 'ONL',  row: 3  },
  { code: 'ST',   row: 4  },
  { code: 'SA',   row: 5  },
  { code: 'SP',   row: 6  },
  { code: 'KD',   row: 7  },
  { code: 'PJY',  row: 8  },
  { code: 'AMP',  row: 9  },
  { code: 'CJY',  row: 10 },
  { code: 'KLG',  row: 11 },
  { code: 'DA',   row: 12 },
  { code: 'BBB',  row: 13 },
  { code: 'DK',   row: 14 },
  { code: 'SHA',  row: 15 },
  { code: 'BTHO', row: 16 },
  { code: 'EGR',  row: 17 },
  { code: 'BSP',  row: 18 },
  { code: 'RBY',  row: 19 },
  { code: 'TSG',  row: 20 },
  { code: 'KW',   row: 21 },
  { code: 'KTG',  row: 22 },
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
