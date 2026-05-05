import { apiFetch } from '../lib/api';

export type BackfillResponse = {
  success: boolean;
  totalRows: number;
  updated: number;
  alreadyFilled: number;
  notFound: number;
  skipped: number;
  details: {
    updatedNames: string[];
    alreadyFilledNames: string[];
    notFoundNames: string[];
  };
};

export async function backfillGuardian(rows: any[], branch: string): Promise<BackfillResponse> {
  return apiFetch('/api/guardian-backfill/backfill', {
    method: 'POST',
    body: { rows, branch },
  });
}
