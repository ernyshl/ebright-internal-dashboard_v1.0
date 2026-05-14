export const REGIONS = {
  A: [
    { name: 'Rimbayu',              code: 'RBY', num: 17 },
    { name: 'Tropicana Sungai Buloh', code: 'TSB', num: 22 },
    { name: 'Klang',         code: 'KLG', num:  9 },
    { name: 'Shah Alam',     code: 'SHA', num: 13 },
    { name: 'Setia Alam',    code: 'SA',  num:  3 },
    { name: 'Denai Alam',    code: 'DA',  num: 10 },
    { name: 'Eco Grandeur',  code: 'EGR', num: 15 },
    { name: 'Subang Taipan', code: 'ST',  num:  2 },
  ],
  B: [
    { name: 'Danau Kota',             code: 'DK',   num: 12 },
    { name: 'Kota Damansara',         code: 'KD',   num:  5 },
    { name: 'Ampang',                 code: 'AMP',  num:  7 },
    { name: 'Sri Petaling',           code: 'SP',   num:  4 },
    { name: 'Bandar Tun Hussein Onn', code: 'BTHO', num: 14 },
    { name: 'Kajang TTDI Groove',     code: 'KTG',  num: 20 },
    { name: 'Taman Sri Gombak',       code: 'TSG',  num: 18 },
    { name: 'Puncak Jalil',           code: 'PJL',  num: 23 },
  ],
  C: [
    { name: 'Putrajaya',             code: 'PJY', num:  6 },
    { name: 'Kota Warisan',          code: 'KW',  num: 19 },
    { name: 'Bandar Baru Bangi',     code: 'BBB', num: 11 },
    { name: 'Cyberjaya',             code: 'CJY', num:  8 },
    { name: 'Bandar Seri Putra',     code: 'BSP', num: 16 },
    { name: 'Dataran Puchong Utama', code: 'DPU', num: 21 },
    { name: 'Online',                code: 'ONL', num:  1 },
  ],
};

export const BRANCH_META = Object.entries(REGIONS).reduce((acc, [region, branches]) => {
  branches.forEach(b => { acc[b.name] = { code: b.code, region, num: b.num }; });
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
  frozen_student_names: '',
  attended_student_names: '',
  absent_student_names: '',
  replaced_student_names: '',
  student_roster_raw: '',
};

export const CHART_COLORS = {
  Attended: '#00a859',
  Absent:   '#e1251b',
  Frozen:   '#0ea5e9',
  Replaced: '#f59e0b',
  Line:     '#00a859',
};
