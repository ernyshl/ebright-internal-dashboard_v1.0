export const TV_VIEWS = [
  {
    key: 'branch-ranking',
    label: 'Branch Ranking',
    type: 'internal',
    path: '/branch-ranking',
  },
  {
    key: 'event-dashboard',
    label: 'Event Dashboard',
    type: 'internal',
    path: '/events',
  },
  {
    key: 'branch-distribution',
    label: 'Branch Distribution',
    type: 'internal',
    path: '/branch-distribution',
  },
  {
    key: 'marketing-performance',
    label: 'Marketing Performance',
    type: 'internal',
    path: '/marketing-performance',
  },
  {
    key: 'executive-summary',
    label: 'Executive Summary',
    type: 'internal',
    path: '/executive-summary',
  },
  {
    key: 'looker-1',
    label: 'Looker Studio 1',
    type: 'iframe',
    url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_rzbux1co0d',
  },
  {
    key: 'looker-2',
    label: 'Looker Studio 2',
    type: 'iframe',
    url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_7ocip3dd2d',
  },
  {
    key: 'gdoc',
    label: 'Google Doc',
    type: 'iframe',
    url: 'https://docs.google.com/document/d/1A6O7ThKnu0wcqTopgjMjvnujoroxeSIRA5tFFER5mLk/preview',
  },
  {
    key: 'leads-dashboard',
    label: 'Leads Dashboard (CT to NL)',
    type: 'internal',
    path: '/leads-dashboard',
  },
  {
    key: 'leads-centre',
    label: 'Leads Centre',
    type: 'internal',
    path: '/leads-centre',
  },
  {
    key: 'ghl-dashboard',
    label: 'GHL Dashboard',
    type: 'internal',
    path: '/ghl-dashboard',
  },
  {
    key: 'ghl-lead-centre',
    label: 'GHL Lead Centre',
    type: 'internal',
    path: '/ghl-lead-centre',
  },
  {
    key: 'platform-breakdown',
    label: 'Enrolment by Platform',
    type: 'internal',
    path: '/platform-breakdown',
  },
  {
    key: 'finance',
    label: 'Finance Dashboard',
    type: 'internal',
    path: '/finance',
  },
  {
    key: 'hr-onb-ofb',
    label: 'ONB/OFB Dashboard',
    type: 'internal',
    path: '/hr-onb-ofb',
  },
  {
    key: 'looker-3',
    label: 'Looker Studio (Yesterday)',
    type: 'iframe',
    url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_ulmzo6co0d',
  },
];

export function getView(key) {
  return TV_VIEWS.find(v => v.key === key) || null;
}
