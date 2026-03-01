function fmtRM(n) {
  const x = Number(n || 0);
  return `RM ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n) {
  const x = Number(n || 0);
  return Math.round(x).toLocaleString();
}

function cell(d, isGoogleChannel = false, label = '') {
  if (!d) return <span className="muted">—</span>;
  
  // For Online channel and Google, we only show Conversions
  const isOnlineOrGoogle = isGoogleChannel || label.toLowerCase().includes('online');

  if (isOnlineOrGoogle) {
    return (
      <div style={{ lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtRM(d.spend)}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {fmtNum(d.convs || d.leads || 0)} Conv · <span style={{ color: 'var(--info)' }}>RM {Number(d.cpc || d.cpl || 0).toFixed(2)}</span> CPC
        </div>
      </div>
    );
  }

  return (
    <div style={{ lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtRM(d.spend)}</div>
      {d.leads > 0 && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          {fmtNum(d.leads)} Leads · <span style={{ color: 'var(--brand)' }}>RM {Number(d.cpl || 0).toFixed(2)}</span> CPL
        </div>
      )}
      {d.convs > 0 && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          {fmtNum(d.convs)} Conv · <span style={{ color: 'var(--info)' }}>RM {Number(d.cpc || 0).toFixed(2)}</span> CPC
        </div>
      )}
      {d.leads === 0 && d.convs === 0 && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          0 Leads · RM 0.00 CPL
        </div>
      )}
    </div>
  );
}

export function MarketingTable({ title, rows }) {
  return (
    <div>
      <div style={{
        padding: '14px 18px',
        fontWeight: 700,
        fontSize: 14,
        borderBottom: '1px solid var(--border)',
        background: 'var(--tableHeaderBg)',
        color: 'var(--text)',
      }}>
        {title}
      </div>
      <div className="tableWrap" style={{ border: 'none', borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Today</th>
              <th>Yesterday</th>
              <th>Last 7 Days</th>
              <th>Last 30 Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                style={r.isTotal ? {
                  background: 'var(--brandLight)',
                  fontWeight: 700,
                  borderTop: '2px solid var(--border)',
                } : undefined}
              >
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.label}</td>
                <td>{cell(r.today, r.isGoogle, r.label)}</td>
                <td>{cell(r.yesterday, r.isGoogle, r.label)}</td>
                <td>{cell(r.d7, r.isGoogle, r.label)}</td>
                <td>{cell(r.d30, r.isGoogle, r.label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

