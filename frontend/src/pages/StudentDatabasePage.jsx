import { useState, useEffect } from 'react';
import { BackButton } from '../components/BackButton';

/* ─── Constants ─────────────────────────────────────────────────────── */
const BRANCHES = [
  'AMP','BBB','BSP','BTHO','CJY','DA','DK','EGR',
  'KLG','KTG','KW','ONL','PJY','RBY','SA','SHA','SP','ST','TSG',
];

const GRADES = [
  'G1','G2','G3','G4','G5','G6','G7','G8',
  'GA1','GA2','GB1','GB2',
];

const CHAPTERS = [
  'C1','C2','C3','C4','C5','C6',
  'C7','C8','C9','C10','C11','C12',
];

/* ─── Helpers ────────────────────────────────────────────────────────── */
function gradeIndex(grade) { return GRADES.indexOf(grade); }
function chapterNum(chapter) { return parseInt(chapter.slice(1), 10); }

/**
 * How many FA checkboxes a student should see:
 *  - gradeNum   = index + 1  (G1=1 … GB2=12)
 *  - chapter < 12  → gradeNum - 1  (current grade's FA not yet unlocked)
 *  - chapter = 12  → gradeNum      (current grade's FA now available)
 */
function calcFaCount(grade, chapter) {
  const gn = gradeIndex(grade) + 1;
  if (gn <= 0) return 0;
  const cn = chapterNum(chapter);
  return cn < 12 ? Math.max(0, gn - 1) : gn;
}

function resizeFaChecked(existing = [], newCount) {
  if (existing.length === newCount) return existing;
  if (newCount > existing.length)
    return [...existing, ...Array(newCount - existing.length).fill(false)];
  return existing.slice(0, newCount);
}

/**
 * Parse tab-separated Excel data.
 * Col B = index 1 (Name)
 * Col C = index 2 (Gender)
 * Col M = index 12 (Enrollment Date)
 * Col N = index 13 (Status)
 */
function parseExcelText(text, defaultBranch = '') {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .map((line, i) => {
      const cols = line.split('\t');
      const name = (cols[1] || '').trim();
      if (!name) return null;
      return {
        _pid: `preview_${Date.now()}_${i}`,
        name,
        gender:         (cols[2]  || '').trim(),
        enrollmentDate: (cols[12] || '').trim(),
        status:         (cols[13] || 'Active').trim() || 'Active',
        grade:   'G1',
        chapter: 'C1',
        branch:  defaultBranch,
      };
    })
    .filter(Boolean);
}

function uid() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── localStorage hook ──────────────────────────────────────────────── */
function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; }
    catch { return init; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
  return [val, setVal];
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

/** FA checkboxes in the main table row */
function FaCheckboxes({ student, onToggle }) {
  const faCount   = calcFaCount(student.grade, student.chapter);
  const faChecked = resizeFaChecked(student.faChecked, faCount);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {faCount === 0 && <span className="muted small">—</span>}
      {Array.from({ length: faCount }, (_, i) => (
        <label
          key={i}
          style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
        >
          <input
            type="checkbox"
            checked={faChecked[i] || false}
            onChange={() => onToggle(i)}
            style={{ cursor: 'pointer', accentColor: 'var(--brand)' }}
          />
          <span style={{ color: 'var(--textSecondary)' }}>{GRADES[i]}</span>
        </label>
      ))}
    </div>
  );
}

