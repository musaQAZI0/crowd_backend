const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Analytics = require('../models/Analytics');
const { authenticateToken } = require('../middleware/auth');

// Create a Ticket model if it doesn't exist
let Ticket;
try {
  Ticket = mongoose.model('Ticket');
} catch {
  const ticketSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketType: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ['active', 'cancelled', 'refunded'], default: 'active' },
    purchaseDate: { type: Date, default: Date.now },
    totalAmount: { type: Number, required: true }
  });
  Ticket = mongoose.model('Ticket', ticketSchema);
}

/**
 * GET /api/analytics/overview
 * Get comprehensive analytics overview for the authenticated user
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30' } = req.query; // days

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));

    // Get previous period for comparison
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - parseInt(timeRange));

    // Fetch user's events
    const userEvents = await Event.find({ organizer: userId }).select('_id');
    const eventIds = userEvents.map(e => e._id);

    if (eventIds.length === 0) {
      // No events yet - return empty state
      return res.json({
        overview: {
          totalRevenue: 0,
          totalTicketsSold: 0,
          totalEvents: 0,
          publishedEvents: 0,
          revenueChange: 0,
          ticketsChange: 0
        },
        revenue: { monthly: [] },
        events: { topPerforming: [], performance: [] },
        ticketSales: { byType: [] },
        attendance: { total: 0, checked_in: 0 }
      });
    }

    // Get tickets sold in current period
    const currentTickets = await Ticket.find({
      eventId: { $in: eventIds },
      purchaseDate: { $gte: startDate },
      status: 'active'
    });

    // Get tickets sold in previous period
    const previousTickets = await Ticket.find({
      eventId: { $in: eventIds },
      purchaseDate: { $gte: previousStartDate, $lt: startDate },
      status: 'active'
    });

    // Calculate current period metrics
    const currentRevenue = currentTickets.reduce((sum, t) => sum + t.totalAmount, 0);
    const currentTicketCount = currentTickets.reduce((sum, t) => sum + t.quantity, 0);

    // Calculate previous period metrics
    const previousRevenue = previousTickets.reduce((sum, t) => sum + t.totalAmount, 0);
    const previousTicketCount = previousTickets.reduce((sum, t) => sum + t.quantity, 0);

    // Calculate percentage changes
    const revenueChange = previousRevenue > 0
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
      : 0;
    const ticketsChange = previousTicketCount > 0
      ? ((currentTicketCount - previousTicketCount) / previousTicketCount) * 100
      : 0;

    // Get total events count
    const totalEvents = eventIds.length;
    const publishedEvents = await Event.countDocuments({
      _id: { $in: eventIds },
      status: 'published'
    });

    // Get monthly revenue data (last 6 months)
    const monthlyRevenue = await Ticket.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: 'active',
          purchaseDate: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$purchaseDate' },
            month: { $month: '$purchaseDate' }
          },
          revenue: { $sum: '$totalAmount' },
          tickets: { $sum: '$quantity' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          month: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          revenue: 1,
          tickets: 1
        }
      }
    ]);

    // Get top performing events
    const topPerformingEvents = await Ticket.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: 'active',
          purchaseDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$eventId',
          revenue: { $sum: '$totalAmount' },
          ticketsSold: { $sum: '$quantity' }
        }
      },
      {
        $sort: { revenue: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: '_id',
          as: 'event'
        }
      },
      {
        $unwind: '$event'
      },
      {
        $project: {
          _id: 0,
          eventId: '$_id',
          eventTitle: '$event.title',
          revenue: 1,
          ticketsSold: 1
        }
      }
    ]);

    // Get event performance data for table
    const eventPerformance = await Promise.all(
      eventIds.map(async (eventId) => {
        const event = await Event.findById(eventId);
        const tickets = await Ticket.find({ eventId, status: 'active' });

        const ticketsSold = tickets.reduce((sum, t) => sum + t.quantity, 0);
        const revenue = tickets.reduce((sum, t) => sum + t.totalAmount, 0);

        // Calculate capacity (total tickets available)
        let capacity = 100; // default
        if (event.tickets && event.tickets.length > 0) {
          capacity = event.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0);
        }

        const conversionRate = capacity > 0 ? (ticketsSold / capacity) * 100 : 0;

        return {
          eventId: event._id,
          eventTitle: event.title,
          eventDate: event.dateTime?.start || event.date,
          location: event.location?.venue?.name || event.location?.type || 'TBD',
          status: event.status || 'published',
          ticketsSold,
          revenue,
          capacity,
          conversionRate: conversionRate.toFixed(1)
        };
      })
    );

    // Get ticket sales by type
    const ticketsByType = await Ticket.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: 'active',
          purchaseDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$ticketType',
          revenue: { $sum: '$totalAmount' },
          count: { $sum: '$quantity' }
        }
      },
      {
        $project: {
          _id: 0,
          type: '$_id',
          revenue: 1,
          count: 1
        }
      }
    ]);

    // Get attendance data (from analytics if available)
    const attendanceData = await Analytics.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          action: { $in: ['check_in', 'registration'] },
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalAttendance = attendanceData.reduce((sum, a) => sum + a.count, 0);
    const checkedIn = attendanceData.find(a => a._id === 'check_in')?.count || 0;

    // Construct response
    res.json({
      overview: {
        totalRevenue: currentRevenue,
        totalTicketsSold: currentTicketCount,
        totalEvents,
        publishedEvents,
        revenueChange: parseFloat(revenueChange.toFixed(1)),
        ticketsChange: parseFloat(ticketsChange.toFixed(1))
      },
      revenue: {
        monthly: monthlyRevenue
      },
      events: {
        topPerforming: topPerformingEvents,
        performance: eventPerformance.sort((a, b) => b.revenue - a.revenue)
      },
      ticketSales: {
        byType: ticketsByType
      },
      attendance: {
        total: totalAttendance,
        checked_in: checkedIn
      }
    });

  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({
      error: 'Failed to fetch analytics data',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/event/:eventId
 * Get detailed analytics for a specific event
 */
