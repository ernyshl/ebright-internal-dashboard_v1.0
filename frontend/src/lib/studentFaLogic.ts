import { GRADE_LEVEL } from './studentTypes';

function chapterNum(chapter) {
  return parseInt(chapter.replace('C', ''), 10);
}

export function getFaCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}

export function getPcmCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}

// Workbook rules:
//   G1: always 1 tickbox (regardless of chapter)
//   G2+: < C9 = level − 1, ≥ C9 = level
export function getWorkbookCount(grade, chapter) {
  if (grade === 'G1') return 1;
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}

export function reconcileFa(current, newCount) {
  if (current.length === newCount) return current;
  if (current.length > newCount) return current.slice(0, newCount);
  return [...current, ...Array(newCount - current.length).fill(false)];
}

export function faSummary(attended) {
  return {
    attended: attended.filter(Boolean).length,
    total: attended.length,
  };
}
