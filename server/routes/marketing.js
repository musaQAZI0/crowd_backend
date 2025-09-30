const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Event = require('../models/Event');
const User = require('../models/User');
const Analytics = require('../models/Analytics');
const TeamMember = require('../models/TeamMember');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// Marketing Campaign Schema (embedded in routes for now)
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    unique: true,
    required: true
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  name: {
    type: String,
    required: true,
    maxlength: 200
  },
  type: {
    type: String,
    enum: ['email', 'sms', 'push', 'social'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'],
    default: 'draft'
  },
  targetAudience: {
    type: {
      type: String,
      enum: ['all', 'followers', 'past_attendees', 'vips', 'first_timers', 'custom'],
      default: 'all'
    },
    filters: {
      location: [String],
      ageRange: {
        min: Number,
        max: Number
      },
      interests: [String],
      lastEventDate: Date
    },
    customUserIds: [mongoose.Schema.Types.ObjectId]
  },
  content: {
    subject: String,
    message: {
      type: String,
      required: true
    },
    template: String,
    variables: mongoose.Schema.Types.Mixed
  },
  scheduling: {
    sendAt: Date,
    timezone: String,
    repeatSchedule: {
      frequency: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly']
      },
      until: Date
    }
  },
  metrics: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 }
  },
  trackingLinks: [{
    originalUrl: String,
    trackingUrl: String,
    clicks: { type: Number, default: 0 }
  }]
}, {
  timestamps: true
});

const Campaign = mongoose.model('Campaign', campaignSchema);

// QR Code Tracking Schema
const qrTrackingSchema = new mongoose.Schema({
  qrId: {
    type: String,
    unique: true,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  campaignId: String,
  purpose: {
    type: String,
    enum: ['event_promotion', 'ticket_sales', 'team_tracking', 'general'],
    default: 'general'
  },
  targetUrl: {
    type: String,
    required: true
  },
  qrCodeData: String, // Base64 encoded QR code
  scans: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    location: {
      lat: Number,
      lng: Number,
      address: String
    },
    deviceInfo: {
      userAgent: String,
      ipAddress: String,
      deviceType: String
    }
  }],
  totalScans: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const QRTracking = mongoose.model('QRTracking', qrTrackingSchema);

// Email Campaign Management
router.post('/campaigns/email', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      eventId,
      targetAudience,
      content,
      scheduling
    } = req.body;

    // Validation
    if (!name || !content?.message) {
      return res.status(400).json({
        success: false,
        message: 'Campaign name and message content are required'
      });
    }

    const campaignData = {
      campaignId: 'CAM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      organizerId: req.user.id,
      eventId,
      name,
      type: 'email',
      targetAudience,
      content,
      scheduling
    };

    const campaign = new Campaign(campaignData);
    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Email campaign created successfully',
      campaign: {
        id: campaign._id,
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status
      }
    });
  } catch (error) {
    console.error('Error creating email campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email campaign'
    });
  }
});

// SMS Campaign Management
router.post('/campaigns/sms', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      eventId,
      targetAudience,
      content,
      scheduling
    } = req.body;

    // SMS message length validation
    if (content?.message && content.message.length > 160) {
      return res.status(400).json({
        success: false,
        message: 'SMS message must be 160 characters or less'
      });
    }

    const campaignData = {
      campaignId: 'SMS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      organizerId: req.user.id,
      eventId,
      name,
      type: 'sms',
      targetAudience,
      content,
      scheduling
    };

    const campaign = new Campaign(campaignData);
    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'SMS campaign created successfully',
      campaign: {
        id: campaign._id,
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status
      }
    });
  } catch (error) {
    console.error('Error creating SMS campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create SMS campaign'
    });
  }
});

// Get User's Campaigns
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { type, status, limit = 20, page = 1 } = req.query;
    const filter = { organizerId: req.user.id };

    if (type) filter.type = type;
    if (status) filter.status = status;

    const campaigns = await Campaign.find(filter)
      .populate('eventId', 'title dateTime.start')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Campaign.countDocuments(filter);

    res.json({
      success: true,
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns'
    });
  }
});

