import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const DATE_PRESETS = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: 'this_week',  label: 'This Week' },
  { value: 'last_week',  label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30',    label: 'Last 30 Days' },
  { value: 'this_year',  label: 'This Year' },
  { value: 'last_year',  label: 'Last Year' },
];

function fmt(d) { return d.toISOString().split('T')[0]; }

function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay(); // 0=Sun
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  switch (preset) {
    case 'today':
      return { date_from: fmt(today), date_to: fmt(today) };
    case 'yesterday': {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      return { date_from: fmt(d), date_to: fmt(d) };
    }
    case 'this_week': {
      const mon = new Date(today); mon.setDate(today.getDate() + daysToMonday);
      return { date_from: fmt(mon), date_to: fmt(today) };
    }
    case 'last_week': {
      const thisMon = new Date(today); thisMon.setDate(today.getDate() + daysToMonday);
      const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
      return { date_from: fmt(lastMon), date_to: fmt(lastSun) };
    }
    case 'this_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { date_from: fmt(first), date_to: fmt(today) };
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      return { date_from: fmt(first), date_to: fmt(last) };
    }
    case 'last_30': {
      const d = new Date(today); d.setDate(d.getDate() - 30);
      return { date_from: fmt(d), date_to: fmt(today) };
    }
    case 'this_year': {
      const first = new Date(today.getFullYear(), 0, 1);
      return { date_from: fmt(first), date_to: fmt(today) };
    }
    case 'last_year': {
      const first = new Date(today.getFullYear() - 1, 0, 1);
      const last  = new Date(today.getFullYear() - 1, 11, 31);
      return { date_from: fmt(first), date_to: fmt(last) };
    }
    default:
      return { date_from: '', date_to: '' };
  }
}

