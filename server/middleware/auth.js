const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Consistent fallback secrets for development/production without env vars
const JWT_SECRET = process.env.JWT_SECRET || 'crowd-app-jwt-secret-key-2025-fallback';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'crowd-app-refresh-secret-key-2025-fallback';

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password -refreshTokens');

    if (!user || user.accountStatus !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password -refreshTokens');

      if (user && user.accountStatus === 'active') {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    next();
  }
};

const requireOrganizer = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.user.isOrganizer) {
      return res.status(403).json({
        success: false,
        message: 'Organizer privileges required'
      });
    }

    next();
  } catch (error) {
    console.error('Organizer authorization error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization failed'
    });
  }
};

const requireVerified = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required'
      });
    }

    next();
  } catch (error) {
    console.error('Verification check error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification check failed'
    });
  }
};

const requireActiveAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.accountStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    next();
  } catch (error) {
    console.error('Account status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Account status check failed'
    });
  }
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

const verifyRefreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const tokenExists = user.refreshTokens.some(t => t.token === token);
    if (!tokenExists) {
      throw new Error('Token not found');
    }

    return user;
  } catch (error) {
    throw error;
  }
};

const rateLimit = (requests = 100, windowMs = 15 * 60 * 1000) => {
  const clients = new Map();

  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!clients.has(clientId)) {
      clients.set(clientId, []);
    }

    const requestTimestamps = clients.get(clientId);
    const recentRequests = requestTimestamps.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length >= requests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    recentRequests.push(now);
    clients.set(clientId, recentRequests);

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireOrganizer,
  requireVerified,
  requireActiveAccount,
  generateTokens,
  verifyRefreshToken,
  rateLimit
};