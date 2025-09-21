const express = require('express');
const router = express.Router();

// Root route - API status
router.get('/', (req, res) => {
  res.json({
    message: 'Crowd Events Platform API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      events: '/api/events',
      finance: '/api/finance',
      apps: '/api/apps',
      dashboard: '/api/dashboard',
      organizer: '/api/organizer',
      monetize: '/api/monetize'
    },
    documentation: 'API endpoints available - see /api/health for detailed info'
  });
});

module.exports = router;