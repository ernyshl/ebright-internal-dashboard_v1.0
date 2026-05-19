import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

// ── Flow diagram ──────────────────────────────────────────────────────────────

type NodeType = 'source' | 'table' | 'view' | 'output';
type FlowNode = { id: string; label: string; sublabel?: string; type: NodeType };
type FlowEdge = { from: string; to: string };
type FlowGroup = { title: string; color: string; nodes: FlowNode[]; edges: FlowEdge[] };

const FLOW_GROUPS: FlowGroup[] = [
  {
    title: 'Leads', color: '#4f46e5',
    nodes: [
      { id: 'meta_api',      label: 'Meta Ads API',              type: 'source' },
      { id: 'meta_webhook',  label: 'Meta Webhook',              type: 'source' },
      { id: 'tiktok_api',   label: 'TikTok API',               type: 'source' },
      { id: 'wix_api',      label: 'Wix Form API',             type: 'source' },
      { id: 'roadshow_csv', label: 'Roadshow CSV',             type: 'source' },
      { id: 'pub_meta',     label: 'public.meta_leads',         sublabel: 'Full API data — 9,465 rows', type: 'table' },
      { id: 'crm_meta',     label: 'crm.meta_leads',           sublabel: 'Webhook only (fewer rows)',   type: 'table' },
      { id: 'crm_tt',       label: 'crm.social_posts',         sublabel: 'TikTok leads (authoritative)',type: 'table' },
      { id: 'pub_wix',      label: 'public.raw_wix_leads',      sublabel: 'Wix form submissions',       type: 'table' },
      { id: 'pub_rds',      label: 'public.raw_roadshow_leads', type: 'table' },
      { id: 'view_mlpbi',   label: 'crm.master_leads_powerbi',  sublabel: 'VIEW — UNION ALL, analytics',type: 'view' },
      { id: 'pub_mlb',      label: 'public.master_leads_base',  sublabel: 'Flat CRM table, 1-min refresh',type: 'table' },
    ],
    edges: [
      { from: 'meta_api',     to: 'pub_meta' },   { from: 'meta_webhook', to: 'crm_meta' },
      { from: 'tiktok_api',  to: 'crm_tt' },     { from: 'wix_api',     to: 'pub_wix' },
      { from: 'roadshow_csv',to: 'pub_rds' },    { from: 'pub_meta',    to: 'view_mlpbi' },
      { from: 'crm_tt',      to: 'view_mlpbi' }, { from: 'pub_wix',     to: 'view_mlpbi' },
      { from: 'pub_rds',     to: 'view_mlpbi' }, { from: 'view_mlpbi',  to: 'pub_mlb' },
    ],
  },
  {
    title: 'Finance', color: '#059669',
    nodes: [
      { id: 'ac_src',     label: 'Autocount ERP',                type: 'source' },
      { id: 'ac_raw',     label: 'public.autocount_raw',          sublabel: '350 MB — raw import', type: 'table' },
      { id: 'ac_inv_pub', label: 'public.autocount_invoices',     sublabel: '37 MB',               type: 'table' },
      { id: 'ac_inv_crm', label: 'crm.autocount_invoices',        sublabel: '29 MB',               type: 'table' },
      { id: 'fin_pub',    label: 'public.finance_renewals',       type: 'table' },
      { id: 'fin_crm',    label: 'crm.finance_renewals',          type: 'table' },
      { id: 'fin_branch', label: 'public.finance_renewal_by_branch', sublabel: 'Materialized view', type: 'view' },
    ],
    edges: [
      { from: 'ac_src',     to: 'ac_raw' },     { from: 'ac_raw',    to: 'ac_inv_pub' },
      { from: 'ac_raw',     to: 'ac_inv_crm' }, { from: 'ac_inv_pub',to: 'fin_pub' },
      { from: 'ac_inv_crm', to: 'fin_crm' },    { from: 'fin_pub',   to: 'fin_branch' },
    ],
  },
  {
    title: 'GHL (Go High Level)', color: '#d97706',
    nodes: [
      { id: 'ghl_wh',    label: 'GHL Webhook',              type: 'source' },
      { id: 'ghl_pub',   label: 'public.ghl_webhook_log',   type: 'table' },
      { id: 'ghl_crm',   label: 'crm.ghl_webhook_log',      type: 'table' },
      { id: 'ghl_stage', label: 'public.ghl_stages',        sublabel: '12 MB', type: 'table' },
      { id: 'crm_con',   label: 'crm.crm_contact',          type: 'table' },
      { id: 'crm_opp',   label: 'crm.crm_opportunity',      type: 'table' },
      { id: 'crm_pipe',  label: 'crm.pipeline_state',       type: 'table' },
    ],
    edges: [
      { from: 'ghl_wh',  to: 'ghl_pub' },  { from: 'ghl_wh',  to: 'ghl_crm' },
      { from: 'ghl_pub', to: 'ghl_stage' },{ from: 'ghl_crm', to: 'crm_con' },
      { from: 'ghl_crm', to: 'crm_opp' },  { from: 'ghl_crm', to: 'crm_pipe' },
    ],
  },
  {
    title: 'HR', color: '#7c3aed',
    nodes: [
      { id: 'hr_manual',   label: 'Manual / CSV',                  type: 'source' },
      { id: 'hik_device',  label: 'Hikvision Device',              type: 'source' },
      { id: 'hr_al',       label: 'public.hr_annual_leave',        type: 'table' },
      { id: 'hr_mc',       label: 'public.hr_mc',                  type: 'table' },
      { id: 'hr_staff_mov',label: 'public.hr_staff_movements',     type: 'table' },
      { id: 'hik_log',     label: 'public.hik_attendance_log',     type: 'table' },
      { id: 'okr_att',     label: 'public.branch_okr_attendance',  sublabel: 'Derived from Hikvision', type: 'table' },
    ],
    edges: [
      { from: 'hr_manual',  to: 'hr_al' },    { from: 'hr_manual',  to: 'hr_mc' },
      { from: 'hr_manual',  to: 'hr_staff_mov' },
      { from: 'hik_device', to: 'hik_log' },  { from: 'hik_log',    to: 'okr_att' },
    ],
  },
  {
    title: 'Marketing Spend', color: '#db2777',
    nodes: [
      { id: 'ms_meta',  label: 'Meta Ads API',         type: 'source' },
      { id: 'ms_tt',    label: 'TikTok Ads API',       type: 'source' },
      { id: 'ms_ga',    label: 'Google Ads API',       type: 'source' },
      { id: 'pub_ms',   label: 'public.meta_spend',    type: 'table' },
      { id: 'pub_ts',   label: 'public.tiktok_spend',  type: 'table' },
      { id: 'pub_gs',   label: 'public.google_spend',  type: 'table' },
    ],
    edges: [
      { from: 'ms_meta', to: 'pub_ms' }, { from: 'ms_tt', to: 'pub_ts' }, { from: 'ms_ga', to: 'pub_gs' },
    ],
  },
  {
    title: 'Students / Academy', color: '#0891b2',
    nodes: [
      { id: 'amf',        label: 'AMF System',                  type: 'source' },
      { id: 'st_rec',     label: 'public.studentrecords',       type: 'table' },
      { id: 'st_att',     label: 'public.student_attendance',   type: 'table' },
      { id: 'st_arch',    label: 'public.archived_students',    type: 'table' },
      { id: 'fa_snap',    label: 'FA Snapshots',                sublabel: 'public.fa_snapshots', type: 'output' },
      { id: 'pcm_snap',   label: 'PCM Snapshots',               sublabel: 'public.pcm_snapshots', type: 'output' },
    ],
    edges: [
      { from: 'amf',    to: 'st_rec' }, { from: 'amf',    to: 'st_att' },
      { from: 'st_rec', to: 'st_arch'},{ from: 'st_arch', to: 'fa_snap' }, { from: 'st_arch', to: 'pcm_snap' },
    ],
  },
  {
    title: 'CRM / Salestrail', color: '#65a30d',
    nodes: [
      { id: 'st_src', label: 'Salestrail App',       type: 'source' },
      { id: 'pub_st', label: 'public.salestrail_cr', type: 'table' },
    ],
    edges: [{ from: 'st_src', to: 'pub_st' }],
  },
];

