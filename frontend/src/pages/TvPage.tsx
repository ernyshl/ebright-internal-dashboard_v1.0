import { useEffect, useState, useRef } from 'react';
import { setToken } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { getView } from '../lib/tvViews';

// Internal page components rendered in TV mode
import { BranchRankingPage } from './BranchRankingPage';
import { EventDashboardPage } from './EventDashboardPage';
import { LeadsBreakdownPage } from './LeadsBreakdownPage';
import { MarketingPerformancePage } from './MarketingPerformancePage';
import { ExecutiveSummaryPage } from './ExecutiveSummaryPage';
import { LeadsDashboardPage } from './LeadsDashboardPage';
import { LeadsCentrePage } from './LeadsCentrePage';
import { GhlDashboardPage } from './GhlDashboardPage';
import { GhlLeadsCentrePage } from './GhlLeadsCentrePage';
import { PlatformBreakdownPage } from './PlatformBreakdownPage';
import { HrOnbOfbDashboardPage } from './HrOnbOfbDashboardPage';
import { FaDashboardPage } from './FaDashboardPage';
import { EventMktDashboardPage } from './EventMktDashboardPage';

const INTERNAL_COMPONENTS = {
  'branch-ranking':        BranchRankingPage,
  'event-dashboard':       EventDashboardPage,
  'branch-distribution':   LeadsBreakdownPage,
  'marketing-performance': MarketingPerformancePage,
  'executive-summary':     ExecutiveSummaryPage,
  'leads-dashboard':       LeadsDashboardPage,
  'leads-centre':          LeadsCentrePage,
  'ghl-dashboard':         GhlDashboardPage,
  'ghl-lead-centre':       GhlLeadsCentrePage,
  'platform-breakdown':    PlatformBreakdownPage,
  'hr-onb-ofb':            HrOnbOfbDashboardPage,
  'fa-dashboard':          FaDashboardPage,
  'event-mkt-dashboard':   EventMktDashboardPage,
};

// Schedule a reload at the next 3:00 AM
function scheduleReloadAt3am() {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  const ms = next3am.getTime() - now.getTime();
  return setTimeout(() => window.location.reload(), ms);
}

export function TvPage() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [viewKey, setViewKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const keepaliveRef = useRef(null);
  const reloadRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');

    if (!key) {
      setErrorMsg('No device key provided. Use /tv?key=YOUR_DEVICE_KEY');
      setStatus('error');
      return;
    }

    apiFetch(`/api/auth/device?key=${encodeURIComponent(key)}`, { json: false })
      .then(data => {
        setToken(data.token);
        setViewKey(data.viewKey);
        setStatus('ready');

        // Keepalive: re-exchange key every 60 minutes to refresh last_seen
        keepaliveRef.current = setInterval(() => {
          apiFetch(`/api/auth/device?key=${encodeURIComponent(key)}`, { json: false })
            .then(d => setToken(d.token))
            .catch(() => {});
        }, 60 * 60 * 1000);

        // Auto-reload at 3 AM
        reloadRef.current = scheduleReloadAt3am();
      })
      .catch(err => {
        setErrorMsg(err.message || 'Device authentication failed');
        setStatus('error');
      });

    return () => {
      clearInterval(keepaliveRef.current);
      clearTimeout(reloadRef.current);
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="tvLoadingScreen">
        <div className="loadingDots"><span /><span /><span /></div>
        <p>Authenticating TV…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="tvErrorScreen">
        <div className="tvErrorIcon">⚠️</div>
        <p>{errorMsg}</p>
      </div>
    );
  }

  const view = getView(viewKey);

  if (!view) {
    return (
      <div className="tvErrorScreen">
        <div className="tvErrorIcon">⚠️</div>
        <p>Unknown view key: <strong>{viewKey}</strong></p>
      </div>
    );
  }

  if (view.type === 'iframe') {
    return (
      <div className="tvIframeWrap">
        <iframe
          src={view.url}
          title={view.label}
          className="tvIframe"
          allowFullScreen
          frameBorder="0"
        />
      </div>
    );
  }

  // Internal view — render component directly (no RequireAuth/RequirePermission)
  const PageComponent = INTERNAL_COMPONENTS[view.key];
  if (!PageComponent) {
    return (
      <div className="tvErrorScreen">
        <p>Internal view not mapped: {view.key}</p>
      </div>
    );
  }

  return (
    <div className="tvInternalWrap">
      <PageComponent />
    </div>
  );
}
