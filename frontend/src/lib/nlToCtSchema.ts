// Mirror of backend/src/lib/nlToCtSchema.js. Keep in sync.
//
// The frontend doesn't need the column letters (those are a backend-only
// concern for reading the sheet) — only the codes/keys for rendering and
// matching responses.

export interface BranchDef {
  code: string;
}
export interface SlotDef {
  key: string;
  day: 'Wed' | 'Thu' | 'Fri';
  time: string;
  hasQaqc: boolean;
}

export const BRANCHES: BranchDef[] = [
  { code: 'ONL'  }, { code: 'ST'   }, { code: 'SA'   }, { code: 'SP'   },
  { code: 'KD'   }, { code: 'PJY'  }, { code: 'AMP'  }, { code: 'CJY'  },
  { code: 'KLG'  }, { code: 'DA'   }, { code: 'BBB'  }, { code: 'DK'   },
  { code: 'SHA'  }, { code: 'BTHO' }, { code: 'EGR'  }, { code: 'BSP'  },
  { code: 'RBY'  }, { code: 'TSG'  }, { code: 'KW'   }, { code: 'KTG'  },
];

export const TIME_SLOTS: SlotDef[] = [
  { key: 'wed_4_30pm',  day: 'Wed', time: '4:30PM',  hasQaqc: false },
  { key: 'wed_5_30pm',  day: 'Wed', time: '5:30PM',  hasQaqc: true  },
  { key: 'thu_12_30pm', day: 'Thu', time: '12:30PM', hasQaqc: true  },
  { key: 'thu_5_30pm',  day: 'Thu', time: '5:30PM',  hasQaqc: true  },
  { key: 'thu_7_00pm',  day: 'Thu', time: '7:00PM',  hasQaqc: true  },
  { key: 'fri_12_30pm', day: 'Fri', time: '12:30PM', hasQaqc: false },
  { key: 'fri_4_30pm',  day: 'Fri', time: '4:30PM',  hasQaqc: true  },
  { key: 'fri_6_30pm',  day: 'Fri', time: '6:30PM',  hasQaqc: false },
];

// Group slots by day for the grid view's column-group headers.
export const SLOTS_BY_DAY: Array<{ day: 'Wed' | 'Thu' | 'Fri'; slots: SlotDef[] }> = (() => {
  const out: Array<{ day: 'Wed' | 'Thu' | 'Fri'; slots: SlotDef[] }> = [];
  for (const s of TIME_SLOTS) {
    const last = out[out.length - 1];
    if (last && last.day === s.day) last.slots.push(s);
    else out.push({ day: s.day, slots: [s] });
  }
  return out;
})();