router.get('/event/:eventId', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Verify user owns this event
    const event = await Event.findOne({ _id: eventId, organizer: userId });
    if (!event) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    // Get ticket sales for this event
    const tickets = await Ticket.find({ eventId, status: 'active' });

    const totalRevenue = tickets.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTickets = tickets.reduce((sum, t) => sum + t.quantity, 0);

    // Get sales over time (daily)
    const salesByDay = await Ticket.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          status: 'active'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' }
          },
          revenue: { $sum: '$totalAmount' },
          tickets: { $sum: '$quantity' }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          revenue: 1,
          tickets: 1
        }
      }
    ]);

    // Get ticket type breakdown
    const ticketTypeBreakdown = await Ticket.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$ticketType',
          revenue: { $sum: '$totalAmount' },
          sold: { $sum: '$quantity' }
        }
      },
      {
        $project: {
          _id: 0,
          type: '$_id',
          revenue: 1,
          sold: 1
        }
      }
    ]);

    // Get analytics events
    const analyticsEvents = await Analytics.find({ eventId })
      .sort({ timestamp: -1 })
      .limit(100);

    const actionStats = {};
    analyticsEvents.forEach(event => {
      actionStats[event.action] = (actionStats[event.action] || 0) + 1;
    });

    res.json({
      eventId,
      eventTitle: event.title,
      summary: {
        totalRevenue,
        totalTickets,
        views: actionStats.view_event || 0,
        likes: actionStats.like_event || 0,
        shares: actionStats.share_event || 0
      },
      sales: {
        byDay: salesByDay,
        byType: ticketTypeBreakdown
      },
      engagement: actionStats
    });

  } catch (error) {
    console.error('Error fetching event analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch event analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/revenue/breakdown
 * Get revenue breakdown by various dimensions
 */
router.get('/revenue/breakdown', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30', groupBy = 'type' } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));

    const userEvents = await Event.find({ organizer: userId }).select('_id');
    const eventIds = userEvents.map(e => e._id);

    let groupByField;
    switch (groupBy) {
      case 'type':
        groupByField = '$ticketType';
        break;
      case 'event':
        groupByField = '$eventId';
        break;
      case 'day':
        groupByField = { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } };
        break;
      default:
        groupByField = '$ticketType';
    }

    const breakdown = await Ticket.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: 'active',
          purchaseDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupByField,
          revenue: { $sum: '$totalAmount' },
          tickets: { $sum: '$quantity' },
          transactions: { $sum: 1 }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    // If grouping by event, lookup event details
    if (groupBy === 'event') {
      const enrichedBreakdown = await Promise.all(
        breakdown.map(async (item) => {
          const event = await Event.findById(item._id).select('title');
          return {
            ...item,
            eventTitle: event?.title || 'Unknown Event'
          };
        })
      );
      return res.json({ breakdown: enrichedBreakdown });
    }

    res.json({ breakdown });

  } catch (error) {
    console.error('Error fetching revenue breakdown:', error);
    res.status(500).json({
      error: 'Failed to fetch revenue breakdown',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/track
 * Track analytics events (for frontend to call)
 */
router.post('/track', async (req, res) => {
  try {
    const {
      eventId,
      userId,
      sessionId,
      action,
      metadata
    } = req.body;

    // Validate required fields
    if (!eventId || !sessionId || !action) {
      return res.status(400).json({
        error: 'Missing required fields: eventId, sessionId, action'
      });
    }

    // Create analytics entry
    const analyticsEntry = new Analytics({
      eventId,
      userId: userId || null,
      sessionId,
      action,
      metadata: metadata || {},
      timestamp: new Date()
    });

    await analyticsEntry.save();

    res.json({
      success: true,
      message: 'Analytics event tracked successfully'
    });

  } catch (error) {
    console.error('Error tracking analytics:', error);
    res.status(500).json({
      error: 'Failed to track analytics event',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/export
 * Export analytics data as CSV
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { format = 'csv', timeRange = '30' } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeRange));

    const userEvents = await Event.find({ organizer: userId }).select('_id title');
    const eventIds = userEvents.map(e => e._id);

    const tickets = await Ticket.find({
      eventId: { $in: eventIds },
      status: 'active',
      purchaseDate: { $gte: startDate }
    }).populate('eventId', 'title').populate('userId', 'firstName lastName email');

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Date', 'Event', 'Ticket Type', 'Quantity', 'Price', 'Total', 'Customer'];
      const rows = tickets.map(ticket => [
        new Date(ticket.purchaseDate).toISOString().split('T')[0],
        ticket.eventId?.title || 'Unknown',
        ticket.ticketType,
        ticket.quantity,
        ticket.price.toFixed(2),
        ticket.totalAmount.toFixed(2),
        ticket.userId ? `${ticket.userId.firstName} ${ticket.userId.lastName}` : 'Guest'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${Date.now()}.csv`);
      res.send(csvContent);
    } else {
      res.json({ tickets });
    }

  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({
      error: 'Failed to export analytics',
      message: error.message
    });
  }
});

module.exports = router;
