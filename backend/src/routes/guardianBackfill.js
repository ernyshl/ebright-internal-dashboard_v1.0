const express = require('express');
const { z } = require('zod');
const { backfillGuardianInfo } = require('../services/guardianBackfill');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const rowSchema = z.object({
  name: z.string().min(1, 'name is required'),
  guardianName: z.string().optional(),
  guardianMobile: z.string().optional(),
}).passthrough();

const backfillSchema = z.object({
  rows: z.array(rowSchema).min(1, 'rows must be a non-empty array'),
  branch: z.string().min(1, 'branch is required'),
});

// ── POST /api/guardian-backfill/backfill ─────────────────────────────────────

router.post('/backfill', async (req, res, next) => {
  try {
    const { rows, branch } = backfillSchema.parse(req.body);
    const result = await backfillGuardianInfo(rows, branch);
    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(err);
    // eslint-disable-next-line no-console
    console.error('[guardian-backfill] failed:', err);
    return res.status(500).json({ error: err?.message || 'Guardian backfill failed' });
  }
});

module.exports = { guardianBackfillRouter: router };
