const express = require('express');
const { prisma } = require('../prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'od', 'academy', 'tv'];

// GET /api/fa-dashboard — fetch all 20 branch rows (public, no auth needed for read)
router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.fa_dashboard_data.findMany({
      select: {
        branch_code: true,
        fa_active: true,
        inv_apr1819: true,
        inv_apr2526: true,
        backlog: true,
        updated_at: true,
        updated_by: true,
      },
      orderBy: { branch_code: 'asc' },
    });
    return res.json({ data: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/fa-dashboard/save — upsert all 20 rows at once
router.post('/save', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  const { rows } = req.body;
  const updatedBy = req.user?.email || req.user?.sub || 'unknown';

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  // Validate all rows first
  for (const row of rows) {
    const { branch_code, fa_active, inv_apr1819, inv_apr2526 } = row;
    if (
      typeof branch_code !== 'string' ||
      !Number.isInteger(fa_active) || fa_active < 0 ||
      !Number.isInteger(inv_apr1819) || inv_apr1819 < 0 ||
      !Number.isInteger(inv_apr2526) || inv_apr2526 < 0
    ) {
      return res.status(400).json({ error: `Invalid data for branch: ${branch_code}` });
    }
  }

  try {
    // Upsert each row using Prisma in a transaction
    await prisma.$transaction(
      rows.map(({ branch_code, fa_active, inv_apr1819, inv_apr2526 }) => {
        const backlog = Math.max(0, fa_active - inv_apr1819 - inv_apr2526);
        return prisma.fa_dashboard_data.upsert({
          where: { branch_code },
          update: {
            fa_active,
            inv_apr1819,
            inv_apr2526,
            backlog,
            updated_at: new Date(),
            updated_by: updatedBy,
          },
          create: {
            branch_code,
            fa_active,
            inv_apr1819,
            inv_apr2526,
            backlog,
            updated_at: new Date(),
            updated_by: updatedBy,
          },
        });
      })
    );

    // Return updated data
    const updated = await prisma.fa_dashboard_data.findMany({
      select: {
        branch_code: true,
        fa_active: true,
        inv_apr1819: true,
        inv_apr2526: true,
        backlog: true,
        updated_at: true,
        updated_by: true,
      },
      orderBy: { branch_code: 'asc' },
    });

    return res.json({ ok: true, data: updated });
  } catch (err) {
    return next(err);
  }
});

module.exports = { faDashboardRouter: router };