const NODE_STYLES: Record<NodeType, { bg: string; border: string; badge: string }> = {
  source: { bg: '#f9fafb', border: '#d1d5db', badge: 'SOURCE' },
  table:  { bg: '#eff6ff', border: '#bfdbfe', badge: 'TABLE'  },
  view:   { bg: '#fefce8', border: '#fde68a', badge: 'VIEW'   },
  output: { bg: '#f0fdf4', border: '#bbf7d0', badge: 'OUTPUT' },
};

function FlowNode({ node, color }: { node: FlowNode; color: string }) {
  const s = NODE_STYLES[node.type];
  return (
    <div style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 8, padding: '7px 11px', minWidth: 170, maxWidth: 230, flexShrink: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 700, background: color, color: '#fff', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em' }}>{s.badge}</span>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginTop: 3, lineHeight: 1.3 }}>{node.label}</div>
      {node.sublabel && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{node.sublabel}</div>}
    </div>
  );
}

function FlowGroupCard({ group }: { group: FlowGroup }) {
  const nodeMap = new Map(group.nodes.map(n => [n.id, n]));
  const childMap = new Map<string, string[]>();
  const hasParent = new Set(group.edges.map(e => e.to));
  group.edges.forEach(e => { if (!childMap.has(e.from)) childMap.set(e.from, []); childMap.get(e.from)!.push(e.to); });
  const roots = group.nodes.filter(n => !hasParent.has(n.id));

  function renderChain(id: string, visited = new Set<string>()): React.ReactNode {
    if (visited.has(id)) return null;
    visited.add(id);
    const node = nodeMap.get(id); if (!node) return null;
    const children = childMap.get(id) || [];
    return (
      <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <FlowNode node={node} color={group.color} />
          {children.length > 0 && <span style={{ color: '#9ca3af', fontSize: 16, padding: '0 2px' }}>→</span>}
          {children.length === 1 && renderChain(children[0], visited)}
          {children.length > 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children.map(c => renderChain(c, new Set(visited)))}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `2px solid ${group.color}22`, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ background: `${group.color}12`, borderBottom: `2px solid ${group.color}30`, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: group.color }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: group.color }}>{group.title}</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {group.nodes.filter(n => n.type === 'source').length} source → {group.nodes.filter(n => n.type === 'table').length} table{group.nodes.filter(n => n.type === 'view' || n.type === 'output').length > 0 ? ` → ${group.nodes.filter(n => n.type === 'view' || n.type === 'output').length} view/output` : ''}
        </span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflowX: 'auto' }}>
        {roots.map(r => renderChain(r.id))}
      </div>
    </div>
  );
}

