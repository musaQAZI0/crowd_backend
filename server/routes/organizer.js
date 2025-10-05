const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   GET /api/organizer/profile
 * @desc    Get current user's organizer profile
 * @access  Private
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('organizerProfile isOrganizer');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      organizerProfile: user.organizerProfile || {},
      isOrganizer: user.isOrganizer
    });
  } catch (error) {
    console.error('Error fetching organizer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/organizer/profile
 * @desc    Create or update organizer profile
 * @access  Private
 */
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      bio,
      eventDescription,
      website,
      profileImage,
      logo,
      urlSlug,
      socialMedia,
      companyName,
      organizationName,
      preferredCountry,
      emailOptIn
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Organizer name is required'
      });
    }

    // Check if urlSlug is unique (if provided and different from current)
    if (urlSlug) {
      const existingUser = await User.findOne({
        'organizerProfile.urlSlug': urlSlug,
        _id: { $ne: req.user.id }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This URL slug is already taken'
        });
      }
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update organizer profile
    user.organizerProfile = {
      ...user.organizerProfile,
      name,
      bio,
      eventDescription,
      website,
      profileImage,
      logo,
      urlSlug: urlSlug || user.organizerProfile?.urlSlug || user._id.toString(),
      socialMedia: {
        facebook: socialMedia?.facebook || user.organizerProfile?.socialMedia?.facebook || '',
        twitter: socialMedia?.twitter || user.organizerProfile?.socialMedia?.twitter || '',
        instagram: socialMedia?.instagram || user.organizerProfile?.socialMedia?.instagram || '',
        linkedin: socialMedia?.linkedin || user.organizerProfile?.socialMedia?.linkedin || ''
      },
      companyName,
      organizationName,
      preferredCountry,
      emailOptIn: emailOptIn !== undefined ? emailOptIn : user.organizerProfile?.emailOptIn || false,
      updatedAt: new Date()
    };

    // Set isOrganizer to true if creating first time
    if (!user.isOrganizer) {
      user.isOrganizer = true;
      user.organizerProfile.createdAt = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: 'Organizer profile updated successfully',
      organizerProfile: user.organizerProfile
    });
  } catch (error) {
    console.error('Error updating organizer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/organizer/profile
 * @desc    Update specific organizer profile fields
 * @access  Private
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check urlSlug uniqueness if being updated
    if (updates.urlSlug && updates.urlSlug !== user.organizerProfile?.urlSlug) {
      const existingUser = await User.findOne({
        'organizerProfile.urlSlug': updates.urlSlug,
        _id: { $ne: req.user.id }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This URL slug is already taken'
        });
      }
    }

    // Merge updates
    user.organizerProfile = {
      ...user.organizerProfile,
      ...updates,
      updatedAt: new Date()
    };

    await user.save();

    res.json({
      success: true,
      message: 'Organizer profile updated successfully',
      organizerProfile: user.organizerProfile
    });
  } catch (error) {
    console.error('Error updating organizer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/organizer/profile
 * @desc    Delete organizer profile
 * @access  Private
 */
router.delete('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reset organizer profile
    user.organizerProfile = undefined;
    user.isOrganizer = false;

    await user.save();

    res.json({
      success: true,
      message: 'Organizer profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting organizer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/organizer/profile/:urlSlug
 * @desc    Get organizer profile by URL slug (public)
 * @access  Public
 */
router.get('/profile/:urlSlug', async (req, res) => {
  try {
    const { urlSlug } = req.params;

    const user = await User.findOne({
      'organizerProfile.urlSlug': urlSlug
    }).select('organizerProfile firstName lastName profilePicture eventsOrganized');

    if (!user || !user.organizerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Organizer profile not found'
      });
    }

    res.json({
      success: true,
      organizerProfile: user.organizerProfile,
      userName: `${user.firstName} ${user.lastName}`,
      profilePicture: user.profilePicture,
      totalEvents: user.eventsOrganized?.length || 0
    });
  } catch (error) {
    console.error('Error fetching organizer profile by slug:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/organizer/check-slug/:urlSlug
 * @desc    Check if URL slug is available
 * @access  Private
 */
router.get('/check-slug/:urlSlug', authenticateToken, async (req, res) => {
  try {
    const { urlSlug } = req.params;

    const existingUser = await User.findOne({
      'organizerProfile.urlSlug': urlSlug,
      _id: { $ne: req.user.id }
    });

    res.json({
      success: true,
      available: !existingUser,
      message: existingUser ? 'URL slug is already taken' : 'URL slug is available'
    });
  } catch (error) {
    console.error('Error checking URL slug:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;