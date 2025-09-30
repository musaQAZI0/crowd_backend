const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sessionId: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'view_event',
      'like_event',
      'share_event',
      'purchase_ticket',
      'click_link',
      'registration',
      'check_in',
      'engagement_interaction',
      'photo_upload',
      'poll_vote',
      'qa_question',
      'chat_message'
    ]
  },
  metadata: {
    referrer: String,
    userAgent: String,
    ipAddress: String,
    location: {
      country: String,
      state: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    },
    additionalData: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
analyticsSchema.index({ eventId: 1, timestamp: -1 });
analyticsSchema.index({ userId: 1, timestamp: -1 });
analyticsSchema.index({ action: 1, timestamp: -1 });
analyticsSchema.index({ timestamp: -1 });

// Static methods for analytics
analyticsSchema.statics.getEventAnalytics = async function(eventId, timeRange = '7d') {
  const startDate = new Date();
  switch(timeRange) {
    case '1d':
      startDate.setDate(startDate.getDate() - 1);
      break;
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

  const pipeline = [
    {
      $match: {
        eventId: new mongoose.Types.ObjectId(eventId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        action: '$_id',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    }
  ];

  return await this.aggregate(pipeline);
};

analyticsSchema.statics.getPlatformStats = async function() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeUsers24h,
    totalEvents,
    totalTicketsSold,
    topEvents,
    deviceStats,
    locationStats
  ] = await Promise.all([
    // Active users in last 24h
    this.distinct('userId', { timestamp: { $gte: last24h } }),

    // Total events
    mongoose.model('Event').countDocuments({ status: 'published' }),

    // Total tickets sold (simulated)
    this.countDocuments({ action: 'purchase_ticket' }),

    // Top events by engagement
    this.aggregate([
      { $match: { timestamp: { $gte: last7d } } },
      { $group: { _id: '$eventId', interactions: { $sum: 1 } } },
      { $sort: { interactions: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: '_id',
          as: 'event'
        }
      }
    ]),

    // Device statistics
    this.aggregate([
      { $match: { timestamp: { $gte: last30d } } },
      { $group: { _id: '$metadata.deviceType', count: { $sum: 1 } } }
    ]),

    // Location statistics for heatmap
    this.aggregate([
      {
        $match: {
          timestamp: { $gte: last30d },
          'metadata.location.coordinates': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            city: '$metadata.location.city',
            state: '$metadata.location.state',
            country: '$metadata.location.country'
          },
          count: { $sum: 1 },
          coordinates: { $first: '$metadata.location.coordinates' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 100 }
    ])
  ]);

  return {
    activeUsers: activeUsers24h.length,
    totalEvents,
    totalTicketsSold,
    topEvents,
    deviceStats,
    locationStats: locationStats.map(loc => ({
      location: loc._id,
      count: loc.count,
      coordinates: loc.coordinates
    }))
  };
};

analyticsSchema.statics.getEventHotspots = async function(timeRange = '30d') {
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

  return await this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate },
        'metadata.location.coordinates': { $exists: true }
      }
    },
    {
      $lookup: {
        from: 'events',
        localField: 'eventId',
        foreignField: '_id',
        as: 'event'
      }
    },
    {
      $unwind: '$event'
    },
    {
      $group: {
        _id: {
          lat: { $round: ['$metadata.location.coordinates.lat', 2] },
          lng: { $round: ['$metadata.location.coordinates.lng', 2] }
        },
        intensity: { $sum: 1 },
        events: { $addToSet: '$event.title' },
        eventCount: { $addToSet: '$eventId' }
      }
    },
    {
      $project: {
        coordinates: ['$_id.lng', '$_id.lat'],
        intensity: 1,
        events: { $slice: ['$events', 5] },
        eventCount: { $size: '$eventCount' }
      }
    },
    { $sort: { intensity: -1 } }
  ]);
};

module.exports = mongoose.model('Analytics', analyticsSchema);