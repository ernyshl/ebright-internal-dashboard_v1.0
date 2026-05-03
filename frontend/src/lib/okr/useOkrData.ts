import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { ALL_BRANCHES } from './constants';
import { calcMetrics, prevWeekDate } from './utils';
import { USE_MOCK, MOCK_WEEK, MOCK_RECORDS, getMockWeekRecords } from './mock';

/**
 * Central data hook for the OKR Attendance module.
 * Encapsulates all queries, mutations, and derived state.
 */
export function useOkrData({ dashBranch, dashWeek }) {
  const queryClient = useQueryClient();

  // ── Week date offsets ──
  const week1Date = prevWeekDate(dashWeek, 1);
  const week2Date = prevWeekDate(dashWeek, 2);
  const week3Date = prevWeekDate(dashWeek, 3);

  // ── Queries ──
  const { data: branchesData } = useQuery({
    queryKey: ['okr-branches'],
    queryFn: () => USE_MOCK
      ? { branches: ALL_BRANCHES }
      : apiFetch('/api/okr-attendance/branches'),
  });

  const { data: weekData } = useQuery({
    queryKey: ['okr-week', dashWeek],
    queryFn: () => USE_MOCK
      ? { records: MOCK_RECORDS }
      : apiFetch(`/api/okr-attendance?week_date=${dashWeek}&limit=100`),
    enabled: USE_MOCK || !!dashWeek,
  });

  const { data: week1Data } = useQuery({
    queryKey: ['okr-week', week1Date],
    queryFn: () => USE_MOCK
      ? { records: getMockWeekRecords(week1Date, 1) }
      : apiFetch(`/api/okr-attendance?week_date=${week1Date}&limit=100`),
    enabled: !!week1Date,
  });

  const { data: week2Data } = useQuery({
    queryKey: ['okr-week', week2Date],
    queryFn: () => USE_MOCK
      ? { records: getMockWeekRecords(week2Date, 2) }
      : apiFetch(`/api/okr-attendance?week_date=${week2Date}&limit=100`),
    enabled: !!week2Date,
  });

  const { data: week3Data } = useQuery({
    queryKey: ['okr-week', week3Date],
    queryFn: () => USE_MOCK
      ? { records: getMockWeekRecords(week3Date, 3) }
      : apiFetch(`/api/okr-attendance?week_date=${week3Date}&limit=100`),
    enabled: !!week3Date,
  });

  const { data: dashData } = useQuery({
    queryKey: ['okr-dash', dashBranch, dashWeek],
    queryFn: () => USE_MOCK
      ? { records: [MOCK_RECORDS.find(r => r.branch === dashBranch) ?? MOCK_RECORDS[0]] }
      : apiFetch(`/api/okr-attendance?branch=${encodeURIComponent(dashBranch)}&week_date=${dashWeek}&limit=1`),
    enabled: USE_MOCK ? !!dashBranch : !!dashBranch && !!dashWeek,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['okr-list'],
    queryFn: () => USE_MOCK
      ? { records: MOCK_RECORDS }
      : apiFetch('/api/okr-attendance?limit=50'),
  });

  // ── Mutations ──
  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => USE_MOCK
      ? new Promise(resolve => setTimeout(() => resolve({ ok: true }), 600))
      : apiFetch('/api/okr-attendance', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['okr-list'] });
      queryClient.invalidateQueries({ queryKey: ['okr-week'] });
      queryClient.invalidateQueries({ queryKey: ['okr-dash'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/okr-attendance/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okr-list'] }),
  });

  // ── Derived state ──
  const weekRecords  = weekData?.records  ?? [];
  const week1Records = week1Data?.records ?? [];
  const week2Records = week2Data?.records ?? [];
  const week3Records = week3Data?.records ?? [];
  const dashRecord   = dashData?.records?.[0] ?? null;
  const listRecords  = listData?.records ?? [];
  const branches     = branchesData?.branches ?? [];

  const dashMetrics = useMemo(() => dashRecord ? calcMetrics(dashRecord) : null, [dashRecord]);

  const trendRec0 = dashRecord;
  const trendRec1 = useMemo(() => week1Records.find(r => r.branch === dashBranch) ?? null, [week1Records, dashBranch]);
  const trendRec2 = useMemo(() => week2Records.find(r => r.branch === dashBranch) ?? null, [week2Records, dashBranch]);
  const trendRec3 = useMemo(() => week3Records.find(r => r.branch === dashBranch) ?? null, [week3Records, dashBranch]);

  const trendWeeks = useMemo(() => [
    { date: week3Date, record: trendRec3, metrics: trendRec3 ? calcMetrics(trendRec3) : null },
    { date: week2Date, record: trendRec2, metrics: trendRec2 ? calcMetrics(trendRec2) : null },
    { date: week1Date, record: trendRec1, metrics: trendRec1 ? calcMetrics(trendRec1) : null },
    { date: dashWeek,  record: trendRec0, metrics: dashMetrics },
  ], [week3Date, trendRec3, week2Date, trendRec2, week1Date, trendRec1, dashWeek, trendRec0, dashMetrics]);

  return {
    // Raw records
    branches,
    weekRecords,
    week1Records, // last week (all branches)
    listRecords,
    listLoading,
    dashRecord,
    dashMetrics,
    trendWeeks,
    // Week dates
    week1Date,
    week2Date,
    week3Date,
    // Mutations
    saveMutation,
    deleteMutation,
    // Invalidate helpers
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['okr-list'] });
      queryClient.invalidateQueries({ queryKey: ['okr-week'] });
      queryClient.invalidateQueries({ queryKey: ['okr-dash'] });
    },
  };
}
