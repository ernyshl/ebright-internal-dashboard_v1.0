import { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

const AcademyContext = createContext(null);

function dbToRow(r) {
  return {
    code:    r.branch_code,
    active:  r.fa_active,
    inv1:    r.inv_apr1819,
    inv2:    r.inv_apr2526,
    backlog: r.backlog,
  };
}

export function AcademyProvider({ children }) {
  // FA branch data (from /api/fa-dashboard)
  const [faBranchData, setFaBranchData] = useState([]);
  const [faLoaded, setFaLoaded] = useState(false);

  // Student records (owned by StudentDatabasePage, shared here)
  const [dbStudents, setDbStudents] = useState([]);

  // Shared branch filter between Student DB and FA Dashboard
  const [sharedBranch, setSharedBranch] = useState('All');

  // Load FA branch data once on mount
  useEffect(() => {
    apiFetch('/api/fa-dashboard')
      .then(res => {
        if (res.data?.length) setFaBranchData(res.data.map(dbToRow));
        setFaLoaded(true);
      })
      .catch(() => setFaLoaded(true));
  }, []);

  // Update FA branch data and persist to API
  async function saveFaBranchData(committed) {
    const rows = committed.map(b => ({
      branch_code: b.code,
      fa_active:   b.active,
      inv_apr1819: b.inv1,
      inv_apr2526: b.inv2,
    }));
    const res = await apiFetch('/api/fa-dashboard/save', { method: 'POST', body: { rows } });
    if (res.data) setFaBranchData(res.data.map(dbToRow));
    else setFaBranchData(committed);
  }

  // Compute FA stats for a given branch filter
  function getFaStats(branch) {
    const rows = branch === 'All' ? faBranchData : faBranchData.filter(r => r.code === branch);
    const active  = rows.reduce((s, r) => s + (r.active || 0), 0);
    const invited = rows.reduce((s, r) => s + (r.inv1 || 0) + (r.inv2 || 0), 0);
    const backlog = Math.max(0, active - invited);
    return { active, invited, backlog };
  }

  // Grade distribution from dbStudents, filtered by branch
  function getGradeDistribution(branch) {
    const active = dbStudents.filter(s => s.status === 'Active');
    const relevant = branch === 'All' ? active : active.filter(s => s.branch === branch);
    const grades = {};
    relevant.forEach(s => { grades[s.grade] = (grades[s.grade] || 0) + 1; });
    return grades;
  }

  return (
    <AcademyContext.Provider value={{
      faBranchData, setFaBranchData, saveFaBranchData, faLoaded,
      dbStudents, setDbStudents,
      sharedBranch, setSharedBranch,
      getFaStats, getGradeDistribution,
    }}>
      {children}
    </AcademyContext.Provider>
  );
}

export function useAcademy() {
  return useContext(AcademyContext);
}
