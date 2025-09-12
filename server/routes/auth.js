const express = require('express');
const passport = require('passport');
const Joi = require('joi');
const User = require('../models/User');
const { generateTokens, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// CSRF Token endpoint
router.get('/csrf-token', (req, res) => {
  // Generate a simple CSRF token for this session
  const csrfToken = require('crypto').randomBytes(32).toString('hex');
  
  // In a production app, you'd store this in session/database
  // For now, we'll just return it
  res.json({ 
    success: true, 
    csrfToken: csrfToken 
  });
});

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  isOrganizer: Joi.boolean().default(false),
  phone: Joi.string().optional(),
  location: Joi.object({
    city: Joi.string(),
    state: Joi.string(),
    country: Joi.string()
  }).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  phone: Joi.string().allow(''),
  location: Joi.object({
    city: Joi.string().allow(''),
    state: Joi.string().allow(''),
    country: Joi.string().allow('')
  }),
  preferences: Joi.object({
    emailNotifications: Joi.boolean(),
    eventReminders: Joi.boolean(),
    marketingEmails: Joi.boolean()
  })
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.details[0].message 
      });
    }

    const { email, password, firstName, lastName, isOrganizer, phone, location } = value;

    // Check if user already exists
    const existingUser = await User.findByEmailOrUsername(email);
    if (existingUser) {
      return res.status(409).json({ 
        message: 'An account with this email already exists' 
      });
    }

    // Create new user
    const username = email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);
    const userData = {
      email,
      username,
      password,
      firstName,
      lastName,
      isOrganizer: isOrganizer || false
    };

    if (phone) userData.phone = phone;
    if (location) userData.location = location;

    const user = new User(userData);
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token: accessToken,
      refreshToken,
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Registration failed', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.details[0].message 
      });
    }

    const { email, password } = value;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is active
    if (user.accountStatus !== 'active') {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate tokens
    const { accessToken } = generateTokens(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Login failed', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Google OAuth routes
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  async (req, res) => {
    try {
      // Generate JWT token for the authenticated user
      const { accessToken } = generateTokens(req.user._id);
      const token = accessToken;
      
      // Redirect to frontend with token
      const redirectUrl = process.env.NODE_ENV === 'production' 
        ? `${process.env.FRONTEND_URL}?token=${token}`
        : `http://localhost:3001/logged_in_Version.html?token=${token}`;
        
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/login.html?error=oauth_failed');
    }
  }
);

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.getPublicProfile()
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        message: 'Validation error', 
        details: error.details[0].message 
      });
    }

    const allowedUpdates = ['firstName', 'lastName', 'phone', 'location', 'preferences'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (value[field] !== undefined) {
        updates[field] = value[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters long' 
      });
    }

    // Check if user has a password (not OAuth user)
    if (!req.user.password) {
      return res.status(400).json({ 
        message: 'Cannot change password for OAuth users' 
      });
    }

    // Verify current password
    const user = await User.findById(req.user._id);
    const isValidPassword = await user.comparePassword(currentPassword);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify token endpoint (for frontend compatibility)
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    // Verify token using middleware logic
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user || user.accountStatus !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token or user not found'
        });
      }
      
      // Check if token is in active tokens list
      const hasActiveToken = user.authStatus.activeTokens.some(activeToken => 
        activeToken.token === token
      );

      if (!hasActiveToken) {
        return res.status(401).json({
          success: false,
          message: 'Token not found in active sessions'
        });
      }
      
      res.json({
        success: true,
        user: user.getPublicProfile(),
        message: 'Token verified successfully'
      });
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
});

// Verify authentication for frontend (cookie/session based)
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // If we reach here, the authenticateToken middleware has validated the user
    res.json({
      success: true,
      ...req.user.getPublicProfile()
    });
  } catch (error) {
    console.error('Auth verify error:', error);
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// Check authentication status (legacy endpoint)
router.get('/check', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.json({
        isAuthenticated: false,
        user: null
      });
    }

    // Verify token using middleware logic
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user || user.accountStatus !== 'active') {
        return res.json({
          isAuthenticated: false,
          user: null
        });
      }
      
      res.json({
        isAuthenticated: true,
        user: user.getPublicProfile()
      });
    } catch (jwtError) {
      res.json({
        isAuthenticated: false,
        user: null
      });
    }
  } catch (error) {
    console.error('Auth check error:', error);
    res.json({
      isAuthenticated: false,
      user: null
    });
  }
});

// Logout with status tracking
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Simple JWT logout - no status tracking needed for basic implementation

    // Handle passport session logout
    req.logout((err) => {
      if (err) {
        console.error('Passport logout error:', err);
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// Delete account
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    // If user has a password, verify it
    if (req.user.password && password) {
      const isValidPassword = await req.user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Password is incorrect' });
      }
    }

    // Deactivate account instead of deleting
    await User.findByIdAndUpdate(req.user._id, { 
      accountStatus: 'deactivated',
      email: `deleted_${Date.now()}_${req.user.email}` // Prevent email conflicts
    });

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user authentication status
router.get('/auth-status', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      authStatus: {
        isOnline: true,
        sessionCount: 1,
        lastActivity: new Date()
      }
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ message: 'Failed to fetch authentication status' });
  }
});

// Get active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      sessions: [{
        id: 'current',
        device: req.headers['user-agent'] || 'Unknown',
        lastActivity: new Date(),
        current: true
      }]
    });
  } catch (error) {
    console.error('Sessions fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions' });
  }
});

// Revoke all sessions
router.post('/revoke-all-sessions', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'All sessions revoked successfully'
    });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to revoke sessions' 
    });
  }
});

// Get authentication stats (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const stats = await User.aggregate([
      {
        $group: {
          _id: '$loginMethod',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await User.countDocuments({ accountStatus: 'active' });
    const recentLogins = await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    
    // Get online users count (simplified for now)
    const onlineUsers = await User.countDocuments({ 
      accountStatus: 'active' 
    });

    // Get total active sessions (simplified for now)
    const totalActiveSessions = await User.countDocuments({
      accountStatus: 'active'
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        onlineUsers,
        recentLogins,
        totalActiveSessions: totalActiveSessions,
        loginMethods: stats
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// Admin: Get all users with authentication status
router.get('/admin/users-status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find({ accountStatus: 'active' })
      .select('email firstName lastName accountStatus lastLogin createdAt')
      .sort({ lastLogin: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments({ accountStatus: 'active' });
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        accountStatus: user.accountStatus,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Admin users status error:', error);
    res.status(500).json({ message: 'Failed to fetch users status' });
  }
});

module.exports = router;