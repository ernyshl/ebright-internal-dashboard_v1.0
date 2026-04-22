import { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';

import { REGIONS, BRANCH_META, DAYS, EMPTY_FORM } from '../lib/okr/constants';
import { weekRange, calcMetrics, getRateColor, parseExcelPaste } from '../lib/okr/utils';
import { useOkrData } from '../lib/okr/useOkrData';

import { CompanyHealthBanner } from '../components/okr/CompanyHealthBanner';
import { RateBar } from '../components/okr/RateBar';
import { BranchDetailCard } from '../components/okr/BranchDetailCard';
import { AllBranchesGrid } from '../components/okr/AllBranchesGrid';
import { DailyBulkEntry } from '../components/okr/DailyBulkEntry';
import { DailyAttendanceView } from '../components/okr/DailyAttendanceView';
import { USE_MOCK, MOCK_WEEK } from '../lib/okr/mock';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'entry',     label: 'Data Entry', icon: '✏️' },
  { id: 'history',   label: 'History',    icon: '📋' },
];

export function OkrAttendancePage() {
  const [searchParams] = useSearchParams();
  const initMode = searchParams.get('mode') === 'weekly' ? 'weekly' : 'daily';

  const [form, setForm]                 = useState(EMPTY_FORM);
  const [editingId, setEditingId]       = useState(null);
  const [activeTab, setActiveTab]       = useState(initMode === 'weekly' ? 'entry' : 'dashboard');
  const [dashView, setDashView]         = useState<'weekly' | 'daily'>('weekly');
  const [dashBranch, setDashBranch]     = useState('');
  const [dashWeek, setDashWeek]         = useState(USE_MOCK ? MOCK_WEEK : '');
  const [filterBranch, setFilterBranch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [saveStatus, setSaveStatus]     = useState(null);
  const [entryMode, setEntryMode]       = useState(initMode);
  const [showPcMeetup, setShowPcMeetup] = useState(false);
  const [pasteStatus, setPasteStatus]   = useState(null);
  const [pastePreview, setPastePreview] = useState(null);
  const pasteTextareaRef = useRef(null);

  // ── All data fetching in one hook ──
  const {
    branches, weekRecords, listRecords, listLoading,
    dashRecord, dashMetrics, trendWeeks,
    saveMutation, deleteMutation,
  } = useOkrData({ dashBranch, dashWeek });

  // ── Derived ──
  const liveMetrics = useMemo(() => calcMetrics(form), [form]);

  const rankedRecords = useMemo(() =>
    weekRecords
      .filter(r => !regionFilter || BRANCH_META[r.branch]?.region === regionFilter)
      .map(r => ({ ...r, _m: calcMetrics(r) }))
      .sort((a, b) => b._m.attendanceRate - a._m.attendanceRate),
    [weekRecords, regionFilter]
  );
  const top5    = rankedRecords.slice(0, 5);
  const bottom5 = rankedRecords.slice(-5).reverse();

  const filteredList = useMemo(() =>
    filterBranch ? listRecords.filter(r => r.branch === filterBranch) : listRecords,
    [listRecords, filterBranch]
  );

  // ── Handlers ──
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPasteStatus(null);
    setPastePreview(null);
  };

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleImport = () => {
    const text = pasteTextareaRef.current?.value || '';
    if (!text.trim()) return;
    pasteTextareaRef.current.value = '';
    const parsed = parseExcelPaste(text);
    if (parsed) {
      setForm(p => ({ ...p, ...parsed.fields }));
      setPastePreview(parsed.totals);
      setPasteStatus('ok');
    } else {
      setPasteStatus('error');
      setPastePreview(null);
    }
    setTimeout(() => setPasteStatus(null), 4000);
  };

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteStatus('error');
        setPastePreview(null);
        setTimeout(() => setPasteStatus(null), 4000);
        return;
      }
      const parsed = parseExcelPaste(text);
      if (parsed) {
        setForm(p => ({ ...p, ...parsed.fields }));
        setPastePreview(parsed.totals);
        setPasteStatus('ok');
      } else {
        setPasteStatus('error');
        setPastePreview(null);
      }
      setTimeout(() => setPasteStatus(null), 4000);
    } catch {
      setPasteStatus('error');
      setPastePreview(null);
      setTimeout(() => setPasteStatus(null), 4000);
    }
  };

  const handleEdit = (rec) => {
    setForm({
      branch: rec.branch, week_date: rec.week_date?.slice(0, 10),
      total_onl_attendance:     rec.total_onl_attendance     ?? '',
      wed_absent:  rec.wed_absent  ?? '', wed_attended:  rec.wed_attended  ?? '',
      wed_frozen:  rec.wed_frozen  ?? '', wed_replaced:  rec.wed_replaced  ?? '',
      thu_absent:  rec.thu_absent  ?? '', thu_attended:  rec.thu_attended  ?? '',
      thu_frozen:  rec.thu_frozen  ?? '', thu_replaced:  rec.thu_replaced  ?? '',
      fri_absent:  rec.fri_absent  ?? '', fri_attended:  rec.fri_attended  ?? '',
      fri_frozen:  rec.fri_frozen  ?? '', fri_replaced:  rec.fri_replaced  ?? '',
      sat_absent:  rec.sat_absent  ?? '', sat_attended:  rec.sat_attended  ?? '',
      sat_frozen:  rec.sat_frozen  ?? '', sat_replaced:  rec.sat_replaced  ?? '',
      sun_absent:  rec.sun_absent  ?? '', sun_attended:  rec.sun_attended  ?? '',
      sun_frozen:  rec.sun_frozen  ?? '', sun_replaced:  rec.sun_replaced  ?? '',
      not_enrolled:             rec.not_enrolled             ?? '',
      outstanding_invoice_disc: rec.outstanding_invoice_disc ?? '',
      expired_package:          rec.expired_package          ?? '',
      newly_enrolled:           rec.newly_enrolled           ?? '',
      pc_meetup_invited:        rec.pc_meetup_invited        ?? '',
      pc_meetup_showup:         rec.pc_meetup_showup         ?? '',
      partially_paid_unpaid:    rec.partially_paid_unpaid    ?? '',
      active_students:          rec.active_students          ?? '',
    });
    setEditingId(rec.id);
    setActiveTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch || !form.week_date) return;
    const metrics = calcMetrics(form);
    saveMutation.mutate(
      { ...form, outstanding_invoice_pct: metrics.outstandingInvoicePct },
      {
        onSuccess: () => {
          setSaveStatus('ok');
          setTimeout(() => setSaveStatus(null), 4000);
          if (!editingId) resetForm();
        },
        onError: (e: any) => {
          setSaveStatus(e?.status === 401 ? 'auth' : 'error');
          setTimeout(() => setSaveStatus(null), 6000);
          console.error('Save error:', e);
        },
      }
    );
  };

  const handleDelete = (id) => {
    if (confirm('Delete this record?')) deleteMutation.mutate(id);
  };

  // ── Render ──
  return (
    <div className="okrPage">

      {/* ── Header ── */}
      <div className="okrHero">
        <div className="okrHeroLeft">
          <BackButton />
          <div className="okrHeroText">
            <h1 className="okrHeroTitle">OKR Attendance</h1>
            <p className="okrHeroSub">Weekly student attendance tracking per branch</p>
          </div>
        </div>
        {!(activeTab === 'entry' && entryMode === 'daily') && (
          <div className="okrHeroControls">
            <div className="okrHeroSelect">
              <span className="okrSelectIcon">🏢</span>
              <select value={dashBranch} onChange={e => setDashBranch(e.target.value)}>
                <option value="">Select Branch</option>
                {Object.entries(REGIONS).map(([region, list]) => (
                  <optgroup key={region} label={`Region ${region}`}>
                    {list.map(b => <option key={b.name} value={b.name}>{b.name} ({b.code})</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="okrHeroSelect">
              <span className="okrSelectIcon">📅</span>
              <input type="date" value={dashWeek} onChange={e => setDashWeek(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="okrTabBar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`okrTabBtn${activeTab === t.id ? ' okrTabBtnActive' : ''}`}
            onClick={() => { if (t.id === 'entry' && !editingId) resetForm(); setActiveTab(t.id); }}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          DASHBOARD TAB
      ══════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="okrDashWrap">

          {/* ── Weekly / Daily view toggle ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button type="button"
              onClick={() => setDashView('weekly')}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                background: dashView === 'weekly' ? 'var(--brand, #e1251b)' : '#e5e7eb',
                color: dashView === 'weekly' ? '#fff' : '#374151',
              }}>
              📋 Weekly View
            </button>
            <button type="button"
              onClick={() => setDashView('daily')}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                background: dashView === 'daily' ? 'var(--brand, #e1251b)' : '#e5e7eb',
                color: dashView === 'daily' ? '#fff' : '#374151',
              }}>
              📅 Daily View
            </button>
          </div>

          {/* ── Daily View ── */}
          {dashView === 'daily' && <DailyAttendanceView />}

          {/* ── Weekly View ── */}
          {dashView === 'weekly' && (!dashWeek ? (
            <div className="okrEmptyHero">
              <div className="okrEmptyIcon">📅</div>
              <h3>Select a week date above</h3>
              <p>Choose a week to view rankings and branch performance</p>
            </div>
          ) : (
            <>
              {rankedRecords.length > 0 && <CompanyHealthBanner records={weekRecords} />}

              {rankedRecords.length > 0 && (
                <div className="okrRankCard">
                  <div className="okrRankCardHeader">
                    <div>
                      <span className="okrRankCardTitle">Branch Rankings — Week of {dashWeek}</span>
                      <span className="okrRankBadge" style={{ marginLeft: 10 }}>{rankedRecords.length} branches</span>
                    </div>
                    <div className="okrRegionTabs">
                      {['', 'A', 'B', 'C'].map(r => (
                        <button key={r} className={`okrRegionTab${regionFilter === r ? ' okrRegionTabActive' : ''}`} onClick={() => setRegionFilter(r)}>
                          {r === '' ? 'All' : `Region ${r}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="okrRankGrid">
                    <div className="okrRankHalf">
                      <div className="okrRankHalfTitle okrRankTop"><span>🏆</span> Top 5 — Attendance Rate</div>
                      {top5.map((r, i) => {
                        const meta = BRANCH_META[r.branch];
                        return (
                          <div key={r.id} className={`okrRankRow${dashBranch === r.branch ? ' okrRankRowActive' : ''}`} onClick={() => setDashBranch(r.branch)}>
                            <span className="okrRankPos okrRankPosTop">{i + 1}</span>
                            <div className="okrRankInfo">
                              <div className="okrRankBranchRow">
                                <span className="okrRankBranch">{r.branch}</span>
                                <span className="okrRankCode">{meta?.code}</span>
                                <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                              </div>
                              <RateBar value={r._m.attendanceRate} />
                            </div>
                            <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>{r._m.attendanceRate.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="okrRankDivider" />
                    <div className="okrRankHalf">
                      <div className="okrRankHalfTitle okrRankBot"><span>📉</span> Bottom 5 — Needs Attention</div>
                      {bottom5.map((r, i) => {
                        const meta = BRANCH_META[r.branch];
                        return (
                          <div key={r.id} className={`okrRankRow${dashBranch === r.branch ? ' okrRankRowActive' : ''}`} onClick={() => setDashBranch(r.branch)}>
                            <span className="okrRankPos okrRankPosBot">{rankedRecords.length - bottom5.length + i + 1}</span>
                            <div className="okrRankInfo">
                              <div className="okrRankBranchRow">
                                <span className="okrRankBranch">{r.branch}</span>
                                <span className="okrRankCode">{meta?.code}</span>
                                <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                              </div>
                              <RateBar value={r._m.attendanceRate} />
                            </div>
                            <span className="okrRankPct" style={{ color: getRateColor(r._m.attendanceRate) }}>{r._m.attendanceRate.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!dashBranch ? (
                <AllBranchesGrid records={rankedRecords} onSelect={setDashBranch} />
              ) : !dashRecord ? (
                <div className="okrEmptyHero okrEmptySmall">
                  <div className="okrEmptyIcon">📭</div>
                  <h3>No data for {dashBranch}</h3>
                  <p>Add data via the <button className="okrInlineBtn" onClick={() => setActiveTab('entry')}>Data Entry</button> tab</p>
                </div>
              ) : (
                <>
                  <button className="okrBackToAll" onClick={() => setDashBranch('')}>← All Branches</button>
                  <BranchDetailCard record={dashRecord} metrics={dashMetrics} trendWeeks={trendWeeks} />
                </>
              )}
            </>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════
          DATA ENTRY TAB
      ══════════════════════════════════════ */}
      {activeTab === 'entry' && (
        <div className="okrEntryWrap">
          <div className="okrEntryModeToggle">
            <button type="button"
              className={`okrEntryModeBtn${entryMode === 'daily' ? ' okrEntryModeBtnActive' : ''}`}
              onClick={() => setEntryMode('daily')}>
              📅 Daily Entry
            </button>
            <button type="button"
              className={`okrEntryModeBtn${entryMode === 'weekly' ? ' okrEntryModeBtnActive' : ''}`}
              onClick={() => setEntryMode('weekly')}>
              📋 Weekly Entry
            </button>
          </div>

          {entryMode === 'daily' ? <DailyBulkEntry /> : (
        <form className="okrEntryForm" onSubmit={handleSubmit}>
          <div className="okrEntryHeader">
            <h2>{editingId ? '✏️ Edit Record' : '➕ New Record'}</h2>
            <div className="okrEntryHeaderBtns">
              <button type="button" className={`okrPcToggleBtn${showPcMeetup ? ' okrPcToggleBtnActive' : ''}`} onClick={() => setShowPcMeetup(v => !v)}>
                🤝 PC Meetup {showPcMeetup ? '▲' : '▼'}
              </button>
              <button type="button" className="okrClearBtn" onClick={resetForm}>✕ Clear</button>
              {editingId && <button type="button" className="btnSecondary" onClick={resetForm}>Cancel</button>}
            </div>
          </div>

          {showPcMeetup && (
            <div className="okrEntrySection okrPcMeetupSection">
              <div className="okrEntrySectionTitle">
                🤝 Parent-Coach Meetup
                <span className="okrPcComingSoon">Coming soon — hidden from main flow</span>
              </div>
              <div className="okrEntryGrid2" style={{ maxWidth: 360 }}>
                <div className="formGroup">
                  <label>Invited</label>
                  <input type="number" name="pc_meetup_invited" value={form.pc_meetup_invited} onChange={handleChange} min="0" placeholder="0" />
                </div>
                <div className="formGroup">
                  <label>Show Up</label>
                  <input type="number" name="pc_meetup_showup" value={form.pc_meetup_showup} onChange={handleChange} min="0" placeholder="0" />
                </div>
              </div>
            </div>
          )}

          {/* Record Info */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">Record Info</div>
            <div className="okrEntryGrid2">
              <div className="formGroup">
                <label>Branch *</label>
                <select name="branch" value={form.branch} onChange={handleChange} required>
                  <option value="">Select branch...</option>
                  {Object.entries(REGIONS).map(([region, list]) => (
                    <optgroup key={region} label={`Region ${region}`}>
                      {list.map(b => <option key={b.name} value={b.name}>{b.name} ({b.code})</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="formGroup">
                <label>Week Date (Wednesday) *</label>
                <input type="date" name="week_date" value={form.week_date} onChange={handleChange} required />
                {form.week_date && <div className="okrWeekRangePill">{weekRange(form.week_date)}</div>}
              </div>
            </div>
          </div>

          {/* Daily Attendance */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">
              Daily Attendance <span className="okrEntrySectionHint">from Mastercopy</span>
            </div>
            <button type="button" className="okrPasteImportBtn okrPasteImportBtnFull" onClick={handleReadClipboard}>
              📋 Read from Clipboard
            </button>
            <div className="okrPasteInputRow">
              <textarea
                ref={pasteTextareaRef}
                className="okrPasteInputTextarea"
                placeholder="Or paste your Excel table here manually, then click Import..."
                rows={3}
              />
              <button type="button" className="okrPasteImportBtn" onClick={handleImport}>Import</button>
            </div>
            {pasteStatus === 'ok'    && <div className="okrPasteZone okrPasteZoneOk">✅ Data imported — fields filled below</div>}
            {pasteStatus === 'error' && <div className="okrPasteZone okrPasteZoneErr">❌ Could not read table — make sure to include the header row (absent / attended / replaced / Frozen)</div>}
            {pastePreview && (
              <div className="okrPastePreview">
                <span className="okrPastePreviewLabel">Pasted totals:</span>
                <div className="okrPastePreviewCols">
                  {[
                    { label: 'Absent',   val: pastePreview.absent   },
                    { label: 'Attended', val: pastePreview.attended  },
                    { label: 'Replaced', val: pastePreview.replaced  },
                    { label: 'Frozen',   val: pastePreview.frozen    },
                  ].map(c => (
                    <div key={c.label} className="okrPastePreviewCol">
                      <span>{c.label}</span>
                      <strong>{c.val ?? '—'}</strong>
                    </div>
                  ))}
                  {pastePreview.grand != null && (
                    <div className="okrPastePreviewCol okrPastePreviewTotal">
                      <span>Total</span><strong>{pastePreview.grand}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="okrDailyGrid">
              <div className="okrDailyGridHead">
                <span>Day</span><span>Absent</span><span>Attended</span><span>Frozen</span><span>Replaced</span>
              </div>
              {DAYS.map(d => (
                <div className="okrDailyGridRow" key={d.key}>
                  <span className="okrDailyLabel">{d.label}</span>
                  {['absent', 'attended', 'frozen', 'replaced'].map(col => (
                    <input key={col} type="number" name={`${d.key}_${col}`} value={form[`${d.key}_${col}`]} onChange={handleChange} min="0" placeholder="0" />
                  ))}
                </div>
              ))}
              <div className="okrDailyGridTotals">
                <span>Totals</span>
                <span>{liveMetrics.totalAbsent}</span>
                <span>{liveMetrics.totalAttended}</span>
                <span>{liveMetrics.totalFrozen}</span>
                <span>{liveMetrics.totalReplaced}</span>
              </div>
            </div>
            <div className="okrLivePills">
              <div className="okrLivePill">
                <span>Total Attendance</span>
                <strong>{liveMetrics.totalAttendance}</strong>
              </div>
              <div className="okrLivePill">
                <span>Attendance Rate</span>
                <strong style={{ color: getRateColor(liveMetrics.attendanceRate) }}>{liveMetrics.attendanceRate.toFixed(1)}%</strong>
              </div>
              <div className="okrLivePill">
                <span>Rate w/ Freeze</span>
                <strong style={{ color: getRateColor(liveMetrics.attendanceRateWithFreeze) }}>{liveMetrics.attendanceRateWithFreeze.toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          {/* Discrepancy Breakdown */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">Discrepancy Breakdown</div>
            <div className="okrLivePills" style={{ marginBottom: 16 }}>
              <div className="okrLivePill">
                <span>Discrepancy</span>
                <strong style={{ color: liveMetrics.discrepancy < 0 ? 'var(--brand)' : liveMetrics.discrepancy === 0 ? 'var(--success)' : 'var(--info)' }}>
                  {liveMetrics.discrepancy}
                </strong>
              </div>
              <div className="okrLivePill">
                <span>Total Discrepancy</span>
                <strong>{liveMetrics.totalDisc}</strong>
              </div>
              <div className="okrLivePill">
                <span>Remaining Discrepancies</span>
                <strong style={{ color: liveMetrics.remainingDisc === 0 ? 'var(--success)' : 'var(--brand)' }}>
                  {liveMetrics.remainingDisc}
                </strong>
              </div>
            </div>
            <div className="okrEntryGrid4">
              {[
                { name: 'not_enrolled',             label: '1a) Not Enrolled to Any Lesson' },
                { name: 'outstanding_invoice_disc',  label: '1b) With Outstanding Invoice' },
                { name: 'expired_package',           label: '1c) Expired Package' },
                { name: 'newly_enrolled',            label: '1d) Newly Enrolled Student' },
              ].map(f => (
                <div className="formGroup" key={f.name}>
                  <label>{f.label}</label>
                  <input type="number" name={f.name} value={form[f.name]} onChange={handleChange} min="0" placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          {/* Outstanding Invoices */}
          <div className="okrEntrySection">
            <div className="okrEntrySectionTitle">
              Outstanding Invoices (AOne)
              <span className="okrEntrySectionHint">Target: 20–25%</span>
            </div>
            <div className="okrEntryGrid3">
              <div className="formGroup">
                <label>Partially Paid + Unpaid</label>
                <input type="number" name="partially_paid_unpaid" value={form.partially_paid_unpaid} onChange={handleChange} min="0" placeholder="0" />
              </div>
              <div className="formGroup">
                <label>Active Students</label>
                <input type="number" name="active_students" value={form.active_students} onChange={handleChange} min="0" placeholder="0" />
                <span className="okrFieldNote">Also used for Discrepancy</span>
              </div>
              <div className="formGroup">
                <label>Outstanding Invoice %</label>
                <div className={`okrAutoCalcBox${liveMetrics.outstandingInvoicePct > 25 ? ' okrAutoCalcBoxWarn' : liveMetrics.outstandingInvoicePct > 0 ? ' okrAutoCalcBoxOk' : ''}`}>
                  {liveMetrics.outstandingInvoicePct.toFixed(2)}%
                  <span className="okrAutoCalcBoxHint">Partially Paid ÷ Active × 100</span>
                </div>
              </div>
            </div>
          </div>

          <div className="okrSaveRow">
            <button type="submit" className="okrSaveBtn" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : (editingId ? '✓ Update Record' : '✓ Save Record')}
            </button>
            {saveStatus === 'ok'    && <div className="okrSaveStatus okrSaveStatusOk">✅ Saved successfully!</div>}
            {saveStatus === 'error' && <div className="okrSaveStatus okrSaveStatusErr">❌ Save failed — check the backend is running.</div>}
            {saveStatus === 'auth'  && <div className="okrSaveStatus okrSaveStatusErr">🔒 Session expired — please log in again.</div>}
          </div>
        </form>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════
          HISTORY TAB
      ══════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="okrHistWrap">
          <div className="okrHistFilters">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {listLoading ? (
            <p className="okrHistLoading">Loading...</p>
          ) : filteredList.length === 0 ? (
            <div className="okrEmptyHero">
              <div className="okrEmptyIcon">📭</div>
              <h3>No records yet</h3>
              <p>Add data via the Data Entry tab</p>
            </div>
          ) : (
            <div className="okrHistTable">
              <div className="okrHistHead">
                <span>Branch</span><span>Week</span><span>Attendance</span>
                <span>Rate</span><span>Rate w/ Freeze</span><span>Active</span><span>Actions</span>
              </div>
              {filteredList.map(r => {
                const m = calcMetrics(r);
                return (
                  <div key={r.id} className="okrHistRow">
                    <span className="okrHistBranch">{r.branch}</span>
                    <span className="okrHistWeek">{weekRange(r.week_date?.slice(0, 10))}</span>
                    <span>{m.totalAttendance}</span>
                    <span style={{ color: getRateColor(m.attendanceRate), fontWeight: 600 }}>{m.attendanceRate.toFixed(1)}%</span>
                    <span style={{ color: getRateColor(m.attendanceRateWithFreeze), fontWeight: 600 }}>{m.attendanceRateWithFreeze.toFixed(1)}%</span>
                    <span>{r.active_students ?? '—'}</span>
                    <span className="okrHistActions">
                      <button className="okrActBtn okrActView" onClick={() => { setDashBranch(r.branch); setDashWeek(r.week_date?.slice(0, 10)); setActiveTab('dashboard'); }}>View</button>
                      <button className="okrActBtn okrActEdit" onClick={() => handleEdit(r)}>Edit</button>
                      <button className="okrActBtn okrActDel" onClick={() => handleDelete(r.id)}>Del</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
