const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Validation schema for creating/updating events
const eventSchema = z.object({
  event_name: z.string().min(1, 'Event name is required').max(255),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid start date format'),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid end date format'),
  location: z.string().max(500).optional().default(''),
  organizers: z.string().max(500).optional().default(''),
}).refine(data => new Date(data.date_to) >= new Date(data.date_from), {
  message: "End date must be after or equal to start date",
  path: ["date_to"],
});

// GET /api/events - List all events
router.get('/', requireAuth, requireRole(['super_admin', 'ceo', 'academy', 'marketing', 'od', 'rm']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.event_name, e.date_from::date as date_from, e.date_to::date as date_to, e.location, e.organizers, e.created_at, e.updated_at, u.full_name as creator_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.date_from DESC, e.created_at DESC
    `);
    res.json({ events: result.rows });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/events - Create new event
router.post('/', requireAuth, requireRole(['super_admin', 'ceo', 'academy']), async (req, res) => {
  try {
    const data = eventSchema.parse(req.body);
    
    const result = await pool.query(
      `INSERT INTO events (event_name, date_from, date_to, location, organizers, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, event_name, date_from::date as date_from, date_to::date as date_to, location, organizers`,
      [data.event_name, data.date_from, data.date_to, data.location || '', data.organizers || '', req.user.sub]
    );
    
    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/:id - Get single event
router.get('/:id', requireAuth, requireRole(['super_admin', 'ceo', 'academy', 'marketing', 'od', 'rm']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.event_name, e.date_from, e.date_to, e.location, e.organizers, e.created_at, e.updated_at, u.full_name as creator_name
       FROM events e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({ event: result.rows[0] });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', requireAuth, requireRole(['super_admin', 'ceo', 'academy', 'marketing']), async (req, res) => {
  try {
    const data = eventSchema.parse(req.body);
    
    // Check if event exists
    const checkResult = await pool.query(
      'SELECT created_by FROM events WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Allow if: super_admin, ceo, academy, marketing, or creator
    const isCreator = checkResult.rows[0].created_by === req.user.sub;
    const isAllowedRole = ['super_admin', 'ceo', 'academy', 'marketing'].includes(req.user.role);
    
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }
    
    const result = await pool.query(
      `UPDATE events 
       SET event_name = $1, date_from = $2, date_to = $3, location = $4, 
           organizers = $5, updated_at = now()
       WHERE id = $6
       RETURNING id, event_name, date_from::date as date_from, date_to::date as date_to, location, organizers`,
      [data.event_name, data.date_from, data.date_to, data.location || '', data.organizers || '', req.params.id]
    );
    
    res.json({ event: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', requireAuth, requireRole(['super_admin', 'ceo', 'academy', 'marketing']), async (req, res) => {
  try {
    // Check if event exists
    const checkResult = await pool.query(
      'SELECT created_by FROM events WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Allow if: super_admin, ceo, academy, marketing, or creator
    const isCreator = checkResult.rows[0].created_by === req.user.sub;
    const isAllowedRole = ['super_admin', 'ceo', 'academy', 'marketing'].includes(req.user.role);
    
    if (!isCreator && !isAllowedRole) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }
    
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { eventsRouter: router };