// Send Campaign
router.post('/campaigns/:campaignId/send', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await Campaign.findOne({
      campaignId,
      organizerId: req.user.id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft campaigns can be sent'
      });
    }

    // Update status to sending
    campaign.status = 'sending';
    await campaign.save();

    // Simulate sending process (replace with actual email/SMS service)
    setTimeout(async () => {
      campaign.status = 'sent';
      campaign.metrics.sent = Math.floor(Math.random() * 500) + 100;
      campaign.metrics.delivered = Math.floor(campaign.metrics.sent * 0.95);
      campaign.metrics.opened = Math.floor(campaign.metrics.delivered * 0.25);
      campaign.metrics.clicked = Math.floor(campaign.metrics.opened * 0.15);
      await campaign.save();
    }, 5000);

    res.json({
      success: true,
      message: 'Campaign is being sent',
      status: 'sending'
    });
  } catch (error) {
    console.error('Error sending campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send campaign'
    });
  }
});

// Generate QR Code for Tracking
router.post('/qr-codes/generate', authenticateToken, async (req, res) => {
  try {
    const {
      eventId,
      purpose = 'general',
      targetUrl,
      campaignId
    } = req.body;

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        message: 'Target URL is required'
      });
    }

    const qrId = 'QR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/qr/${qrId}`;

    // Generate QR code
    const qrCodeData = await QRCode.toDataURL(trackingUrl, {
      width: 300,
      margin: 2
    });

    const qrTracking = new QRTracking({
      qrId,
      createdBy: req.user.id,
      eventId,
      campaignId,
      purpose,
      targetUrl,
      qrCodeData
    });

    await qrTracking.save();

    res.status(201).json({
      success: true,
      message: 'QR code generated successfully',
      qrCode: {
        qrId,
        trackingUrl,
        qrCodeData,
        purpose,
        targetUrl
      }
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code'
    });
  }
});

// Track QR Code Scan
router.post('/qr-codes/:qrId/scan', async (req, res) => {
  try {
    const { qrId } = req.params;
    const { location } = req.body;

    const qrTracking = await QRTracking.findOne({ qrId, isActive: true });

    if (!qrTracking) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or inactive'
      });
    }

    // Record scan
    const scanData = {
      userId: req.user?.id,
      location,
      deviceInfo: {
        userAgent: req.get('user-agent'),
        ipAddress: req.ip,
        deviceType: req.get('user-agent')?.includes('Mobile') ? 'mobile' : 'desktop'
      }
    };

    qrTracking.scans.push(scanData);
    qrTracking.totalScans++;
    await qrTracking.save();

    // Track in analytics
    if (qrTracking.eventId) {
      const analytics = new Analytics({
        eventId: qrTracking.eventId,
        userId: req.user?.id,
        sessionId: req.sessionID || 'anonymous',
        action: 'click_link',
        metadata: {
          source: 'qr_code',
          qrId,
          purpose: qrTracking.purpose,
          ...scanData.deviceInfo
        }
      });
      await analytics.save();
    }

    res.json({
      success: true,
      message: 'QR scan tracked',
      redirectUrl: qrTracking.targetUrl
    });
  } catch (error) {
    console.error('Error tracking QR scan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track QR scan'
    });
  }
});

// Get QR Code Analytics
router.get('/qr-codes/:qrId/analytics', authenticateToken, async (req, res) => {
  try {
    const { qrId } = req.params;
    const qrTracking = await QRTracking.findOne({
      qrId,
      createdBy: req.user.id
    }).populate('eventId', 'title');

    if (!qrTracking) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found'
      });
    }

    // Analyze scans
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentScans = qrTracking.scans.filter(scan => scan.timestamp >= last7Days);

    const deviceBreakdown = qrTracking.scans.reduce((acc, scan) => {
      const device = scan.deviceInfo?.deviceType || 'unknown';
      acc[device] = (acc[device] || 0) + 1;
      return acc;
    }, {});

    const dailyScans = recentScans.reduce((acc, scan) => {
      const date = moment(scan.timestamp).format('YYYY-MM-DD');
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      analytics: {
        qrId,
        purpose: qrTracking.purpose,
        event: qrTracking.eventId,
        totalScans: qrTracking.totalScans,
        recentScans: recentScans.length,
        deviceBreakdown,
        dailyScans,
        createdAt: qrTracking.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching QR analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch QR analytics'
    });
  }
});

