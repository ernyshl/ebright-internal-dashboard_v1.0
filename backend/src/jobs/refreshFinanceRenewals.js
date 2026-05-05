const cron = require('node-cron');
const { pool } = require('../db');

const ADVISORY_LOCK_KEY = 7426519; // arbitrary constant, namespaces this job

async function logRun(client, fields) {
  await client.query(
    `INSERT INTO finance_renewals_refresh_log
       (source_max_last_modified, rows_upserted, rows_deleted, duration_ms, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      fields.sourceMax || null,
      fields.rowsUpserted || 0,
      fields.rowsDeleted || 0,
      fields.durationMs || 0,
      fields.status,
      fields.errorMessage || null,
    ]
  );
}

async function refreshFinanceRenewals() {
  const start = Date.now();
  let client = null;
  let didCommit = false;
  try {
    client = await pool.connect();

    // 1. Acquire advisory lock (prevents concurrent runs after a deploy hiccup).
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [ADVISORY_LOCK_KEY]
    );
    if (!lockResult.rows[0].got) {
      await logRun(client, { status: 'skipped_locked', durationMs: Date.now() - start });
      console.log('[finance-renewals] skipped — another run holds the advisory lock');
      return;
    }

    try {
      // 2. Read current MAX(last_modified) from autocount_invoices.
      const sourceCheck = await client.query(
        'SELECT MAX(last_modified) AS max_lm FROM autocount_invoices'
      );
      const currentMax = sourceCheck.rows[0].max_lm;

      // 3. Read MAX(last_modified) seen on the most recent successful run.
      const lastRun = await client.query(
        `SELECT source_max_last_modified
         FROM finance_renewals_refresh_log
         WHERE status = 'ok'
         ORDER BY ran_at DESC
         LIMIT 1`
      );
      const lastSeen = lastRun.rows[0]?.source_max_last_modified || null;

      // 4. Skip if unchanged.
      if (lastSeen && currentMax && new Date(lastSeen).getTime() === new Date(currentMax).getTime()) {
        await logRun(client, {
          sourceMax: currentMax,
          status: 'skipped_unchanged',
          durationMs: Date.now() - start,
        });
        console.log('[finance-renewals] skipped — autocount_invoices unchanged since last run');
        return;
      }

      // 5. Parse + upsert + delete-stale, all in one transaction.
      await client.query('BEGIN');

      const upsertResult = await client.query(`
        INSERT INTO finance_renewals
          (doc_no, doc_date, branch_code, package, amount,
           student_name, raw_description, detail_key, student_index, source_last_modified)
        SELECT
          ai.doc_no,
          ai.doc_date::date,
          TRIM(REGEXP_REPLACE(TRIM(d->>'deptNo'), '^[0-9]+', '')),
          TRIM(SPLIT_PART(d->>'description', ',', 2)),
          ROUND(
            (d->>'subTotal')::numeric
            / GREATEST(
                ARRAY_LENGTH(
                  REGEXP_SPLIT_TO_ARRAY(TRIM(SPLIT_PART(d->>'description', ',', 1)), '\\s*&\\s*'),
                  1
                ),
                1
              ),
            2
          ),
          TRIM(s.student_name),
          d->>'description',
          (d->>'dtlKey')::bigint,
          s.idx::int,
          ai.last_modified
        FROM autocount_invoices ai,
             LATERAL jsonb_array_elements(ai.data->'details') AS d,
             LATERAL REGEXP_SPLIT_TO_TABLE(
               TRIM(SPLIT_PART(d->>'description', ',', 1)),
               '\\s*&\\s*'
             ) WITH ORDINALITY AS s(student_name, idx)
        WHERE ai.doc_type = 'Invoice'
          AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
          AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
          AND TRIM(d->>'deptNo') ~ '^[0-9]+[A-Z]+$'
          AND d->>'dtlKey' IS NOT NULL
        ON CONFLICT (doc_no, detail_key, student_index) DO UPDATE SET
          doc_date             = EXCLUDED.doc_date,
          branch_code          = EXCLUDED.branch_code,
          package              = EXCLUDED.package,
          amount               = EXCLUDED.amount,
          student_name         = EXCLUDED.student_name,
          raw_description      = EXCLUDED.raw_description,
          source_last_modified = EXCLUDED.source_last_modified,
          parsed_at            = NOW()
      `);

      const deleteResult = await client.query(`
        DELETE FROM finance_renewals fr
        WHERE NOT EXISTS (
          SELECT 1
          FROM autocount_invoices ai,
               LATERAL jsonb_array_elements(ai.data->'details') AS d,
               LATERAL REGEXP_SPLIT_TO_TABLE(
                 TRIM(SPLIT_PART(d->>'description', ',', 1)),
                 '\\s*&\\s*'
               ) WITH ORDINALITY AS s(student_name, idx)
          WHERE ai.doc_no = fr.doc_no
            AND (d->>'dtlKey')::bigint = fr.detail_key
            AND s.idx::int = fr.student_index
            AND ai.doc_type = 'Invoice'
            AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
            AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
            AND TRIM(d->>'deptNo') ~ '^[0-9]+[A-Z]+$'
        )
      `);

      await client.query('COMMIT');
      didCommit = true;

      await logRun(client, {
        sourceMax: currentMax,
        rowsUpserted: upsertResult.rowCount,
        rowsDeleted: deleteResult.rowCount,
        durationMs: Date.now() - start,
        status: 'ok',
      });

      console.log(
        `[finance-renewals] OK — upserted ${upsertResult.rowCount}, deleted ${deleteResult.rowCount}, ${Date.now() - start}ms`
      );
    } finally {
      // 6. Always release the advisory lock.
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
      } catch (unlockErr) {
        // If we already committed, the work is safe — just warn and move on.
        // If we did not commit, the outer catch will handle the original error.
        console.warn('[finance-renewals] advisory unlock failed:', unlockErr.message);
      }
    }
  } catch (err) {
    if (didCommit) {
      // Work is already committed and logged 'ok'. Don't overwrite as error.
      console.error('[finance-renewals] post-commit error (work is safe):', err.message);
      return;
    }
    // Roll back if a transaction is open. Harmless when none is open.
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      try {
        await logRun(client, {
          durationMs: Date.now() - start,
          status: 'error',
          errorMessage: err.message,
        });
      } catch (logErr) {
        console.error('[finance-renewals] failed to log error:', logErr.message);
      }
    }
    console.error('[finance-renewals] FAILED:', err.message);
  } finally {
    client?.release();
  }
}

function startFinanceRenewalsRefreshJob() {
  // Every 15 minutes
  cron.schedule('*/15 * * * *', refreshFinanceRenewals);

  // Run once on startup so the table is fresh after a deploy
  refreshFinanceRenewals();

  console.log('[finance-renewals] Scheduler started — every 15 minutes');
}

module.exports = { startFinanceRenewalsRefreshJob, refreshFinanceRenewals };
