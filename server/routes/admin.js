const express = require('express');
const router = express.Router();
const {
    adminLogin,
    requireAdminAuth,
    validateAdminSession,
    changeAdminPassword,
    adminLoginRateLimit
} = require('../middleware/adminAuth');

// Admin login endpoint
router.post('/login', adminLoginRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const result = await adminLogin(username, password);

        if (result.success) {
            res.json({
                success: true,
                message: 'Admin login successful',
                token: result.token,
                admin: result.admin
            });
        } else {
            res.status(401).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Validate admin session
router.get('/validate', requireAdminAuth, validateAdminSession);

// Admin logout (client-side token removal)
router.post('/logout', requireAdminAuth, (req, res) => {
    res.json({
        success: true,
        message: 'Admin logged out successfully'
    });
});

// Change admin password
router.post('/change-password', requireAdminAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        const result = await changeAdminPassword(currentPassword, newPassword);

        if (result.success) {
            res.json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.error
            });
        }
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password change failed'
        });
    }
});

// Get admin info
router.get('/profile', requireAdminAuth, (req, res) => {
    res.json({
        success: true,
        admin: req.admin
    });
});

module.exports = router;