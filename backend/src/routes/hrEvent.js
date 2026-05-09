const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const READ_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];
const WRITE_ROLES = ['super_admin', 'hr'];

// GET /api/hr-event/venues — list all venue columns
router.get('/venues', requireAuth, requireRole(READ_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, venue_name, date_from, date_to, sheet_gids, actual_count, sort_order
       FROM hr_event_venues
       ORDER BY sort_order ASC, date_from ASC`
    );
    return res.json({ venues: rows });
  } catch (err) { return next(err); }
});

// POST /api/hr-event/venues — add a venue column
router.post('/venues', requireAuth, requireRole(WRITE_ROLES), async (req, res, next) => {
  try {
    const { venue_name, date_from, date_to, sheet_gids, actual_count, sort_order } = req.body;
    if (!venue_name) return res.status(400).json({ error: 'Venue name is required' });

    const { rows } = await pool.query(
      `INSERT INTO hr_event_venues (venue_name, date_from, date_to, sheet_gids, actual_count, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [venue_name.trim(), date_from || null, date_to || null, sheet_gids || '', actual_count || 0, sort_order || 0]
    );
    return res.status(201).json({ id: rows[0].id });
  } catch (err) { return next(err); }
});

// PUT /api/hr-event/venues/:id — update a venue column
router.put('/venues/:id', requireAuth, requireRole(WRITE_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { venue_name, date_from, date_to, sheet_gids, actual_count, sort_order } = req.body;

    const sets = []; const params = []; let idx = 1;
    if (venue_name !== undefined) { sets.push(`venue_name = $${idx++}`); params.push(venue_name.trim()); }
    if (date_from !== undefined) { sets.push(`date_from = $${idx++}`); params.push(date_from || null); }
    if (date_to !== undefined) { sets.push(`date_to = $${idx++}`); params.push(date_to || null); }
    if (sheet_gids !== undefined) { sets.push(`sheet_gids = $${idx++}`); params.push(sheet_gids); }
    if (actual_count !== undefined) { sets.push(`actual_count = $${idx++}`); params.push(Number(actual_count) || 0); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(Number(sort_order) || 0); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const { rowCount } = await pool.query(`UPDATE hr_event_venues SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: 'Venue not found' });
    return res.json({ message: 'Updated' });
  } catch (err) { return next(err); }
});

// DELETE /api/hr-event/venues/:id
router.delete('/venues/:id', requireAuth, requireRole(WRITE_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM hr_event_venues WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Venue not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) { return next(err); }
});

module.exports = { hrEventRouter: router };