/** Paste → Preview → Save modal */
function AddModal({ onClose, onSave }) {
  const [step, setStep]               = useState('paste');
  const [pasteText, setPasteText]     = useState('');
  const [defaultBranch, setDefault]   = useState('');
  const [previewRows, setPreviewRows] = useState([]);

  const handleClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasteText(text);
      parseAndPreview(text);
    } catch {
      alert('Clipboard access denied. Please paste data manually in the text area below, then click "Parse Data".');
    }
  };

  const parseAndPreview = (text = pasteText) => {
    const rows = parseExcelText(text, defaultBranch);
    if (!rows.length) {
      alert('No valid rows found. Make sure you copied from column A onwards in Excel.');
      return;
    }
    setPreviewRows(rows);
    setStep('preview');
  };

  const updateRow = (pid, field, value) => {
    setPreviewRows(prev => prev.map(r => {
      if (r._pid !== pid) return r;
      return { ...r, [field]: value };
    }));
  };

  const removeRow = (pid) => setPreviewRows(prev => prev.filter(r => r._pid !== pid));

  const handleSave = () => {
    const students = previewRows.map(r => ({
      id: uid(),
      name:           r.name,
      gender:         r.gender,
      enrollmentDate: r.enrollmentDate,
      status:         r.status,
      grade:          r.grade,
      chapter:        r.chapter,
      branch:         r.branch,
      faChecked:      Array(calcFaCount(r.grade, r.chapter)).fill(false),
    }));
    onSave(students);
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: step === 'preview' ? 960 : 580, width: '95vw' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modalHeader">
          <span className="modalTitle">
            {step === 'paste' ? '📋 Import Students from Excel' : `👁️ Preview — ${previewRows.length} student${previewRows.length !== 1 ? 's' : ''} detected`}
          </span>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>

        <div className="modalBody">
          {step === 'paste' ? (
            <>
              <p style={{ color: 'var(--textSecondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
                In Excel, select your rows starting from <strong>column A</strong>. The system reads:
                &nbsp;<strong>Col B</strong> → Name,&nbsp;<strong>Col C</strong> → Gender,
                &nbsp;<strong>Col M</strong> → Enrolment Date,&nbsp;<strong>Col N</strong> → Status.
              </p>

              {/* Default branch */}
              <div className="filterGroup" style={{ marginBottom: 20 }}>
                <label>Default Branch (applied to all imported rows)</label>
                <select
                  className="filterSelect"
                  value={defaultBranch}
                  onChange={e => setDefault(e.target.value)}
                  style={{ marginTop: 6 }}
                >
                  <option value="">— None —</option>
                  {BRANCHES.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btnPrimary" onClick={handleClipboard}>
                  📋 Paste from Clipboard
                </button>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>or paste manually below</span>
              </div>

              <textarea
                className="input"
                rows={8}
                placeholder={"Paste your copied Excel rows here...\n(Select rows in Excel → Ctrl+C → click here → Ctrl+V)"}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  className="btn btnPrimary"
                  onClick={() => parseAndPreview()}
                  disabled={!pasteText.trim()}
                >
                  Parse Data →
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--textSecondary)', fontSize: 14, marginBottom: 16 }}>
                Verify the data, then assign <strong>Grade</strong>, <strong>Chapter</strong>, and <strong>Branch</strong> before saving.
                Default values are <strong>G1</strong> and <strong>C1</strong>.
              </p>

              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Gender</th>
                      <th>Enrolment Date</th>
                      <th>Status</th>
                      <th>Grade</th>
                      <th>Chapter</th>
                      <th>Branch</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, idx) => (
                      <tr key={r._pid}>
                        <td style={{ color: 'var(--muted)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td>{r.gender || '—'}</td>
                        <td>{r.enrollmentDate || '—'}</td>
                        <td>
                          <span className={`badge ${r.status?.toLowerCase() === 'inactive' ? 'badgeInactive' : 'badgeActive'}`}>
                            {r.status || 'Active'}
                          </span>
                        </td>
                        <td>
                          <select
                            className="filterSelect"
                            style={{ padding: '4px 28px 4px 8px', fontSize: 13 }}
                            value={r.grade}
                            onChange={e => updateRow(r._pid, 'grade', e.target.value)}
                          >
                            {GRADES.map(g => <option key={g}>{g}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="filterSelect"
                            style={{ padding: '4px 28px 4px 8px', fontSize: 13 }}
                            value={r.chapter}
                            onChange={e => updateRow(r._pid, 'chapter', e.target.value)}
                          >
                            {CHAPTERS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="filterSelect"
                            style={{ padding: '4px 28px 4px 8px', fontSize: 13 }}
                            value={r.branch}
                            onChange={e => updateRow(r._pid, 'branch', e.target.value)}
                          >
                            <option value="">Select…</option>
                            {BRANCHES.map(b => <option key={b}>{b}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            className="actionBtn actionBtnDelete"
                            title="Remove row"
                            onClick={() => removeRow(r._pid)}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 12 }}>
                <button className="btn" onClick={() => setStep('paste')}>← Back</button>
                <button
                  className="btn btnPrimary"
                  onClick={handleSave}
                  disabled={previewRows.length === 0}
                >
                  ✅ Save {previewRows.length} Student{previewRows.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Edit single student modal */
function EditModal({ student, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...student }));

  const faCount   = calcFaCount(form.grade, form.chapter);
  const faChecked = resizeFaChecked(form.faChecked || [], faCount);

  const setField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'grade' || field === 'chapter') {
        const count = calcFaCount(
          field === 'grade'   ? value : prev.grade,
          field === 'chapter' ? value : prev.chapter,
        );
        next.faChecked = resizeFaChecked(prev.faChecked || [], count);
      }
      return next;
    });
  };

  const toggleFa = (i) => {
    const next = [...faChecked];
    next[i] = !next[i];
    setForm(prev => ({ ...prev, faChecked: next }));
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <span className="modalTitle">✏️ Edit Student</span>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>
        <div className="modalBody">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Name */}
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <div className="label">Name</div>
              <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} />
            </label>

            {/* Gender */}
            <label className="field">
              <div className="label">Gender</div>
              <select className="input" value={form.gender} onChange={e => setField('gender', e.target.value)}>
                <option value="">Select…</option>
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>

            {/* Status */}
            <label className="field">
              <div className="label">Status</div>
              <select className="input" value={form.status} onChange={e => setField('status', e.target.value)}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>

            {/* Enrollment Date */}
            <label className="field">
              <div className="label">Enrolment Date</div>
              <input
                className="input"
                type="date"
                value={form.enrollmentDate ? (form.enrollmentDate.includes('T') ? form.enrollmentDate.split('T')[0] : form.enrollmentDate) : ''}
                onChange={e => setField('enrollmentDate', e.target.value)}
              />
            </label>

            {/* Branch */}
            <label className="field">
              <div className="label">Branch</div>
              <select className="input" value={form.branch} onChange={e => setField('branch', e.target.value)}>
                <option value="">Select Branch…</option>
                {BRANCHES.map(b => <option key={b}>{b}</option>)}
              </select>
            </label>

            {/* Grade */}
            <label className="field">
              <div className="label">Grade</div>
              <select className="input" value={form.grade} onChange={e => setField('grade', e.target.value)}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </label>

            {/* Chapter */}
            <label className="field">
              <div className="label">Chapter</div>
              <select className="input" value={form.chapter} onChange={e => setField('chapter', e.target.value)}>
                {CHAPTERS.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {/* FA checkboxes */}
          {faCount > 0 && (
            <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div className="label" style={{ marginBottom: 12 }}>
                FA Attendance &nbsp;
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                  {faChecked.filter(Boolean).length}/{faCount}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {Array.from({ length: faCount }, (_, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={faChecked[i] || false}
                      onChange={() => toggleFa(i)}
                      style={{ cursor: 'pointer', accentColor: 'var(--brand)', width: 16, height: 16 }}
                    />
                    <span style={{ fontWeight: 600 }}>{GRADES[i]} FA</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btnPrimary" onClick={() => onSave({ ...form, faChecked })}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Delete confirmation modal */
function DeleteModal({ student, onClose, onConfirm }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <span className="modalTitle">🗑️ Delete Student</span>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>
        <div className="modalBody">
          <p style={{ color: 'var(--text)', lineHeight: 1.6, marginBottom: 24 }}>
            Delete <strong>{student.name}</strong>? This cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btnDanger" onClick={onConfirm}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export function StudentDatabasePage() {
  const [students, setStudents] = useLocalStorage('ebright_students_v1', []);
  const [branchFilter, setBranchFilter] = useState('');
  const [search, setSearch]             = useState('');

  // Modals
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState(null);   // student object
  const [deleting, setDeleting] = useState(null);   // student object

  /* ── Derived ── */
  const filtered = students.filter(s => {
    const matchBranch  = !branchFilter || s.branch === branchFilter;
    const matchSearch  = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchBranch && matchSearch;
  });

  /* ── Handlers ── */
  const handleAddSave = (newStudents) => {
    setStudents(prev => [...prev, ...newStudents]);
    setShowAdd(false);
  };

  const handleEditSave = (updatedStudent) => {
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    setEditing(null);
  };

  const handleDelete = () => {
    setStudents(prev => prev.filter(s => s.id !== deleting.id));
    setDeleting(null);
  };

  const toggleFa = (studentId, faIndex) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      const faCount   = calcFaCount(s.grade, s.chapter);
      const faChecked = resizeFaChecked(s.faChecked || [], faCount);
      faChecked[faIndex] = !faChecked[faIndex];
      return { ...s, faChecked };
    }));
  };

  /* ── Render ── */
  return (
    <div className="dashboardPage">
      {/* Page header */}
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Student Database</h1>
          <p className="headerSubtitle">
            {filtered.length} student{filtered.length !== 1 ? 's' : ''}
            {branchFilter ? ` · ${branchFilter}` : ` · ${students.length} total`}
          </p>
        </div>
        <button
          className="btn btnPrimary btnSmall"
          style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}
          onClick={() => setShowAdd(true)}
        >
          + Add Student
        </button>
      </div>

      {/* Filter bar */}
      <div className="filterBar">
        <div className="filterRow">
          {/* Search */}
          <div className="filterGroup searchGroup">
            <label>Search</label>
            <div className="searchInputWrapper">
              <span className="searchIcon">🔍</span>
              <input
                placeholder="Search by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Branch filter */}
          <div className="filterGroup">
            <label>Branch</label>
            <select
              className="filterSelect"
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
            >
              <option value="">All Branches</option>
              {BRANCHES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>

          {(branchFilter || search) && (
            <div className="filterActions" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btnSmall clearFiltersBtn" onClick={() => { setBranchFilter(''); setSearch(''); }}>
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>No.</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Enrolment Date</th>
              <th>Grade &amp; Chapter</th>
              <th>FA Progress</th>
              <th style={{ width: 90 }}>Total FA</th>
              <th>Branch</th>
              <th style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 0, border: 0 }}>
                  <div className="emptyState">
                    <div className="emptyStateIcon">🎓</div>
                    <div className="emptyStateTitle">
                      {students.length === 0 ? 'No students yet' : 'No results found'}
                    </div>
                    <div className="emptyStateText">
                      {students.length === 0
                        ? 'Click "+ Add Student" to import students from Excel.'
                        : 'Try adjusting your search or branch filter.'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s, idx) => {
                const faCount   = calcFaCount(s.grade, s.chapter);
                const faChecked = resizeFaChecked(s.faChecked || [], faCount);
                const faTotal   = faChecked.filter(Boolean).length;
                return (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--muted)', textAlign: 'center' }}>{idx + 1}</td>

                    {/* Name + badge */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span className={`badge ${s.status?.toLowerCase() === 'inactive' ? 'badgeInactive' : 'badgeActive'}`}>
                          {s.status || 'Active'}
                        </span>
                      </div>
                    </td>

                    <td>{s.gender || '—'}</td>
                    <td>{fmtDate(s.enrollmentDate)}</td>

                    {/* Grade & Chapter */}
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.grade}</span>
                      <span style={{ color: 'var(--muted)' }}> – </span>
                      <span style={{ color: 'var(--textSecondary)' }}>{s.chapter}</span>
                    </td>

                    {/* FA checkboxes */}
                    <td>
                      <FaCheckboxes
                        student={s}
                        onToggle={(i) => toggleFa(s.id, i)}
                      />
                    </td>

                    {/* Total FA */}
                    <td style={{ textAlign: 'center' }}>
                      {faCount > 0 ? (
                        <span style={{
                          fontWeight: 700,
                          color: faTotal === faCount && faCount > 0
                            ? 'var(--success)'
                            : faTotal > 0 ? 'var(--warning)' : 'var(--muted)',
                        }}>
                          {faTotal}/{faCount}
                        </span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>

                    <td>{s.branch || <span className="muted small">—</span>}</td>

                    {/* Actions */}
                    <td>
                      <div className="actionButtons">
                        <button
                          className="actionBtn actionBtnEdit"
                          title="Edit"
                          onClick={() => setEditing(s)}
                        >✏️</button>
                        <button
                          className="actionBtn actionBtnDelete"
                          title="Delete"
                          onClick={() => setDeleting(s)}
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showAdd   && <AddModal    onClose={() => setShowAdd(false)}   onSave={handleAddSave} />}
      {editing   && <EditModal   student={editing}  onClose={() => setEditing(null)}  onSave={handleEditSave} />}
      {deleting  && <DeleteModal student={deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} />}
    </div>
  );
}