// ── Helicopter View ───────────────────────────────────────────────────────────

type HLayer = { id: string; label: string; sub?: string; color: string };
type HPipeline = {
  group: string;
  color: string;
  rows: { sources: string[]; raw: string[]; processed: string[]; pages: string[] }[];
};

const HELI_PIPELINES: HPipeline[] = [
  {
    group: 'Leads', color: '#4f46e5',
    rows: [
      { sources: ['Meta Ads API'],    raw: ['public.meta_leads'],         processed: ['crm.master_leads_powerbi'], pages: ['Leads Breakdown', 'Lead Centre'] },
      { sources: ['Meta Webhook'],    raw: ['crm.meta_leads'],            processed: ['crm.master_leads_powerbi'], pages: [] },
      { sources: ['TikTok API'],      raw: ['crm.social_posts'],          processed: ['crm.master_leads_powerbi'], pages: ['Lead Centre'] },
      { sources: ['Wix Form API'],    raw: ['public.raw_wix_leads'],      processed: ['crm.master_leads_powerbi', 'public.master_leads_base'], pages: ['Lead Centre'] },
      { sources: ['Roadshow CSV'],    raw: ['public.raw_roadshow_leads'], processed: ['crm.master_leads_powerbi'], pages: [] },
    ],
  },
  {
    group: 'Finance', color: '#059669',
    rows: [
      { sources: ['Autocount ERP'], raw: ['public.autocount_raw'], processed: ['public.autocount_invoices', 'crm.autocount_invoices', 'public.finance_renewals', 'crm.finance_renewals', 'public.finance_renewal_by_branch (MAT VIEW)'], pages: ['Finance Renewal by Branch', 'Branch Revenue & Renewals', 'Branch Ranking'] },
    ],
  },
  {
    group: 'GHL', color: '#d97706',
    rows: [
      { sources: ['GHL Webhook'], raw: ['public.ghl_webhook_log', 'crm.ghl_webhook_log'], processed: ['public.ghl_stages', 'crm.crm_contact', 'crm.crm_opportunity', 'crm.pipeline_state'], pages: ['GHL Dashboard (CT→NL)', 'GHL Lead Centre', 'Leads GHL View'] },
    ],
  },
  {
    group: 'HR', color: '#7c3aed',
    rows: [
      { sources: ['Manual / CSV'], raw: ['public.hr_annual_leave', 'public.hr_mc', 'public.hr_staff_movements', 'public.hr_hiring'], processed: [], pages: ['HR Staff List', 'HR Annual Leave', 'HR MC', 'HR Hiring'] },
      { sources: ['Hikvision Device'], raw: ['public.hik_attendance_log'], processed: ['public.branch_okr_attendance'], pages: ['OKR Attendance', 'HR Attendance'] },
    ],
  },
  {
    group: 'Marketing Spend', color: '#db2777',
    rows: [
      { sources: ['Meta Ads API', 'TikTok Ads API', 'Google Ads API'], raw: ['public.meta_spend', 'public.tiktok_spend', 'public.google_spend'], processed: [], pages: ['Marketing Performance', 'Platform Breakdown'] },
    ],
  },
  {
    group: 'Students / Academy', color: '#0891b2',
    rows: [
      { sources: ['AMF System'], raw: ['public.studentrecords', 'public.student_attendance'], processed: ['public.archived_students', 'public.fa_snapshots', 'public.pcm_snapshots'], pages: ['Student Database', 'Student Attendance', 'Archived Students', 'FA Dashboard', 'PCM Dashboard', 'Coach & BM Performance'] },
    ],
  },
  {
    group: 'CRM / Salestrail', color: '#65a30d',
    rows: [
      { sources: ['Salestrail App'], raw: ['public.salestrail_cr'], processed: [], pages: ['Salestrail', 'Salestrail Branch'] },
    ],
  },
  {
    group: 'Events', color: '#f43f5e',
    rows: [
      { sources: ['Manual Entry'], raw: ['public.events', 'public.event_registrations'], processed: [], pages: ['Event Dashboard', 'Event MKT Dashboard', 'HR Event Dashboard'] },
    ],
  },
];

