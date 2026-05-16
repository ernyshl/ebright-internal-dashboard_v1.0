// One-shot backfill: resize every student's fa_progress_json + pcm_progress_json
// based on the NEW cutoff (C9 for both, was C12 for FA and C10 for PCM).
// Idempotent — only rewrites rows whose current array length doesn't match the new count.
// Existing ticks are preserved; new slots are padded with false.
require('dotenv').config();
const { Pool } = require('pg');

const GRADE_LEVEL = { G1:1, G2:2, G3:3, G4:4, G5:5, G6:6, G7:7, G8:8,
                      GA1:1, GA2:2, GA3:3, GA4:4, GB1:1, GB2:2, GB3:3, GB4:4 };

function chapterNum(chapter) {
  return parseInt(String(chapter || 'C1').replace('C', ''), 10) || 1;
}

// NEW rule (matches frontend studentFaLogic.ts):
//   < C9 → level − 1
//   ≥ C9 → level
function getFaCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}
function getPcmCount(grade, chapter) {
  const level = GRADE_LEVEL[grade] || 1;
  return chapterNum(chapter) < 9 ? Math.max(0, level - 1) : level;
}

const TABLES = ['studentrecords', 'studentrecords_testing'];

function resize(currentArr, newCount) {
  const current = Array.isArray(currentArr) ? currentArr : [];
  return Array(newCount).fill(false).map((_, i) => Boolean(current[i]));
}

function totalStr(arr) {
  if (!arr.length) return '0/0';
  return `${arr.filter(Boolean).length}/${arr.length}`;
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of TABLES) {
      const r = await pool.query(`SELECT id, grade_chapter, fa_progress_json, pcm_progress_json FROM ${t}`);
      let faUpd = 0, pcmUpd = 0, bothSkipped = 0;
      for (const row of r.rows) {
        const [grade = 'G1', chapter = 'C1'] = String(row.grade_chapter || 'G1 — C1').split(' — ');
        const faTarget  = getFaCount(grade, chapter);
        const pcmTarget = getPcmCount(grade, chapter);
        const faCur     = Array.isArray(row.fa_progress_json)  ? row.fa_progress_json  : [];
        const pcmCur    = Array.isArray(row.pcm_progress_json) ? row.pcm_progress_json : [];
        const faNeeds   = faCur.length !== faTarget;
        const pcmNeeds  = pcmCur.length !== pcmTarget;
        if (!faNeeds && !pcmNeeds) { bothSkipped++; continue; }
        const faNew  = resize(faCur,  faTarget);
        const pcmNew = resize(pcmCur, pcmTarget);
        await pool.query(
          `UPDATE ${t} SET
              fa_progress_json  = $1::jsonb, total_fa  = $2,
              pcm_progress_json = $3::jsonb, total_pcm = $4
            WHERE id = $5`,
          [JSON.stringify(faNew), totalStr(faNew), JSON.stringify(pcmNew), totalStr(pcmNew), row.id]
        );
        if (faNeeds)  faUpd++;
        if (pcmNeeds) pcmUpd++;
      }
      console.log(`  ${t.padEnd(28)} -> FA resized ${faUpd}, PCM resized ${pcmUpd}, already-correct ${bothSkipped} (${r.rows.length} total)`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