// Team/Influencer Tracking
router.get('/team-tracking/:eventId', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Get team members for this event
    const teamMembers = await TeamMember.find({
      organizerId: req.user.id,
      status: 'active'
    }).populate('userId', 'firstName lastName email');

    // Get QR codes created by team members
    const teamQRCodes = await QRTracking.find({
      eventId,
      createdBy: { $in: teamMembers.map(t => t.userId._id) }
    }).populate('createdBy', 'firstName lastName');

    // Calculate team performance
    const teamPerformance = teamMembers.map(member => {
      const memberQRs = teamQRCodes.filter(qr =>
        qr.createdBy._id.toString() === member.userId._id.toString()
      );

      const totalScans = memberQRs.reduce((sum, qr) => sum + qr.totalScans, 0);
      const totalQRs = memberQRs.length;

      return {
        member: {
          id: member.userId._id,
          name: `${member.userId.firstName} ${member.userId.lastName}`,
          email: member.userId.email,
          role: member.role
        },
        performance: {
          qrCodesGenerated: totalQRs,
          totalScans,
          averageScansPerQR: totalQRs > 0 ? Math.round(totalScans / totalQRs) : 0
        },
        lastActive: member.lastActive
      };
    });

    res.json({
      success: true,
      data: {
        event: {
          id: event._id,
          title: event.title
        },
        teamPerformance: teamPerformance.sort((a, b) => b.performance.totalScans - a.performance.totalScans),
        summary: {
          totalTeamMembers: teamMembers.length,
          totalQRCodes: teamQRCodes.length,
          totalScans: teamQRCodes.reduce((sum, qr) => sum + qr.totalScans, 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching team tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team tracking data'
    });
  }
});

// Sales Attribution Analytics
router.get('/attribution/:eventId', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { timeRange = '30d' } = req.query;

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const startDate = new Date();
    switch(timeRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const attributionData = await Analytics.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          action: 'purchase_ticket',
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$metadata.source',
          sales: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$metadata.amount', 25] } }
        }
      },
      {
        $sort: { sales: -1 }
      }
    ]);

    // Get referrer data
    const referrerData = await Analytics.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          timestamp: { $gte: startDate },
          'metadata.referrer': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$metadata.referrer',
          visitors: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          referrer: '$_id',
          visitors: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      {
        $sort: { visitors: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        event: {
          id: event._id,
          title: event.title
        },
        attribution: attributionData.map(item => ({
          source: item._id || 'direct',
          sales: item.sales,
          revenue: item.revenue,
          averageOrderValue: item.sales > 0 ? (item.revenue / item.sales).toFixed(2) : 0
        })),
        referrers: referrerData.map(item => ({
          referrer: item.referrer,
          visitors: item.visitors,
          uniqueVisitors: item.uniqueVisitors
        })),
        timeRange,
        summary: {
          totalSales: attributionData.reduce((sum, item) => sum + item.sales, 0),
          totalRevenue: attributionData.reduce((sum, item) => sum + item.revenue, 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching attribution data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attribution data'
    });
  }
});

// Campaign Analytics
router.get('/campaigns/:campaignId/analytics', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await Campaign.findOne({
      campaignId,
      organizerId: req.user.id
    }).populate('eventId', 'title');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Calculate rates
    const openRate = campaign.metrics.delivered > 0 ?
      ((campaign.metrics.opened / campaign.metrics.delivered) * 100).toFixed(2) : 0;

    const clickRate = campaign.metrics.opened > 0 ?
      ((campaign.metrics.clicked / campaign.metrics.opened) * 100).toFixed(2) : 0;

    const deliveryRate = campaign.metrics.sent > 0 ?
      ((campaign.metrics.delivered / campaign.metrics.sent) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      analytics: {
        campaign: {
          id: campaign._id,
          campaignId: campaign.campaignId,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          event: campaign.eventId
        },
        metrics: campaign.metrics,
        rates: {
          deliveryRate: parseFloat(deliveryRate),
          openRate: parseFloat(openRate),
          clickRate: parseFloat(clickRate),
          unsubscribeRate: campaign.metrics.sent > 0 ?
            ((campaign.metrics.unsubscribed / campaign.metrics.sent) * 100).toFixed(2) : 0
        },
        trackingLinks: campaign.trackingLinks
      }
    });
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign analytics'
    });
  }
});

module.exports = router;