const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Event = require('../models/Event');
const User = require('../models/User');
const Analytics = require('../models/Analytics');
const cron = require('node-cron');
const mongoose = require('mongoose');

// Automation Schema
const automationSchema = new mongoose.Schema({
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  automationType: {
    type: String,
    required: true,
    enum: ['thank_you', 'survey', 'review_request', 'reminder', 'follow_up']
  },
  trigger: {
    type: {
      type: String,
      enum: ['time_based', 'event_based', 'user_action'],
      required: true
    },
    condition: {
      eventEnd: { type: Boolean, default: false },
      hoursAfter: { type: Number },
      daysAfter: { type: Number },
      userAction: String
    }
  },
  content: {
    subject: String,
    message: {
      type: String,
      required: true
    },
    template: String,
    personalization: {
      userName: { type: Boolean, default: true },
      eventName: { type: Boolean, default: true },
      customFields: [String]
    }
  },
  targetAudience: {
    type: {
      type: String,
      enum: ['all_attendees', 'ticket_holders', 'no_shows', 'vips', 'first_timers'],
      default: 'all_attendees'
    },
    filters: {
      ticketTypes: [String],
      attendanceStatus: [String],
      userTags: [String]
    }
  },
  deliverySettings: {
    channel: {
      type: String,
      enum: ['email', 'sms', 'push', 'in_app'],
      default: 'email'
    },
    sendTime: {
      hour: { type: Number, min: 0, max: 23, default: 10 },
      timezone: { type: String, default: 'UTC' }
    },
    batchSize: { type: Number, default: 100 },
    rateLimitDelay: { type: Number, default: 5000 } // milliseconds
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },
  execution: {
    scheduledAt: Date,
    executedAt: Date,
    completedAt: Date,
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    errors: [String]
  },
  metrics: {
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    responded: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes
automationSchema.index({ organizerId: 1, eventId: 1 });
automationSchema.index({ status: 1, 'execution.scheduledAt': 1 });
automationSchema.index({ automationType: 1 });

const Automation = mongoose.model('Automation', automationSchema);

// Survey Response Schema
const surveyResponseSchema = new mongoose.Schema({
  surveyId: {
    type: String,
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  respondentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  responses: [{
    questionId: String,
    questionText: String,
    questionType: {
      type: String,
      enum: ['rating', 'text', 'multiple_choice', 'yes_no']
    },
    answer: mongoose.Schema.Types.Mixed
  }],
  overallRating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: String,
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const SurveyResponse = mongoose.model('SurveyResponse', surveyResponseSchema);

// Review Schema
const reviewSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: String,
  comment: {
    type: String,
    maxlength: 1000
  },
  aspects: {
    venue: { type: Number, min: 1, max: 5 },
    organization: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    experience: { type: Number, min: 1, max: 5 }
  },
  wouldRecommend: {
    type: Boolean,
    default: true
  },
  wouldAttendAgain: {
    type: Boolean,
    default: true
  },
  platform: {
    type: String,
    enum: ['crowd', 'google', 'facebook', 'external'],
    default: 'crowd'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

const Review = mongoose.model('Review', reviewSchema);

// Create Automation
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const {
      eventId,
      automationType,
      trigger,
      content,
      targetAudience,
      deliverySettings
    } = req.body;

    // Validation
    if (!automationType || !trigger || !content?.message) {
      return res.status(400).json({
        success: false,
        message: 'automationType, trigger, and content.message are required'
      });
    }

    // Verify event ownership if eventId provided
    if (eventId) {
      const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found or access denied'
        });
      }
    }

    const automation = new Automation({
      organizerId: req.user.id,
      eventId,
      automationType,
      trigger,
      content,
      targetAudience,
      deliverySettings
    });

    // Calculate scheduled execution time
    if (trigger.type === 'time_based' && eventId) {
      const event = await Event.findById(eventId);
      if (event && event.dateTime.end) {
        let scheduledAt = new Date(event.dateTime.end);

        if (trigger.condition.hoursAfter) {
          scheduledAt.setHours(scheduledAt.getHours() + trigger.condition.hoursAfter);
        }
        if (trigger.condition.daysAfter) {
          scheduledAt.setDate(scheduledAt.getDate() + trigger.condition.daysAfter);
        }

        automation.execution.scheduledAt = scheduledAt;
      }
    }

    await automation.save();

    res.status(201).json({
      success: true,
      message: 'Automation created successfully',
      automation: {
        id: automation._id,
        automationType: automation.automationType,
        status: automation.status,
        scheduledAt: automation.execution.scheduledAt
      }
    });
  } catch (error) {
    console.error('Error creating automation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create automation'
    });
  }
});

