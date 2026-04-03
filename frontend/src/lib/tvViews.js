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
];

export function getView(key) {
  return TV_VIEWS.find(v => v.key === key) || null;
}
