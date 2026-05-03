const GRADES = [
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8',
  'GA1', 'GA2', 'GA3', 'GA4',
  'GB1', 'GB2', 'GB3', 'GB4',
];

const SEPARATOR = ' — ';
const PARSE_RE = /^(G(?:A|B)?\d+)\s*[—-]\s*(C\d+)$/;
const CHAPTER_RE = /^C(\d+)$/;

function parseGradeChapter(combined) {
  if (combined === null || combined === undefined) return null;
  const s = String(combined).trim();
  if (!s) return null;
  const m = s.match(PARSE_RE);
  if (!m) return null;
  const grade = m[1];
  const chapter = m[2];
  if (!GRADES.includes(grade)) return null;
  return { grade, chapter };
}

function formatGradeChapter(grade, chapter) {
  return `${grade}${SEPARATOR}${chapter}`;
}

function chapterNum(chapter) {
  if (chapter === null || chapter === undefined) return 0;
  const m = String(chapter).trim().match(CHAPTER_RE);
  return m ? parseInt(m[1], 10) : 0;
}

function nextGrade(grade) {
  if (!grade) return null;
  const idx = GRADES.indexOf(String(grade).trim());
  if (idx === -1) return null;
  if (idx === GRADES.length - 1) return null;
  return GRADES[idx + 1];
}

module.exports = { parseGradeChapter, formatGradeChapter, chapterNum, nextGrade, GRADES };
