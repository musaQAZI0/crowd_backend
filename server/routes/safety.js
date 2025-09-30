const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { SafetyReport, Block, VerificationBadge } = require('../models/SafetyReport');
const User = require('../models/User');
const Event = require('../models/Event');
const Analytics = require('../models/Analytics');

// Report a User or Content
router.post('/reports', authenticateToken, async (req, res) => {
  try {
    const {
      reportedUserId,
      eventId,
      reportType,
      category,
      description,
      evidence
    } = req.body;

    // Validation
    if (!reportedUserId || !reportType || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'reportedUserId, reportType, category, and description are required'
      });
    }

    // Check if reported user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: 'Reported user not found'
      });
    }

    // Prevent self-reporting
    if (reportedUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report yourself'
      });
    }

    // Check for duplicate reports (same user reporting same user within 24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingReport = await SafetyReport.findOne({
      reportedBy: req.user.id,
      reportedUser: reportedUserId,
      createdAt: { $gte: last24h }
    });

    if (existingReport) {
      return res.status(429).json({
        success: false,
        message: 'You have already reported this user recently'
      });
    }

    const report = new SafetyReport({
      reportedBy: req.user.id,
      reportedUser: reportedUserId,
      eventId,
      reportType,
      category,
      description,
      evidence,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    await report.save();

    // Track in analytics
    const analytics = new Analytics({
      eventId: eventId || null,
      userId: req.user.id,
      sessionId: req.sessionID || 'anonymous',
      action: 'safety_report',
      metadata: {
        reportType,
        category,
        reportedUserId
      }
    });
    await analytics.save();

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report: {
        reportId: report.reportId,
        status: report.status
      }
    });
  } catch (error) {
    console.error('Error creating safety report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
});

// Block a User
router.post('/blocks', authenticateToken, async (req, res) => {
  try {
    const { blockedUserId, reason, eventId } = req.body;

    if (!blockedUserId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'blockedUserId and reason are required'
      });
    }

    // Check if user exists
    const blockedUser = await User.findById(blockedUserId);
    if (!blockedUser) {
      return res.status(404).json({
        success: false,
        message: 'User to block not found'
      });
    }

    // Prevent self-blocking
    if (blockedUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself'
      });
    }

    // Check if already blocked
    const existingBlock = await Block.findOne({
      blockerId: req.user.id,
      blockedId: blockedUserId,
      isActive: true
    });

    if (existingBlock) {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked'
      });
    }

    const block = new Block({
      blockerId: req.user.id,
      blockedId: blockedUserId,
      reason,
      eventId
    });

    await block.save();

    res.status(201).json({
      success: true,
      message: 'User blocked successfully',
      block: {
        id: block._id,
        blockedUser: {
          id: blockedUser._id,
          name: `${blockedUser.firstName} ${blockedUser.lastName}`
        },
        reason: block.reason
      }
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user'
    });
  }
});

// Unblock a User
router.delete('/blocks/:blockedUserId', authenticateToken, async (req, res) => {
  try {
    const { blockedUserId } = req.params;

    const block = await Block.findOneAndUpdate(
      {
        blockerId: req.user.id,
        blockedId: blockedUserId,
        isActive: true
      },
      { isActive: false },
      { new: true }
    );

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found'
      });
    }

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    });
  }
});

// Get User's Blocked Users
router.get('/blocks', authenticateToken, async (req, res) => {
  try {
    const blocks = await Block.find({
      blockerId: req.user.id,
      isActive: true
    })
    .populate('blockedId', 'firstName lastName email profilePicture')
    .populate('eventId', 'title')
    .sort({ createdAt: -1 });

    const blockedUsers = blocks.map(block => ({
      id: block._id,
      user: block.blockedId,
      reason: block.reason,
      event: block.eventId,
      blockedAt: block.createdAt
    }));

    res.json({
      success: true,
      blockedUsers
    });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blocked users'
    });
  }
});

// Check if User is Blocked
router.get('/blocks/check/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const isBlocked = await Block.findOne({
      blockerId: req.user.id,
      blockedId: userId,
      isActive: true
    });

    res.json({
      success: true,
      isBlocked: !!isBlocked
    });
  } catch (error) {
    console.error('Error checking block status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check block status'
    });
  }
});

