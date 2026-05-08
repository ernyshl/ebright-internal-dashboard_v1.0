const express = require('express');
const { z } = require('zod');
const { categorizeUpload } = require('../services/uploadComparison');
const { executeUpload } = require('../services/uploadExecution');

const router = express.Router();

const excelRowSchema = z.object({
  name: z.string().min(1, 'name is required'),
  gender: z.string().optional(),
  enrollmentDate: z.string().optional(),
  status: z.string().optional(),
  grade: z.string().optional(),
  chapter: z.string().optional(),
  branch: z.string().optional(),
}).passthrough();

const previewSchema = z.object({
  rows: z.array(excelRowSchema),
  branch: z.string().min(1, 'branch is required'),
});

const confirmSchema = z.object({
  categorized: z.object({
    new: z.array(z.any()).optional(),
    restore: z.array(z.any()).optional(),
    matched: z.array(z.any()).optional(),
    archive: z.array(z.any()).optional(),
  }).passthrough(),
  branch: z.string().min(1, 'branch is required'),
});

function namesOf(arr, picker) {
  if (!Array.isArray(arr)) return [];
  return arr.map(picker).filter(n => typeof n === 'string' && n.length > 0);
}

// ── POST /api/student-upload/preview-upload ─────────────────────────────────

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

router.post('/preview-upload', async (req, res, next) => {
  try {
    const { rows, branch } = previewSchema.parse(req.body);
    const categorized = await categorizeUpload(rows, branch);

    // From the matched bucket, count how many would actually get guardian fields filled.
    const guardianFillNames = [];
    for (const item of categorized.matched) {
      const e = item?.excel || {};
      const d = item?.db    || {};
      const needsName   = isBlank(d.guardian_name)   && !isBlank(e.guardianName);
      const needsMobile = isBlank(d.guardian_mobile) && !isBlank(e.guardianMobile);
      if (needsName || needsMobile) guardianFillNames.push(e.name);
    }

    return res.json({
      summary: {
        new:            categorized.new.length,
        restore:        categorized.restore.length,
        matched:        categorized.matched.length,
        guardianFill:   guardianFillNames.length,
        archive:        categorized.archive.length,
      },
      details: {
        newNames:           namesOf(categorized.new,     r => r?.name),
        restoreNames:       namesOf(categorized.restore, r => r?.excel?.name),
        matchedNames:       namesOf(categorized.matched, r => r?.excel?.name),
        guardianFillNames,
        archiveNames:       namesOf(categorized.archive, r => r?.name),
      },
      payload: categorized,
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/student-upload/confirm-upload ─────────────────────────────────

router.post('/confirm-upload', async (req, res, next) => {
  try {
    const { categorized, branch } = confirmSchema.parse(req.body);
    const result = await executeUpload(categorized, branch);
    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(err);
    // eslint-disable-next-line no-console
    console.error('[confirm-upload] failed:', err);
    return res.status(500).json({ error: err?.message || 'Upload execution failed' });
  }
});

module.exports = { studentUploadRouter: router };
