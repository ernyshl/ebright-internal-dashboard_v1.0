const FOUNDATION_KEYWORDS = ['Foundation', 'Appraisal', 'Showcase'];

function isFoundationLesson(lessonName) {
  if (lessonName === null || lessonName === undefined) return false;
  const s = String(lessonName);
  if (!s) return false;
  return FOUNDATION_KEYWORDS.some(k => s.includes(k));
}

module.exports = { isFoundationLesson, FOUNDATION_KEYWORDS };
