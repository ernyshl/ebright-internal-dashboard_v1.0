import { apiFetch } from '../lib/api';

export type PreviewResponse = {
  summary: { new: number; restore: number; matched: number; guardianFill: number; archive: number };
  details: {
    newNames: string[];
    restoreNames: string[];
    matchedNames: string[];
    guardianFillNames: string[];
    archiveNames: string[];
  };
  payload: any;
};

export type ConfirmResponse = {
  success: boolean;
  added: number;
  restored: number;
  skipped: number;
  guardianFilled: number;
  archived: number;
};

export async function previewUpload(rows: any[], branch: string): Promise<PreviewResponse> {
  return apiFetch('/api/student-upload/preview-upload', {
    method: 'POST',
    body: { rows, branch },
  });
}

export async function confirmUpload(categorized: any, branch: string): Promise<ConfirmResponse> {
  return apiFetch('/api/student-upload/confirm-upload', {
    method: 'POST',
    body: { categorized, branch },
  });
}
