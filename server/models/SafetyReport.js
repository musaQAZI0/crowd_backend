const mongoose = require('mongoose');

const safetyReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    unique: true,
    required: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  reportType: {
    type: String,
    required: true,
    enum: [
      'harassment',
      'inappropriate_content',
      'spam',
      'fake_profile',
      'safety_concern',
      'other'
    ]
  },
  category: {
    type: String,
    required: true,
    enum: [
      'behavioral',
      'content',
      'security',
      'fraud',
      'other'
    ]
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  evidence: {
    screenshots: [String],
    messages: [String],
    additionalInfo: String
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  resolution: {
    action: {
      type: String,
      enum: ['no_action', 'warning', 'temporary_suspension', 'permanent_ban', 'content_removal']
    },
    notes: String,
    appealable: {
      type: Boolean,
      default: true
    }
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    reporterLocation: String
  }
}, {
  timestamps: true
});

// Indexes
safetyReportSchema.index({ reportedBy: 1 });
safetyReportSchema.index({ reportedUser: 1 });
safetyReportSchema.index({ eventId: 1 });
safetyReportSchema.index({ status: 1, createdAt: -1 });
safetyReportSchema.index({ severity: 1, createdAt: -1 });

// Pre-save middleware to generate report ID
safetyReportSchema.pre('save', function(next) {
  if (!this.reportId) {
    this.reportId = 'RPT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }
  next();
});

// Static method to get safety statistics
safetyReportSchema.statics.getSafetyStats = async function() {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalReports,
    pendingReports,
    resolvedReports,
    reportsByType,
    reportsBySeverity,
    recentTrends
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ status: 'pending' }),
    this.countDocuments({ status: 'resolved' }),
    this.aggregate([
      { $group: { _id: '$reportType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $match: { createdAt: { $gte: last30Days } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ])
  ]);

  return {
    totalReports,
    pendingReports,
    resolvedReports,
    reportsByType,
    reportsBySeverity,
    recentTrends
  };
};

module.exports = mongoose.model('SafetyReport', safetyReportSchema);

// Block/Unblock Schema
const blockSchema = new mongoose.Schema({
  blockerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blockedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    enum: ['harassment', 'spam', 'inappropriate', 'other'],
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for blocks
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

const Block = mongoose.model('Block', blockSchema);

// Verification Badge Schema
const verificationBadgeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  badgeType: {
    type: String,
    required: true,
    enum: ['identity', 'business', 'background', 'social', 'trusted']
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'expired'],
    default: 'pending'
  },
  verificationData: {
    documentType: String,
    documentNumber: String,
    verificationMethod: String,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verificationDate: Date,
    expiryDate: Date
  },
  metadata: {
    socialFollowers: Number,
    businessLicense: String,
    backgroundCheckProvider: String,
    trustScore: {
      type: Number,
      min: 0,
      max: 100
    }
  }
}, {
  timestamps: true
});

// Indexes for verification badges
verificationBadgeSchema.index({ userId: 1, badgeType: 1 }, { unique: true });
verificationBadgeSchema.index({ status: 1 });

const VerificationBadge = mongoose.model('VerificationBadge', verificationBadgeSchema);

module.exports = { SafetyReport: mongoose.model('SafetyReport', safetyReportSchema), Block, VerificationBadge };