// Get User's Automations
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { eventId, type, status, limit = 20, page = 1 } = req.query;
    const filter = { organizerId: req.user.id };

    if (eventId) filter.eventId = eventId;
    if (type) filter.automationType = type;
    if (status) filter.status = status;

    const automations = await Automation.find(filter)
      .populate('eventId', 'title dateTime.start dateTime.end')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Automation.countDocuments(filter);

    res.json({
      success: true,
      automations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching automations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch automations'
    });
  }
});

// Execute Automation (Manual Trigger)
router.post('/:automationId/execute', authenticateToken, async (req, res) => {
  try {
    const { automationId } = req.params;

    const automation = await Automation.findOne({
      _id: automationId,
      organizerId: req.user.id
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: 'Automation not found'
      });
    }

    if (automation.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Automation is not active'
      });
    }

    // Execute automation
    await executeAutomation(automation);

    res.json({
      success: true,
      message: 'Automation executed successfully'
    });
  } catch (error) {
    console.error('Error executing automation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute automation'
    });
  }
});

// Submit Survey Response
router.post('/surveys/:surveyId/respond', authenticateToken, async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { eventId, responses, overallRating, feedback } = req.body;

    // Check if user already responded
    const existingResponse = await SurveyResponse.findOne({
      surveyId,
      respondentId: req.user.id
    });

    if (existingResponse) {
      return res.status(400).json({
        success: false,
        message: 'You have already responded to this survey'
      });
    }

    const surveyResponse = new SurveyResponse({
      surveyId,
      eventId,
      respondentId: req.user.id,
      responses,
      overallRating,
      feedback
    });

    await surveyResponse.save();

    // Track in analytics
    const analytics = new Analytics({
      eventId,
      userId: req.user.id,
      sessionId: 'survey_response',
      action: 'survey_completion',
      metadata: {
        surveyId,
        overallRating,
        responseCount: responses?.length || 0
      }
    });
    await analytics.save();

    res.status(201).json({
      success: true,
      message: 'Survey response submitted successfully',
      response: {
        surveyId,
        overallRating,
        completedAt: surveyResponse.completedAt
      }
    });
  } catch (error) {
    console.error('Error submitting survey response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit survey response'
    });
  }
});

// Submit Review
router.post('/reviews', authenticateToken, async (req, res) => {
  try {
    const {
      eventId,
      rating,
      title,
      comment,
      aspects,
      wouldRecommend,
      wouldAttendAgain,
      platform = 'crowd'
    } = req.body;

    if (!eventId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'eventId and rating are required'
      });
    }

    // Check if user already reviewed this event
    const existingReview = await Review.findOne({
      eventId,
      reviewerId: req.user.id
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this event'
      });
    }

    const review = new Review({
      eventId,
      reviewerId: req.user.id,
      rating,
      title,
      comment,
      aspects,
      wouldRecommend,
      wouldAttendAgain,
      platform,
      isVerified: true // Since user is authenticated
    });

    await review.save();

    // Track in analytics
    const analytics = new Analytics({
      eventId,
      userId: req.user.id,
      sessionId: 'review_submission',
      action: 'review_submission',
      metadata: {
        rating,
        platform,
        wouldRecommend,
        wouldAttendAgain
      }
    });
    await analytics.save();

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        id: review._id,
        rating: review.rating,
        title: review.title,
        moderationStatus: review.moderationStatus
      }
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
});

