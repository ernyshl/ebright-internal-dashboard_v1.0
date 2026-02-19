import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

export function LeadsCentrePage() {
  const [filters, setFilters] = useState({
    search: '',
    lead_source: '',
    region: '',
    branch: '',
    date_from: '',
    date_to: '',
  });
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

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
      console.log('Fetching leads with params:', params.toString());
      const result = await apiFetch(`/api/leads-centre?${params}`);
      console.log('Leads fetched successfully:', result);
      return result;
    },
    retry: 1,
    staleTime: 30000,
  });

  const handleFilterChange = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      lead_source: '',
      region: '',
      branch: '',
      date_from: '',
      date_to: '',
    });
    setDebouncedSearch('');
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || debouncedSearch;

  if (isLoading && !data) {
    return (
      <div className="dashboardPage">
        <div className="dashboardHeader">
          <h1>Leads Centre</h1>
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
          <h1>Leads Centre</h1>
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
          <h1>Leads Centre</h1>
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
              <option value="Region 2">Region 2 (Unspecified)</option>
              <option value="Region 3">Region 3 (Online)</option>
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
                    <th>Status</th>
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
                          {lead.region || lead.clean_branch?.includes('Online') ? 'Region 3' : 
                           lead.clean_branch ? 'Region 2' : 
                           lead.region || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="branchText">
                          {lead.clean_branch || '-'}
                        </span>
                      </td>
                      <td>
                        <span className={`statusBadge ${lead.status?.toLowerCase() || 'unknown'}`}>
                          {lead.status || 'Pending'}
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