// Single source of truth for dashboard registry and per-role default
// access. Imported by both routes/permissions.js (to serve the user
// permissions API) and middleware/dashboards.js (to gate routes).
//
// To grant a card to a role by default: append the card id to the
// matching role's array. To register a brand-new card: add it to
// DASHBOARDS, then add the id to whichever roles should see it by
// default (super_admin always gets all of them automatically).

const DASHBOARDS = [
  { id: 'operations_dept', name: 'Operations Department',           icon: '⚙️' },
  { id: 'academy',         name: 'Academy',                         icon: '🎓' },
  { id: 'fa_testing',      name: 'FA Dashboard Testing',            icon: '🧪' },
  { id: 'event_mkt',       name: 'Event MKT',                       icon: '🎪' },
  { id: 'finance',         name: 'Finance',                         icon: '💰' },
  { id: 'operations',      name: 'Optimisation',                    icon: '⚙️' },
  { id: 'marketing',       name: 'Marketing',                       icon: '📈' },
  { id: 'department',      name: 'Department',                      icon: '✅' },
  { id: 'hr',              name: 'HR',                              icon: '👥' },
  { id: 'hr_db',           name: 'HR Database',                     icon: '🗄️' },
  { id: 'hr_crud',         name: 'CRUD HR Data',                    icon: '📋' },
  { id: 'hr_testing',      name: 'HR Testing Data',                 icon: '🧪' },
  { id: 'student_db',      name: 'Student Database',                icon: '📚' },
  { id: 'admin',           name: 'Admin',                           icon: '🔧' },
  { id: 'testing',         name: 'Testing (dnft)',                  icon: '🧪' },
  { id: 'manjeet',         name: 'For Manjeet',                     icon: '🎯' },
  { id: 'rm_dashboard',    name: 'For Regional Manager',            icon: '📊' },
  { id: 'events',          name: 'Events',                          icon: '🎪' },
];

const ROLE_DEFAULTS = {
  super_admin: DASHBOARDS.map(d => d.id),
  ceo:         DASHBOARDS.map(d => d.id).filter(id => id !== 'admin'),
  rm:          ['operations_dept', 'operations', 'academy', 'rm_dashboard'],
  marketing:   ['marketing', 'academy', 'event_mkt'],
  od:          ['operations_dept', 'operations', 'academy'],
  hr:          ['department', 'hr', 'hr_db', 'hr_crud', 'hr_testing'],
  academy:     ['academy', 'fa_testing', 'events', 'event_mkt'],
  finance:     ['finance'],
};

module.exports = { DASHBOARDS, ROLE_DEFAULTS };
