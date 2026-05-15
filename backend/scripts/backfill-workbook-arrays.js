// One-shot backfill: initialize workbook_progress_json + total_workbook for
// every existing student based on their grade/chapter. Idempotent — only
// rewrites rows whose current array length doesn't match the computed count.
require('dotenv').config();
const { Pool } = require('pg');

const GRADE_LEVEL = { G1:1, G2:2, G3:3, G4:4, G5:5, G6:6, G7:7, G8:8,
                      GA1:1, GA2:2, GA3:3, GA4:4, GB1:1, GB2:2, GB3:3, GB4:4 };

function chapterNum(chapter) {
  return parseInt(String(chapter || 'C1').replace('C', ''), 10) || 1;
}

function getWorkbookCount(grade, chapter) {
  if (grade === 'G1') return 1;
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}

const TABLES = ['studentrecords', 'studentrecords_testing'];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of TABLES) {
      const r = await pool.query(`SELECT id, grade_chapter, workbook_progress_json FROM ${t}`);
      let updated = 0;
      let skipped = 0;
      for (const row of r.rows) {
        const [grade = 'G1', chapter = 'C1'] = String(row.grade_chapter || 'G1 — C1').split(' — ');
        const wbCount = getWorkbookCount(grade, chapter);
        const current = Array.isArray(row.workbook_progress_json) ? row.workbook_progress_json : [];
        if (current.length === wbCount) { skipped++; continue; }
        // Preserve any existing ticks where they fit, pad with false.
        const newArr = Array(wbCount).fill(false).map((_, i) => Boolean(current[i]));
        const attended = newArr.filter(Boolean).length;
        await pool.query(
          `UPDATE ${t} SET workbook_progress_json = $1::jsonb, total_workbook = $2 WHERE id = $3`,
          [JSON.stringify(newArr), `${attended}/${wbCount}`, row.id]
        );
        updated++;
      }
      console.log(`  ${t.padEnd(28)} -> updated ${updated}, skipped ${skipped} (${r.rows.length} total)`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
