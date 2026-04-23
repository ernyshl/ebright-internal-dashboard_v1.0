export const REGIONS = {
  A: [
    { name: 'Rimbayu',       code: 'RBY' },
    { name: 'Klang',         code: 'KLG' },
    { name: 'Shah Alam',     code: 'SHA' },
    { name: 'Setia Alam',    code: 'SA'  },
    { name: 'Denai Alam',    code: 'DA'  },
    { name: 'Eco Grandeur',  code: 'EGR' },
    { name: 'Subang Taipan', code: 'ST'  },
  ],
  B: [
    { name: 'Danau Kota',             code: 'DK'   },
    { name: 'Kota Damansara',         code: 'KD'   },
    { name: 'Ampang',                 code: 'AMP'  },
    { name: 'Sri Petaling',           code: 'SP'   },
    { name: 'Bandar Tun Hussein Onn', code: 'BTHO' },
    { name: 'Kajang TTDI Groove',     code: 'KTG'  },
    { name: 'Taman Sri Gombak',       code: 'TSG'  },
  ],
  C: [
    { name: 'Putrajaya',             code: 'PJY' },
    { name: 'Kota Warisan',          code: 'KW'  },
    { name: 'Bandar Baru Bangi',     code: 'BBB' },
    { name: 'Cyberjaya',             code: 'CJY' },
    { name: 'Bandar Seri Putra',     code: 'BSP' },
    { name: 'Dataran Puchong Utama', code: 'DPU' },
    { name: 'Online',                code: 'ONL' },
  ],
};

export const BRANCH_META = Object.entries(REGIONS).reduce((acc, [region, branches]) => {
  branches.forEach(b => { acc[b.name] = { code: b.code, region }; });
  return acc;
}, {});

export const ALL_BRANCHES = Object.values(REGIONS).flat().map(b => b.name);

export const DAYS = [
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export const EMPTY_FORM = {
  branch: '', week_date: '',
  wed_absent: '', wed_attended: '', wed_frozen: '', wed_replaced: '',
  thu_absent: '', thu_attended: '', thu_frozen: '', thu_replaced: '',
  fri_absent: '', fri_attended: '', fri_frozen: '', fri_replaced: '',
  sat_absent: '', sat_attended: '', sat_frozen: '', sat_replaced: '',
  sun_absent: '', sun_attended: '', sun_frozen: '', sun_replaced: '',
  not_enrolled: '', outstanding_invoice_disc: '',
  expired_package: '', newly_enrolled: '',
  pc_meetup_invited: '', pc_meetup_showup: '',
  partially_paid_unpaid: '', active_students: '',
  total_onl_attendance: '',
};

export const CHART_COLORS = {
  Attended: '#00a859',
  Absent:   '#e1251b',
  Frozen:   '#0ea5e9',
  Replaced: '#f59e0b',
  Line:     '#00a859',
};
