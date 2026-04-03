const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All device management requires super_admin
router.use(requireAuth, requireRole(['super_admin']));

// GET /api/devices — list all devices
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, device_name, api_key, view_key, is_active, last_seen, created_at FROM dashboard_devices ORDER BY created_at DESC',
    );
    return res.json({ devices: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/devices — create a new device
router.post('/', async (req, res, next) => {
  try {
    const { device_name, view_key } = req.body;
    if (!device_name || !view_key) {
      return res.status(400).json({ error: 'device_name and view_key are required' });
    }
    const { rows } = await pool.query(
      'INSERT INTO dashboard_devices (device_name, view_key) VALUES ($1, $2) RETURNING id, device_name, api_key, view_key, is_active, created_at',
      [device_name.trim(), view_key.trim()],
    );
    return res.status(201).json({ device: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/devices/:id — update device_name or view_key
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { device_name, view_key, is_active } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (device_name !== undefined) { fields.push(`device_name = $${idx++}`); values.push(device_name.trim()); }
    if (view_key !== undefined)    { fields.push(`view_key = $${idx++}`); values.push(view_key.trim()); }
    if (is_active !== undefined)   { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE dashboard_devices SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, device_name, api_key, view_key, is_active, last_seen, created_at`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ device: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/devices/:id — permanently delete a device
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM dashboard_devices WHERE id = $1 RETURNING id',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { devicesRouter: router };
