import { GRADE_LEVEL } from './studentTypes';

function chapterNum(chapter) {
  return parseInt(chapter.replace('C', ''), 10);
}

export function getFaCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 12 ? Math.max(0, level - 1) : level;
}

export function getPcmCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 10 ? Math.max(0, level - 1) : level;
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
