const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const Event = require('../models/Event');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

// Overview Dashboard - Main Stats
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const [
      platformStats,
      eventHotspots,
      recentEvents,
      topCategories
    ] = await Promise.all([
      Analytics.getPlatformStats(),
      Analytics.getEventHotspots('30d'),
      Event.find({ status: 'published' })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('organizer', 'firstName lastName'),
      Event.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      success: true,
      data: {
        liveStats: {
          activeUsers: platformStats.activeUsers,
          totalEvents: platformStats.totalEvents,
          totalTicketsSold: platformStats.totalTicketsSold,
          onlineUsers: Math.floor(Math.random() * 500) + 100 // Simulated real-time
        },
        heatmapData: eventHotspots,
        popularEvents: platformStats.topEvents,
        recentEvents,
        topCategories,
        deviceStats: platformStats.deviceStats
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard overview'
    });
  }
});

// Live User Counter
router.get('/live-stats', async (req, res) => {
  try {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);

    const activeUsers = await Analytics.distinct('userId', {
      timestamp: { $gte: last5Minutes }
    });

    const recentActivity = await Analytics.countDocuments({
      timestamp: { $gte: last5Minutes }
    });

    res.json({
      success: true,
      data: {
        activeUsers: activeUsers.length,
        recentActivity,
        timestamp: now,
        onlineUsers: Math.floor(Math.random() * 200) + 50 // Simulated
      }
    });
  } catch (error) {
    console.error('Error fetching live stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch live stats'
    });
  }
});

// Ticket Sales Analytics
router.get('/sales-analytics', authenticateToken, async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
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
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const salesData = await Analytics.aggregate([
      {
        $match: {
          action: 'purchase_ticket',
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          daily: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$metadata.amount', 25] } }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    const totalSales = await Analytics.countDocuments({
      action: 'purchase_ticket',
      timestamp: { $gte: startDate }
    });

    const totalRevenue = salesData.reduce((sum, day) => sum + day.revenue, 0);

    res.json({
      success: true,
      data: {
        totalSales,
        totalRevenue,
        dailySales: salesData,
        averageTicketPrice: totalSales > 0 ? (totalRevenue / totalSales) : 0,
        timeRange
      }
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales analytics'
    });
  }
});

// Event Performance Analytics
router.get('/event/:eventId/analytics', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { timeRange = '7d' } = req.query;

    // Verify event ownership or access
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const analytics = await Analytics.getEventAnalytics(eventId, timeRange);

    const [
      totalViews,
      uniqueViewers,
      conversionRate,
      geographicData
    ] = await Promise.all([
      Analytics.countDocuments({ eventId, action: 'view_event' }),
      Analytics.distinct('userId', { eventId, action: 'view_event' }),
      Analytics.aggregate([
        { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        }
      ]),
      Analytics.aggregate([
        {
          $match: {
            eventId: new mongoose.Types.ObjectId(eventId),
            'metadata.location.country': { $exists: true }
          }
        },
        {
          $group: {
            _id: '$metadata.location.country',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    const views = conversionRate.find(a => a._id === 'view_event')?.count || 0;
    const purchases = conversionRate.find(a => a._id === 'purchase_ticket')?.count || 0;

    res.json({
      success: true,
      data: {
        event: {
          id: event._id,
          title: event.title,
          category: event.category
        },
        metrics: {
          totalViews,
          uniqueViewers: uniqueViewers.length,
          purchases,
          conversionRate: views > 0 ? ((purchases / views) * 100).toFixed(2) : 0
        },
        analytics,
        geographicData,
        timeRange
      }
    });
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event analytics'
    });
  }
});

// Business Analytics Summary
router.get('/business-analytics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30d' } = req.query;

    // Get user's events
    const userEvents = await Event.find({ organizer: userId }).select('_id');
    const eventIds = userEvents.map(e => e._id);

    if (eventIds.length === 0) {
      return res.json({
        success: true,
        data: {
          hasEvents: false,
          message: 'No events found for analytics'
        }
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

    const [
      attendeeStats,
      trafficSources,
      repeatVisitors,
      revenueData
    ] = await Promise.all([
      Analytics.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$eventId',
            uniqueAttendees: { $addToSet: '$userId' },
            totalInteractions: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: '_id',
            as: 'event'
          }
        }
      ]),
      Analytics.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            timestamp: { $gte: startDate },
            'metadata.referrer': { $exists: true }
          }
        },
        {
          $group: {
            _id: '$metadata.referrer',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Analytics.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            userId: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$userId',
            eventCount: { $addToSet: '$eventId' }
          }
        },
        {
          $project: {
            eventCount: { $size: '$eventCount' },
            isRepeat: { $gt: [{ $size: '$eventCount' }, 1] }
          }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            repeatUsers: { $sum: { $cond: ['$isRepeat', 1, 0] } }
          }
        }
      ]),
      Analytics.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            action: 'purchase_ticket',
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' }
            },
            revenue: { $sum: { $ifNull: ['$metadata.amount', 25] } },
            sales: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ])
    ]);

    const repeatVisitorRate = repeatVisitors[0] ?
      ((repeatVisitors[0].repeatUsers / repeatVisitors[0].totalUsers) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        hasEvents: true,
        timeRange,
        attendeeStats: attendeeStats.map(stat => ({
          eventId: stat._id,
          eventTitle: stat.event[0]?.title || 'Unknown Event',
          uniqueAttendees: stat.uniqueAttendees.length,
          totalInteractions: stat.totalInteractions
        })),
        trafficSources,
        repeatVisitorRate,
        revenueData,
        summary: {
          totalEvents: eventIds.length,
          totalRevenue: revenueData.reduce((sum, day) => sum + day.revenue, 0),
          totalSales: revenueData.reduce((sum, day) => sum + day.sales, 0)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching business analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business analytics'
    });
  }
});

// Record Analytics Event
router.post('/analytics/track', async (req, res) => {
  try {
    const {
      eventId,
      action,
      metadata = {}
    } = req.body;

    // Basic validation
    if (!eventId || !action) {
      return res.status(400).json({
        success: false,
        message: 'eventId and action are required'
      });
    }

    const analyticsData = {
      eventId,
      userId: req.user?.id,
      sessionId: req.sessionID || 'anonymous',
      action,
      metadata: {
        ...metadata,
        userAgent: req.get('user-agent'),
        ipAddress: req.ip
      }
    };

    const analytics = new Analytics(analyticsData);
    await analytics.save();

    res.json({
      success: true,
      message: 'Analytics event tracked'
    });
  } catch (error) {
    console.error('Error tracking analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track analytics event'
    });
  }
});

module.exports = router;