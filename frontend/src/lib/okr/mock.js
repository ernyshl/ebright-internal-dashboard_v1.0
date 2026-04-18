import { ALL_BRANCHES } from './constants';
import { n } from './utils';

export const USE_MOCK = true;
export const MOCK_WEEK = '2026-04-09';

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function makeMockRecord(branch, seed) {
  const rng = lcg(seed * 999 + 7);
  const r = (min, max) => Math.round(min + rng() * (max - min));
  const profile = seed % 3;
  const attBase = profile === 0 ? [18, 24] : profile === 1 ? [12, 18] : [6, 13];
  const absBase = profile === 0 ? [1, 4]   : profile === 1 ? [3, 7]   : [6, 12];
  
  // Generate daily attendance
  const wed_absent = r(0, 2);
  const wed_attended = r(0, 4);
  const wed_frozen = r(0, 1);
  const wed_replaced = r(0, 1);
  
  const thu_absent = r(0, 2);
  const thu_attended = r(0, 4);
  const thu_frozen = r(0, 1);
  const thu_replaced = r(0, 1);
  
  const fri_absent = r(absBase[0]-1, absBase[1]-1);
  const fri_attended = r(attBase[0]-4, attBase[1]-4);
  const fri_frozen = r(0, 2);
  const fri_replaced = r(0, 2);
  
  const sat_absent = r(absBase[0], absBase[1]+2);
  const sat_attended = r(attBase[0]+4, attBase[1]+8);
  const sat_frozen = r(1, 3);
  const sat_replaced = r(2, 5);
  
  const sun_absent = r(absBase[0]-1, absBase[1]+1);
  const sun_attended = r(attBase[0], attBase[1]+4);
  const sun_frozen = r(1, 3);
  const sun_replaced = r(1, 4);
  
  // Calculate total_onl_attendance to match daily sum
  const total_onl_attendance = 
    wed_attended + wed_absent + wed_frozen + wed_replaced +
    thu_attended + thu_absent + thu_frozen + thu_replaced +
    fri_attended + fri_absent + fri_frozen + fri_replaced +
    sat_attended + sat_absent + sat_frozen + sat_replaced +
    sun_attended + sun_absent + sun_frozen + sun_replaced;
  
  return {
    id: seed, branch, week_date: MOCK_WEEK,
    total_online_attendance: r(400, 650), online_conversion_rate: r(18, 45),
    avg_online_trial_pax: r(2, 7), total_onl_attendance,
    wed_absent, wed_attended, wed_frozen, wed_replaced,
    thu_absent, thu_attended, thu_frozen, thu_replaced,
    fri_absent, fri_attended, fri_frozen, fri_replaced,
    sat_absent, sat_attended, sat_frozen, sat_replaced,
    sun_absent, sun_attended, sun_frozen, sun_replaced,
    not_enrolled: r(5, 18), outstanding_invoice_disc: r(15, 35),
    expired_package: r(6, 18), newly_enrolled: r(2, 10),
    pc_meetup_invited: r(8, 25), pc_meetup_showup: r(4, 18),
    outstanding_invoice_pct: parseFloat((r(8, 32) + rng() * 2).toFixed(2)),
    partially_paid_unpaid: r(12, 40), active_students: r(130, 220),
  };
}

export const MOCK_RECORDS = ALL_BRANCHES.map((b, i) => makeMockRecord(b, i + 1));

export function getMockWeekRecords(week_date, shiftSeed = 1) {
  return ALL_BRANCHES.map((_b, i) => {
    const base = MOCK_RECORDS[i];
    const rng = lcg((i + 1) * 997 + shiftSeed * 41);
    const vary = (val, range) => Math.max(0, Math.round(n(val) + (rng() - 0.5) * range));
    
    // Vary daily attendance
    const wed_attended = vary(base.wed_attended, 2);
    const wed_absent = vary(base.wed_absent, 1);
    const wed_frozen = base.wed_frozen;
    const wed_replaced = base.wed_replaced;
    
    const thu_attended = vary(base.thu_attended, 4);
    const thu_absent = vary(base.thu_absent, 3);
    const thu_frozen = base.thu_frozen;
    const thu_replaced = base.thu_replaced;
    
    const fri_attended = vary(base.fri_attended, 6);
    const fri_absent = vary(base.fri_absent, 4);
    const fri_frozen = base.fri_frozen;
    const fri_replaced = base.fri_replaced;
    
    const sat_attended = vary(base.sat_attended, 8);
    const sat_absent = vary(base.sat_absent, 5);
    const sat_frozen = base.sat_frozen;
    const sat_replaced = base.sat_replaced;
    
    const sun_attended = vary(base.sun_attended, 6);
    const sun_absent = vary(base.sun_absent, 4);
    const sun_frozen = base.sun_frozen;
    const sun_replaced = base.sun_replaced;
    
    // Calculate total_onl_attendance from daily totals
    const total_onl_attendance = 
      wed_attended + wed_absent + wed_frozen + wed_replaced +
      thu_attended + thu_absent + thu_frozen + thu_replaced +
      fri_attended + fri_absent + fri_frozen + fri_replaced +
      sat_attended + sat_absent + sat_frozen + sat_replaced +
      sun_attended + sun_absent + sun_frozen + sun_replaced;
    
    return {
      ...base,
      id: base.id + shiftSeed * 100,
      week_date,
      wed_attended, wed_absent, wed_frozen, wed_replaced,
      thu_attended, thu_absent, thu_frozen, thu_replaced,
      fri_attended, fri_absent, fri_frozen, fri_replaced,
      sat_attended, sat_absent, sat_frozen, sat_replaced,
      sun_attended, sun_absent, sun_frozen, sun_replaced,
      total_onl_attendance,
      active_students: vary(base.active_students, 5),
      outstanding_invoice_pct: parseFloat(Math.max(0, n(base.outstanding_invoice_pct) + (rng() - 0.5) * 4).toFixed(2)),
      pc_meetup_invited: vary(base.pc_meetup_invited, 4),
      pc_meetup_showup: vary(base.pc_meetup_showup, 4),
    };
  });
}