// Apply for Verification Badge
router.post('/verification/apply', authenticateToken, async (req, res) => {
  try {
    const {
      badgeType,
      verificationData,
      metadata
    } = req.body;

    const validBadgeTypes = ['identity', 'business', 'background', 'social', 'trusted'];
    if (!validBadgeTypes.includes(badgeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid badge type'
      });
    }

    // Check if user already has this badge type
    const existingBadge = await VerificationBadge.findOne({
      userId: req.user.id,
      badgeType
    });

    if (existingBadge && ['verified', 'pending'].includes(existingBadge.status)) {
      return res.status(400).json({
        success: false,
        message: 'You already have this badge type applied or verified'
      });
    }

    const badge = new VerificationBadge({
      userId: req.user.id,
      badgeType,
      verificationData,
      metadata
    });

    await badge.save();

    res.status(201).json({
      success: true,
      message: 'Verification application submitted successfully',
      badge: {
        id: badge._id,
        badgeType: badge.badgeType,
        status: badge.status
      }
    });
  } catch (error) {
    console.error('Error applying for verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit verification application'
    });
  }
});

// Get User's Verification Badges
router.get('/verification/my-badges', authenticateToken, async (req, res) => {
  try {
    const badges = await VerificationBadge.find({
      userId: req.user.id
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      badges: badges.map(badge => ({
        id: badge._id,
        badgeType: badge.badgeType,
        status: badge.status,
        verificationDate: badge.verificationData.verificationDate,
        expiryDate: badge.verificationData.expiryDate,
        appliedAt: badge.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification badges'
    });
  }
});

// Get Public User Verification Badges
router.get('/verification/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const badges = await VerificationBadge.find({
      userId,
      status: 'verified'
    }).select('badgeType verificationData.verificationDate metadata.trustScore');

    const verifiedBadges = badges.map(badge => ({
      badgeType: badge.badgeType,
      verifiedAt: badge.verificationData.verificationDate,
      trustScore: badge.metadata?.trustScore
    }));

    // Calculate overall trust score
    const trustScore = badges.length > 0 ?
      Math.round(badges.reduce((sum, badge) => sum + (badge.metadata?.trustScore || 50), 0) / badges.length) :
      0;

    res.json({
      success: true,
      verification: {
        badges: verifiedBadges,
        trustScore,
        verificationLevel: badges.length >= 3 ? 'high' : badges.length >= 1 ? 'medium' : 'none'
      }
    });
  } catch (error) {
    console.error('Error fetching user verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user verification'
    });
  }
});

// Photo/Video Consent Management
router.post('/consent/request', authenticateToken, async (req, res) => {
  try {
    const {
      attendeeIds,
      eventId,
      consentTypes,
      eventDetails
    } = req.body;

    if (!attendeeIds || !Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'attendeeIds array is required'
      });
    }

    if (!consentTypes || !Array.isArray(consentTypes) || consentTypes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'consentTypes array is required'
      });
    }

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or access denied'
      });
    }

    // Create consent requests (this would typically be done via email/notification)
    const consentRequests = attendeeIds.map(attendeeId => ({
      attendeeId,
      eventId,
      organizerId: req.user.id,
      consentTypes,
      status: 'pending',
      requestedAt: new Date(),
      eventDetails
    }));

    // Simulate sending consent requests
    res.status(201).json({
      success: true,
      message: 'Consent requests sent successfully',
      requestsSent: consentRequests.length,
      consentTypes
    });
  } catch (error) {
    console.error('Error requesting consent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request consent'
    });
  }
});