const COL_COLORS = {
  sources:   { bg: '#f9fafb', border: '#d1d5db', text: '#374151', header: '#6b7280' },
  raw:       { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', header: '#1e40af' },
  processed: { bg: '#fefce8', border: '#fde68a', text: '#92400e', header: '#92400e' },
  pages:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', header: '#166534' },
};

function Chip({ label, col }: { label: string; col: keyof typeof COL_COLORS }) {
  const c = COL_COLORS[col];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5,
      padding: '3px 8px', fontSize: 11, fontWeight: 600, color: c.text,
      fontFamily: col === 'raw' || col === 'processed' ? 'monospace' : 'inherit',
      whiteSpace: 'nowrap',
    }}>{label}</div>
  );
}

function HelicopterView() {
  const colHeader = (label: string, sub: string, col: keyof typeof COL_COLORS) => (
    <div style={{ padding: '8px 12px', background: COL_COLORS[col].bg, border: `1.5px solid ${COL_COLORS[col].border}`, borderRadius: 8, marginBottom: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: COL_COLORS[col].header }}>{label}</div>
      <div style={{ fontSize: 10, color: '#9ca3af' }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 900 }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 16px 1.4fr 16px 1.6fr 16px 1.4fr', gap: 4, marginBottom: 12, alignItems: 'end' }}>
          {colHeader('LAYER 1', 'External Sources', 'sources')}
          <div />
          {colHeader('LAYER 2', 'Raw / Ingestion Tables', 'raw')}
          <div />
          {colHeader('LAYER 3', 'Processed / Analytics', 'processed')}
          <div />
          {colHeader('LAYER 4', 'Dashboard Pages', 'pages')}
        </div>

        {/* Pipelines */}
        {HELI_PIPELINES.map(pipeline => (
          <div key={pipeline.group} style={{ marginBottom: 8 }}>
            {/* Group label */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              padding: '4px 10px', background: `${pipeline.color}12`,
              borderLeft: `3px solid ${pipeline.color}`, borderRadius: '0 6px 6px 0',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: pipeline.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: pipeline.color }}>{pipeline.group}</span>
            </div>

            {pipeline.rows.map((row, ri) => (
              <div key={ri} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 16px 1.4fr 16px 1.6fr 16px 1.4fr',
                gap: 4,
                marginBottom: 5,
                alignItems: 'center',
              }}>
                {/* Sources */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  {row.sources.map(s => <Chip key={s} label={s} col="sources" />)}
                </div>

                {/* Arrow */}
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>→</div>

                {/* Raw tables */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {row.raw.length > 0 ? row.raw.map(s => <Chip key={s} label={s} col="raw" />) : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                </div>

                {/* Arrow */}
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  {row.processed.length > 0 ? '→' : ' '}
                </div>

                {/* Processed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {row.processed.length > 0 ? row.processed.map(s => <Chip key={s} label={s} col="processed" />) : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                </div>

                {/* Arrow */}
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  {row.pages.length > 0 ? '→' : ' '}
                </div>

                {/* Pages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {row.pages.length > 0 ? row.pages.map(s => <Chip key={s} label={s} col="pages" />) : <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, paddingTop: 14, borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
          {(Object.entries(COL_COLORS) as [keyof typeof COL_COLORS, typeof COL_COLORS[keyof typeof COL_COLORS]][]).map(([key, c]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}` }} />
              <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const PRIORITY_CFG = {
  high:   { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'HIGH'   },
  medium: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'MEDIUM' },
  low:    { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'LOW'    },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdamTestingPage() {
  const { data: dbData, isLoading: dbLoading, isError: dbError } = useQuery({
    queryKey: ['adamTesting-db'],
    queryFn: () => apiFetch('/api/adam-testing/db-overview'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: suggestData, isLoading: suggestLoading, isError: suggestError, refetch: reanalyze } = useQuery({
    queryKey: ['adamTesting-suggestions'],
    queryFn: () => apiFetch('/api/adam-testing/db-suggestions'),
    staleTime: 10 * 60 * 1000,
  });

  const tables: any[]      = dbData?.tables || [];
  const suggestions: any[] = suggestData?.suggestions || [];
  const publicTables       = tables.filter(t => t.schema === 'public');
  const crmTables          = tables.filter(t => t.schema === 'crm');

  const card = (children: React.ReactNode, mb = 24) => (
    <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e7eb', marginBottom: mb, overflow: 'hidden' }}>
      {children}
    </div>
  );

  const cardHeader = (icon: string, title: string, sub: string, extra?: React.ReactNode) => (
    <div style={{ padding: '13px 20px', borderBottom: '1.5px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>
      </div>
      {extra}
    </div>
  );

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Adam Testing</h1>
          <p className="headerSubtitle">Database overview, full table list, optimization suggestions, and data flow</p>
        </div>
      </div>

      {/* ── 1. OVERVIEW ── */}
      <div style={{ background: 'linear-gradient(135deg,#6366f1 0%,#4338ca 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, letterSpacing: '0.1em', marginBottom: 14 }}>OVERVIEW</div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Database',      value: dbData?.database?.name ?? (dbLoading ? '…' : '—'),       sub: dbData?.database?.totalSize ?? 'total size' },
            { label: 'Schemas',       value: (dbData?.schemas ?? []).length || (dbLoading ? '…' : '—'), sub: (dbData?.schemas ?? []).join(' + ') || '…' },
            { label: 'Tables',        value: dbData?.tableCount     ?? (dbLoading ? '…' : '—'),        sub: 'base tables' },
            { label: 'Views',         value: dbData?.viewCount      ?? (dbLoading ? '…' : '—'),        sub: 'views & mat. views' },
            { label: 'Issues Found',  value: suggestLoading ? '…' : suggestions.length,               sub: 'optimization tips' },
            { label: 'High Priority', value: suggestLoading ? '…' : suggestions.filter(s => s.priority === 'high').length, sub: 'need action now' },
          ].map(item => (
            <div key={item.label} style={{ minWidth: 100 }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. OPTIMIZATION SUGGESTIONS ── */}
      {card(
        <>
          {cardHeader('💡', 'Optimization Suggestions', 'Based on live analysis of your database structure',
            <button onClick={() => reanalyze()} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#374151' }}>↺ Re-analyse</button>
          )}
          <div style={{ padding: '16px 20px' }}>
            {suggestLoading && <div style={{ color: '#6b7280', fontSize: 14 }}>Analysing your database…</div>}
            {suggestError   && <div style={{ color: '#ef4444', fontSize: 14 }}>Failed to load suggestions.</div>}
            {!suggestLoading && !suggestError && suggestions.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(['high','medium','low'] as const).map(p => {
                    const c = PRIORITY_CFG[p];
                    return (
                      <div key={p} style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 8, padding: '5px 14px', textAlign: 'center', minWidth: 68 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{suggestions.filter(s => s.priority === p).length}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: c.color, letterSpacing: '0.06em' }}>{c.label}</div>
                      </div>
                    );
                  })}
                  {suggestData?.analyzedAt && (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      Analysed: {new Date(suggestData.analyzedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {suggestions.map((s: any, i: number) => {
                    const c = PRIORITY_CFG[s.priority as keyof typeof PRIORITY_CFG] || PRIORITY_CFG.low;
                    return (
                      <div key={i} style={{ border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.color}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: c.bg, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.category}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, background: c.color, color: '#fff', borderRadius: 3, padding: '1px 5px' }}>{c.label}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#374151' }}>{s.summary}</div>
                          </div>
                        </div>
                        <div style={{ padding: '7px 14px', background: '#f8fafc', borderTop: `1px solid ${c.border}` }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginRight: 6 }}>ACTION →</span>
                          <span style={{ fontSize: 12, color: '#1e40af' }}>{s.action}</span>
                        </div>
                        {s.items?.length > 0 && (
                          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {s.items.map((item: any, j: number) => (
                              <div key={j} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                                <code style={{ fontWeight: 700, color: c.color, background: `${c.color}15`, borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>{item.label}</code>
                                <span style={{ color: '#6b7280' }}>{item.detail}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── 3. FULL TABLE LIST ── */}
      {card(
        <>
          {cardHeader('🗄️', 'All Tables & Views',
            dbLoading ? 'Loading…' : `${dbData?.tableCount ?? 0} tables · ${dbData?.viewCount ?? 0} views across public + crm schemas`
          )}
          <div style={{ padding: '16px 20px' }}>
            {dbLoading && <div style={{ color: '#6b7280', fontSize: 14 }}>Loading tables…</div>}
            {dbError   && <div style={{ color: '#ef4444', fontSize: 14 }}>Failed to load table list.</div>}
            {!dbLoading && !dbError && [
              { label: 'public', rows: publicTables, color: '#1e40af', bg: '#dbeafe' },
              { label: 'crm',    rows: crmTables,    color: '#065f46', bg: '#d1fae5' },
            ].map(({ label, rows, color, bg }) => (
              <div key={label} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em' }}>{label} schema</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {rows.filter((r: any) => r.table_type === 'BASE TABLE').length} tables · {rows.filter((r: any) => r.table_type === 'VIEW').length} views
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                        {['#', 'Name', 'Type', 'Size', 'Rows (est.)'].map(h => (
                          <th key={h} style={{ textAlign: h === 'Size' || h === 'Rows (est.)' ? 'right' : 'left', padding: '7px 10px', color: '#374151', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t: any, i: number) => (
                        <tr key={t.name} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 10px', color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, color }}>{t.name}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: t.table_type === 'VIEW' ? '#fef9c3' : '#eff6ff', color: t.table_type === 'VIEW' ? '#92400e' : '#1e40af' }}>
                              {t.table_type === 'VIEW' ? 'VIEW' : 'TABLE'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', color: '#374151', textAlign: 'right' }}>{t.size}</td>
                          <td style={{ padding: '6px 10px', color: '#374151', textAlign: 'right' }}>
                            {t.table_type === 'VIEW' ? '—' : Number(t.row_estimate).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 4. HELICOPTER VIEW ── */}
      {card(
        <>
          {cardHeader('🚁', 'Full System — Helicopter View', 'All sources, tables, processed layers, and dashboard pages in one picture · scroll right if needed')}
          <div style={{ padding: '16px 20px' }}>
            <HelicopterView />
          </div>
        </>
      )}

      {/* ── 5. DATA FLOW DIAGRAM (per-pipeline detail) ── */}
      {card(
        <>
          {cardHeader('🔀', 'Data Flow Diagram (Pipeline Detail)', 'Per-pipeline breakdown: ingestion source → tables → analytics views')}
          <div style={{ padding: '16px 20px' }}>
            {FLOW_GROUPS.map(g => <FlowGroupCard key={g.title} group={g} />)}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
              {(['source','table','view','output'] as NodeType[]).map(type => {
                const s = NODE_STYLES[type];
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 13, height: 13, borderRadius: 3, background: s.bg, border: `1.5px solid ${s.border}` }} />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{s.badge}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>,
        0
      )}
    </div>
  );
}
