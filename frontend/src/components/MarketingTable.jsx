function fmtRM(n) {
  const x = Number(n || 0);
  return `RM ${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n) {
  const x = Number(n || 0);
  return Math.round(x).toLocaleString();
}

function cell(d, isGoogleChannel = false) {
  if (!d) return <span className="muted">—</span>;
  const metricLabel = isGoogleChannel ? 'Conv' : 'Leads';

  return (
    <div style={{ lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtRM(d.spend)}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {fmtNum(d.leads || d.convs || 0)} {metricLabel} · <span style={{ color: 'var(--brand)' }}>RM {Number(d.cpl || 0).toFixed(2)}</span> CPL
      </div>
      {!isGoogleChannel && d.convs > 0 && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          {fmtNum(d.convs)} Conv · <span style={{ color: 'var(--info)' }}>RM {Number(d.cpc || 0).toFixed(2)}</span> CPC
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
                <td>{cell(r.today, r.isGoogle)}</td>
                <td>{cell(r.yesterday, r.isGoogle)}</td>
                <td>{cell(r.d7, r.isGoogle)}</td>
                <td>{cell(r.d30, r.isGoogle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