// Grant/Revoke Consent
router.post('/consent/respond', authenticateToken, async (req, res) => {
  try {
    const {
      eventId,
      consentTypes,
      granted
    } = req.body;

    // This would typically update a consent record in the database
    // For now, we'll simulate the response

    res.json({
      success: true,
      message: `Consent ${granted ? 'granted' : 'revoked'} successfully`,
      consent: {
        eventId,
        attendeeId: req.user.id,
        consentTypes,
        granted,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error responding to consent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consent'
    });
  }
});

// Get Safety Statistics (Admin)
router.get('/admin/statistics', requireAdminAuth, async (req, res) => {
  try {
    const stats = await SafetyReport.getSafetyStats();

    // Additional safety metrics
    const [
      totalBlocks,
      verificationApplications,
      activeVerifiedUsers
    ] = await Promise.all([
      Block.countDocuments({ isActive: true }),
      VerificationBadge.countDocuments(),
      VerificationBadge.distinct('userId', { status: 'verified' })
    ]);

    res.json({
      success: true,
      statistics: {
        ...stats,
        blocks: {
          totalActive: totalBlocks
        },
        verification: {
          totalApplications: verificationApplications,
          verifiedUsers: activeVerifiedUsers.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching safety statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch safety statistics'
    });
  }
});

// Review Safety Report (Admin)
router.patch('/admin/reports/:reportId', requireAdminAuth, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, resolution, notes } = req.body;

    const report = await SafetyReport.findOne({ reportId });
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    report.status = status;
    report.reviewedBy = req.admin.id;
    report.reviewedAt = new Date();

    if (resolution) {
      report.resolution = {
        action: resolution.action,
        notes: notes || resolution.notes,
        appealable: resolution.appealable !== false
      };
    }

    await report.save();

    res.json({
      success: true,
      message: 'Report reviewed successfully',
      report: {
        reportId: report.reportId,
        status: report.status,
        resolution: report.resolution
      }
    });
  } catch (error) {
    console.error('Error reviewing report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review report'
    });
  }
});

// Approve Verification Badge (Admin)
router.patch('/admin/verification/:badgeId', requireAdminAuth, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { status, notes, trustScore } = req.body;

    const badge = await VerificationBadge.findById(badgeId);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Verification badge not found'
      });
    }

    badge.status = status;
    badge.verificationData.verifiedBy = req.admin.id;
    badge.verificationData.verificationDate = new Date();

    if (status === 'verified') {
      // Set expiry date (1 year from now)
      badge.verificationData.expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      if (trustScore) {
        badge.metadata.trustScore = trustScore;
      }
    }

    await badge.save();

    res.json({
      success: true,
      message: `Verification badge ${status}`,
      badge: {
        id: badge._id,
        badgeType: badge.badgeType,
        status: badge.status,
        trustScore: badge.metadata?.trustScore
      }
    });
  } catch (error) {
    console.error('Error updating verification badge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification badge'
    });
  }
});

// Get Safety Dashboard Data
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      userReports,
      blockedUsers,
      verificationBadges,
      recentActivity
    ] = await Promise.all([
      SafetyReport.find({ reportedBy: userId })
        .sort({ createdAt: -1 })
        .limit(10),
      Block.find({ blockerId: userId, isActive: true })
        .populate('blockedId', 'firstName lastName')
        .limit(10),
      VerificationBadge.find({ userId })
        .sort({ createdAt: -1 }),
      Analytics.find({
        userId,
        action: { $in: ['safety_report', 'user_block'] }
      })
        .sort({ timestamp: -1 })
        .limit(5)
    ]);

    res.json({
      success: true,
      dashboard: {
        reports: {
          submitted: userReports.length,
          pending: userReports.filter(r => r.status === 'pending').length,
          resolved: userReports.filter(r => r.status === 'resolved').length
        },
        blocks: {
          total: blockedUsers.length,
          users: blockedUsers.map(block => ({
            user: block.blockedId,
            reason: block.reason,
            blockedAt: block.createdAt
          }))
        },
        verification: {
          badges: verificationBadges.map(badge => ({
            badgeType: badge.badgeType,
            status: badge.status,
            appliedAt: badge.createdAt
          })),
          verifiedCount: verificationBadges.filter(b => b.status === 'verified').length
        },
        recentActivity: recentActivity.map(activity => ({
          action: activity.action,
          timestamp: activity.timestamp,
          metadata: activity.metadata
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching safety dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch safety dashboard'
    });
  }
});

module.exports = router;