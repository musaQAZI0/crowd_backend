const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get all registered users
router.get('/all', async (req, res) => {
  try {
    const users = await User.find({ accountStatus: 'active' })
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
});

// Default users route
router.get('/', (req, res) => {
  res.json({
    message: 'Users API - Available endpoints',
    endpoints: {
      '/all': 'GET - Get all active users',
      '/profile': 'GET - Get user profile (coming soon)'
    }
  });
});

// Placeholder for user routes
router.get('/profile', (req, res) => {
  res.json({ message: 'User profile endpoint - coming soon' });
});

module.exports = router;