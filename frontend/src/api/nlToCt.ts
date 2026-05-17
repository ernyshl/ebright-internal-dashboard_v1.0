import { apiFetch } from '../lib/api';

export interface NlToCtTab {
  id: number;
  gid: string;
  tab_name: string;
  week_date: string; // 'YYYY-MM-DD'
  added_by: string | null;
  added_at: string;
}

export interface SlotData {
  slot_key: string;
  goal: number | null;
  actual_live: number | null;
  actual_captured: number | null;
  captured_at: string | null;
  captured_by: string | null;
  qaqc: string | null;
}

export interface BranchData {
  code: string;
  nl: number | null;
  ct: number | null;
  slots: SlotData[];
}

export interface TabPayload {
  tab: NlToCtTab;
  parameters: Record<string, number | null>;
  branches: BranchData[];
  sheet_read_error?: string;
}

export const nlToCtApi = {
  listTabs: () => apiFetch('/api/nl-to-ct/tabs') as Promise<{ tabs: NlToCtTab[] }>,

  addTab: (gid: string) =>
    apiFetch('/api/nl-to-ct/tabs', {
      method: 'POST',
      body: { gid },
    }) as Promise<{ tab: NlToCtTab }>,

  deleteTab: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}`, { method: 'DELETE' }) as Promise<void>,

  getData: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/data`) as Promise<TabPayload>,

  capture: (id: number, slotKey: string) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/capture`, {
      method: 'POST',
      body: { slot_key: slotKey },
    }) as Promise<TabPayload>,

  previousWeek: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/previous-week`) as Promise<TabPayload>,
};
