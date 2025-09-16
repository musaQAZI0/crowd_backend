const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Admin credentials - In production, these should be environment variables
const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'CrowdAdmin2024!', // Change this in production
    email: process.env.ADMIN_EMAIL || 'admin@crowd.com'
};

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'crowd-admin-secret-key-2025';

// Admin login function
const adminLogin = async (username, password) => {
    try {
        // Check credentials
        if (username !== ADMIN_CREDENTIALS.username) {
            throw new Error('Invalid credentials');
        }

        // For initial setup, check plain text password
        // In production, this should be bcrypt hashed
        const isValidPassword = password === ADMIN_CREDENTIALS.password ||
                               await bcrypt.compare(password, ADMIN_CREDENTIALS.password);

        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // Generate admin token
        const token = jwt.sign(
            {
                adminId: 'admin-user',
                username: ADMIN_CREDENTIALS.username,
                email: ADMIN_CREDENTIALS.email,
                isAdmin: true,
                type: 'admin'
            },
            ADMIN_JWT_SECRET,
            { expiresIn: '8h' } // 8 hour sessions for admin
        );

        return {
            success: true,
            token,
            admin: {
                username: ADMIN_CREDENTIALS.username,
                email: ADMIN_CREDENTIALS.email,
                isAdmin: true
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

// Admin authentication middleware
const requireAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Admin access token required'
            });
        }

        // Verify admin token
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);

        if (!decoded.isAdmin || decoded.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        // Attach admin info to request
        req.admin = {
            id: decoded.adminId,
            username: decoded.username,
            email: decoded.email,
            isAdmin: true
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin token'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Admin session expired'
            });
        }

        console.error('Admin authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Admin authentication failed'
        });
    }
};

// Optional admin auth - doesn't fail if no token
const optionalAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, ADMIN_JWT_SECRET);

            if (decoded.isAdmin && decoded.type === 'admin') {
                req.admin = {
                    id: decoded.adminId,
                    username: decoded.username,
                    email: decoded.email,
                    isAdmin: true
                };
            }
        }

        next();
    } catch (error) {
        // Continue without admin auth if token is invalid
        next();
    }
};

// Check if user is admin (for mixed auth scenarios)
const isAdminUser = (req) => {
    return req.admin && req.admin.isAdmin;
};

// Validate admin session
const validateAdminSession = async (req, res, next) => {
    try {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'No admin session found'
            });
        }

        // Admin session is valid
        res.json({
            success: true,
            admin: req.admin
        });
    } catch (error) {
        console.error('Admin session validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Session validation failed'
        });
    }
};

// Change admin password
const changeAdminPassword = async (currentPassword, newPassword) => {
    try {
        // Verify current password
        const isValidCurrent = currentPassword === ADMIN_CREDENTIALS.password ||
                              await bcrypt.compare(currentPassword, ADMIN_CREDENTIALS.password);

        if (!isValidCurrent) {
            throw new Error('Current password is incorrect');
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // In a real application, you would update this in a database
        // For now, we'll just log it and recommend updating environment variables
        console.log('New admin password hash:', hashedPassword);
        console.log('Please update your ADMIN_PASSWORD environment variable with this hash');

        return {
            success: true,
            message: 'Password updated successfully. Please update environment variables.'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

// Rate limiting for admin login attempts
const adminLoginAttempts = new Map();

const adminLoginRateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    if (!adminLoginAttempts.has(clientIP)) {
        adminLoginAttempts.set(clientIP, []);
    }

    const attempts = adminLoginAttempts.get(clientIP);

    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
    adminLoginAttempts.set(clientIP, recentAttempts);

    if (recentAttempts.length >= maxAttempts) {
        return res.status(429).json({
            success: false,
            message: 'Too many admin login attempts. Please try again later.',
            retryAfter: Math.ceil(windowMs / 1000)
        });
    }

    // Record this attempt
    recentAttempts.push(now);
    adminLoginAttempts.set(clientIP, recentAttempts);

    next();
};

module.exports = {
    adminLogin,
    requireAdminAuth,
    optionalAdminAuth,
    isAdminUser,
    validateAdminSession,
    changeAdminPassword,
    adminLoginRateLimit,
    ADMIN_CREDENTIALS // Export for setup/testing purposes only
};