export function LeadsCentrePage() {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    lead_source: searchParams.get('lead_source') || '',
    region: searchParams.get('region') || '',
    branch: searchParams.get('branch') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
  });
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [datePreset, setDatePreset] = useState('');

  // Debounce search
  const handleSearchChange = useCallback((value) => {
    setFilters(f => ({ ...f, search: value }));
    const timeout = setTimeout(() => setDebouncedSearch(value), 400);
    return () => clearTimeout(timeout);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leads-centre', { ...filters, search: debouncedSearch, page }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        ...Object.fromEntries(
          Object.entries({ ...filters, search: debouncedSearch }).filter(([, v]) => v)
        ),
      });
      return await apiFetch(`/api/leads-centre?${params}`);
    },
    retry: 1,
    staleTime: 0, // Always fetch fresh data when filters change
    refetchOnWindowFocus: true,
  });

  const handleFilterChange = (key, value) => {
    setFilters(f => ({
      ...f,
      [key]: value,
      ...(key === 'region' ? { branch: '' } : {})
    }));
    // Clear preset when dates are manually changed
    if (key === 'date_from' || key === 'date_to') setDatePreset('');
    setPage(1);
  };

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const range = getDateRange(preset);
    setFilters(f => ({ ...f, ...range }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: '', lead_source: '', region: '', branch: '', date_from: '', date_to: '' });
    setDebouncedSearch('');
    setDatePreset('');
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || debouncedSearch;

  if (isLoading && !data) {
    return (
      <div className="dashboardPage">
        <div className="pageHeader" style={{ justifyContent: 'center', alignItems: 'center', height: '100%', borderBottom: 'none' }}>
          <h1 className="pageHeaderTitle">Leads Centre</h1>
        </div>
        <div className="dashboardContent">
          <div className="loadingState">
            <div className="spinner"></div>
            <p>Loading leads...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboardPage">
        <div className="dashboardHeader">
          <h1 className="pageHeaderTitle">Leads Centre</h1>
        </div>
        <div className="dashboardContent">
          <div className="errorState">
            <p>Error loading leads: {error?.message || 'Unknown error'}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Status: {error?.status || 'N/A'}, Data: {JSON.stringify(error?.data)}
            </p>
            <button className="btn btnPrimary" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Leads Centre</h1>
          <p className="headerSubtitle">
            {data?.total || 0} total leads
            {data?.page && data?.totalPages > 1 && (
              <span> · Page {data.page} of {data.totalPages}</span>
            )}
          </p>
        </div>
        <button className="btn btnSecondary" onClick={() => refetch()}>
          ↻ Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="filterBar">
        <div className="filterRow">
          {/* Search */}
          <div className="filterGroup searchGroup">
            <label>Search</label>
            <div className="searchInputWrapper">
              <span className="searchIcon">🔍</span>
              <input
                type="text"
                placeholder="Name, email, phone..."
                value={filters.search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="filterInput searchInput"
              />
            </div>
          </div>

          {/* Lead Source */}
          <div className="filterGroup">
            <label>Lead Source</label>
            <select
              value={filters.lead_source}
              onChange={(e) => handleFilterChange('lead_source', e.target.value)}
              className="filterSelect"
            >
              <option value="">All Sources</option>
              {data?.filters?.lead_sources?.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>

          {/* Region */}
          <div className="filterGroup">
            <label>Region</label>
            <select
              value={filters.region}
              onChange={(e) => handleFilterChange('region', e.target.value)}
              className="filterSelect"
            >
              <option value="">All Regions</option>
              {data?.filters?.regions?.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          {/* Branch */}
          <div className="filterGroup">
            <label>Branch</label>
            <select
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className="filterSelect"
            >
              <option value="">All Branches</option>
              {data?.filters?.branches?.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>

          {/* Date Preset */}
          <div className="filterGroup">
            <label>Date Period</label>
            <select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="filterSelect"
            >
              <option value="">Custom Range</option>
              {DATE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="filterGroup dateGroup">
            <label>Date From</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              className="filterInput"
            />
          </div>

          <div className="filterGroup dateGroup">
            <label>Date To</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              className="filterInput"
            />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button className="btn btnGhost clearFiltersBtn" onClick={clearFilters}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="dashboardContent">
        {data?.leads?.length === 0 ? (
          <div className="emptyState">
            <div className="emptyIcon">📭</div>
            <h3>No leads found</h3>
            <p>Try adjusting your filters or search terms</p>
            {hasActiveFilters && (
              <button className="btn btnSecondary" onClick={clearFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="tableContainer" style={{ overflowX: 'auto' }}>
              <table className="dataTable leadsTable">
                <thead>
                  <tr>
                    <th className="sticky-col">Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Region</th>
                    <th>Branch</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.leads?.map((lead, index) => (
                    <tr key={index}>
                      <td className="sticky-col nameCol">
                        <div className="leadName">
                          {lead.name || lead.full_name || lead.customer_name || lead.lead_name || lead.person_name || '-'}
                        </div>
                        {lead.notes && (
                          <div className="leadNotes" title={lead.notes}>
                            {String(lead.notes).length > 50 ? String(lead.notes).slice(0, 50) + '...' : lead.notes}
                          </div>
                        )}
                      </td>
                      <td>
                        <a href={`mailto:${lead.email}`} className="leadEmail">
                          {lead.email || '-'}
                        </a>
                      </td>
                      <td>
                        {lead.phone || lead.phone_number || lead.mobile || lead.contact_number || lead.telephone ? (
                          <a href={`tel:${lead.phone || lead.phone_number || lead.mobile || lead.contact_number || lead.telephone}`} className="leadPhone">
                            {lead.phone || lead.phone_number || lead.mobile || lead.contact_number || lead.telephone || '-'}
                          </a>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`badge badgeSource ${lead.lead_source?.toLowerCase().replace(/\s+/g, '-')}`}>
                          {lead.lead_source || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="regionBadge">
                          {lead.region || (lead.clean_branch?.includes('Online') ? 'Region 3' :
                            lead.clean_branch ? 'Region 2' : '-')}
                        </span>
                      </td>
                      <td>
                        <span className="branchText">
                          {lead.clean_branch || '-'}
                        </span>
                      </td>
                      <td className="dateCol">
                        {lead.submitted_at ? (
                          <div>
                            <div className="dateMain">
                              {new Date(lead.submitted_at).toLocaleDateString()}
                            </div>
                            <div className="dateTime">
                              {new Date(lead.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data?.totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btnGhost"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <div className="pageInfo">
                  Page {data.page} of {data.totalPages}
                </div>
                <button
                  className="btn btnGhost"
                  disabled={page === data.totalPages}
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}