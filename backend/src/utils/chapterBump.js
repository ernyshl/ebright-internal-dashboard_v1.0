const { chapterNum, nextGrade } = require('./gradeChapter');

const MAX_CHAPTER = 12;

function bumpChapter(grade, chapter) {
  const n = chapterNum(chapter);
  if (n > 0 && n < MAX_CHAPTER) {
    return { grade, chapter: `C${n + 1}` };
  }
  if (n === MAX_CHAPTER) {
    const ng = nextGrade(grade);
    if (!ng) return { grade, chapter };
    return { grade: ng, chapter: 'C1' };
  }
  return { grade, chapter };
}

module.exports = { bumpChapter };
