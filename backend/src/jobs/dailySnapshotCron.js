const cron = require('node-cron');
const { captureFaSnapshot } = require('../services/faSnapshotService');
const { capturePcmSnapshot } = require('../services/pcmSnapshotService');

async function runDailySnapshot() {
  const start = Date.now();
  console.log('[daily-snapshot] starting at', new Date().toISOString());

  try {
    const fa = await captureFaSnapshot();
    console.log(`[daily-snapshot] FA captured — ${fa.branches} branches → ${fa.table} for ${fa.date}`);
  } catch (err) {
    console.error('[daily-snapshot] FA capture FAILED:', err.message);
  }

  try {
    const pcm = await capturePcmSnapshot();
    console.log(`[daily-snapshot] PCM captured — ${pcm.branches} branches → ${pcm.table} for ${pcm.date}`);
  } catch (err) {
    console.error('[daily-snapshot] PCM capture FAILED:', err.message);
  }

  console.log(`[daily-snapshot] done in ${Date.now() - start}ms`);
}

function startDailySnapshotJob() {
  // 23:59 every day, Asia/Kuala_Lumpur
  cron.schedule('59 23 * * *', runDailySnapshot, {
    timezone: 'Asia/Kuala_Lumpur',
  });
  console.log('[daily-snapshot] scheduled for 23:59 Asia/Kuala_Lumpur');
}

module.exports = { startDailySnapshotJob, runDailySnapshot };
