const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Validation schema for creating/updating events
const eventSchema = z.object({
  event_name: z.string().min(1, 'Event name is required'),
  date_from: z.string().min(1, 'Start date is required'),
  date_to: z.string().min(1, 'End date is required'),
  location: z.string().optional().default(''),
  organizers: z.string().optional().default(''),
});

// GET /api/events - List all events
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, u.full_name as creator_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.date_from DESC, e.created_at DESC
    `);
    res.json({ events: result.rows });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/events - Create new event
router.post('/', requireAuth, async (req, res) => {
  try {
    const data = eventSchema.parse(req.body);
    
    const result = await pool.query(
      `INSERT INTO events (event_name, date_from, date_to, location, organizers, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.event_name, data.date_from, data.date_to, data.location || '', data.organizers || '', req.user.sub]
    );
    
    res.status(201).json({ event: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// GET /api/events/:id - Get single event
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.full_name as creator_name
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
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const data = eventSchema.parse(req.body);
    
    // Check if event exists and user is creator or super_admin
    const checkResult = await pool.query(
      'SELECT created_by FROM events WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const isCreator = checkResult.rows[0].created_by === req.user.sub;
    const isSuperAdmin = req.user.role === 'super_admin';
    
    if (!isCreator && !isSuperAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }
    
    const result = await pool.query(
      `UPDATE events 
       SET event_name = $1, date_from = $2, date_to = $3, location = $4, 
           organizers = $5, updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [data.event_name, data.date_from, data.date_to, data.location || '', data.organizers || '', req.params.id]
    );
    
    res.json({ event: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // Check if event exists and user is creator or super_admin
    const checkResult = await pool.query(
      'SELECT created_by FROM events WHERE id = $1',
      [req.params.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const isCreator = checkResult.rows[0].created_by === req.user.sub;
    const isSuperAdmin = req.user.role === 'super_admin';
    
    if (!isCreator && !isSuperAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }
    
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = { eventsRouter: router };
