const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Academy dashboard stats endpoint
// This can be extended to fetch data from GHL API or your database
router.get('/stats', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for academy stats
    // You can extend this to fetch from GHL API or your database
    
    // Example: Return placeholder stats that can be replaced with real data
    const stats = {
      total_students: 0,
      active_courses: 0,
      completion_rate: 0,
      revenue: 0,
      new_enrollments: 0,
      pending_assessments: 0,
    };

    return res.json({
      stats,
      embeddedUrl: 'https://app.ebright.my/v2/location/uCIrspLXxSiM9hj1g1sd/dashboard',
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

// Get academy courses
router.get('/courses', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for courses data
    const courses = [];
    
    return res.json({ courses });
  } catch (err) {
    return next(err);
  }
});

// Get academy students
router.get('/students', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for students data
    const students = [];
    
    return res.json({ students });
  } catch (err) {
    return next(err);
  }
});

module.exports = { academyRouter: router };