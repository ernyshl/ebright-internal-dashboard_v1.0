import { useMutation } from '@tanstack/react-query';
import {
  previewUpload,
  confirmUpload,
  type PreviewResponse,
  type ConfirmResponse,
} from '../api/studentUpload';

export function usePreviewUpload() {
  return useMutation<PreviewResponse, Error, { rows: any[]; branch: string }>({
    mutationFn: ({ rows, branch }) => previewUpload(rows, branch),
  });
}

export function useConfirmUpload() {
  return useMutation<ConfirmResponse, Error, { categorized: any; branch: string }>({
    mutationFn: ({ categorized, branch }) => confirmUpload(categorized, branch),
  });
}