// Get Event Reviews
router.get('/events/:eventId/reviews', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { limit = 10, page = 1, sortBy = 'createdAt' } = req.query;

    const reviews = await Review.find({
      eventId,
      moderationStatus: 'approved'
    })
    .populate('reviewerId', 'firstName lastName profilePicture')
    .sort({ [sortBy]: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Review.countDocuments({
      eventId,
      moderationStatus: 'approved'
    });

    // Calculate average ratings
    const averageRating = await Review.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId), moderationStatus: 'approved' } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          avgVenue: { $avg: '$aspects.venue' },
          avgOrganization: { $avg: '$aspects.organization' },
          avgValue: { $avg: '$aspects.value' },
          avgExperience: { $avg: '$aspects.experience' },
          recommendationRate: { $avg: { $cond: ['$wouldRecommend', 1, 0] } }
        }
      }
    ]);

    const ratings = averageRating[0] || {
      avgRating: 0,
      avgVenue: 0,
      avgOrganization: 0,
      avgValue: 0,
      avgExperience: 0,
      recommendationRate: 0
    };

    res.json({
      success: true,
      reviews: reviews.map(review => ({
        id: review._id,
        reviewer: review.reviewerId,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        aspects: review.aspects,
        wouldRecommend: review.wouldRecommend,
        wouldAttendAgain: review.wouldAttendAgain,
        createdAt: review.createdAt
      })),
      analytics: {
        totalReviews: total,
        averageRating: Math.round(ratings.avgRating * 10) / 10,
        aspectRatings: {
          venue: Math.round(ratings.avgVenue * 10) / 10,
          organization: Math.round(ratings.avgOrganization * 10) / 10,
          value: Math.round(ratings.avgValue * 10) / 10,
          experience: Math.round(ratings.avgExperience * 10) / 10
        },
        recommendationRate: Math.round(ratings.recommendationRate * 100)
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching event reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event reviews'
    });
  }
});

// Get Survey Analytics
router.get('/surveys/:surveyId/analytics', authenticateToken, async (req, res) => {
  try {
    const { surveyId } = req.params;

    const responses = await SurveyResponse.find({ surveyId })
      .populate('respondentId', 'firstName lastName email');

    if (responses.length === 0) {
      return res.json({
        success: true,
        analytics: {
          totalResponses: 0,
          averageRating: 0,
          responseRate: 0,
          responses: []
        }
      });
    }

    // Calculate analytics
    const totalResponses = responses.length;
    const averageRating = responses.reduce((sum, r) => sum + (r.overallRating || 0), 0) / totalResponses;

    // Analyze response patterns
    const responseAnalytics = {
      totalResponses,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution: {},
      commonFeedback: [],
      completionTime: responses.map(r => ({
        respondent: r.respondentId,
        completedAt: r.completedAt,
        responseCount: r.responses.length
      }))
    };

    // Rating distribution
    for (let i = 1; i <= 5; i++) {
      responseAnalytics.ratingDistribution[i] = responses.filter(r => r.overallRating === i).length;
    }

    res.json({
      success: true,
      analytics: responseAnalytics
    });
  } catch (error) {
    console.error('Error fetching survey analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch survey analytics'
    });
  }
});

// Automation execution function
async function executeAutomation(automation) {
  try {
    automation.execution.executedAt = new Date();
    automation.status = 'completed';

    // Simulate sending messages (replace with actual email/SMS service)
    const recipients = await getAutomationRecipients(automation);
    automation.execution.totalRecipients = recipients.length;

    // Simulate successful delivery
    automation.execution.sentCount = recipients.length;
    automation.execution.deliveredCount = Math.floor(recipients.length * 0.95);
    automation.execution.failedCount = recipients.length - automation.execution.deliveredCount;

    automation.execution.completedAt = new Date();
    await automation.save();

    console.log(`Automation ${automation._id} executed successfully`);
  } catch (error) {
    console.error('Error executing automation:', error);
    automation.execution.errors.push(error.message);
    await automation.save();
  }
}

// Get automation recipients
async function getAutomationRecipients(automation) {
  try {
    let recipients = [];

    if (automation.eventId) {
      // Get event attendees based on target audience
      const event = await Event.findById(automation.eventId);
      if (event) {
        // Simulate getting attendees (replace with actual attendee logic)
        recipients = await User.find({}).limit(100); // Placeholder
      }
    } else {
      // Get all users if no specific event
      recipients = await User.find({}).limit(100); // Placeholder
    }

    return recipients;
  } catch (error) {
    console.error('Error getting automation recipients:', error);
    return [];
  }
}

// Cron job for scheduled automations
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const scheduledAutomations = await Automation.find({
      status: 'active',
      'execution.scheduledAt': { $lte: now },
      'execution.executedAt': { $exists: false }
    });

    for (const automation of scheduledAutomations) {
      await executeAutomation(automation);
    }
  } catch (error) {
    console.error('Error in automation cron job:', error);
  }
});

module.exports = router;