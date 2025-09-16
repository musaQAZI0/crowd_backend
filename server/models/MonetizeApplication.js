const mongoose = require('mongoose');

const monetizeApplicationSchema = new mongoose.Schema({
  // User who submitted the application
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Application type
  applicationType: {
    type: String,
    enum: ['influencer', 'venue'],
    required: true
  },

  // Contact Information
  contactInfo: {
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    }
  },

  // Business Information
  businessInfo: {
    businessName: {
      type: String,
      required: true,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    socialMedia: {
      instagram: String,
      tiktok: String,
      youtube: String
    }
  },

  // Influencer-specific details
  influencerDetails: {
    niche: {
      type: String,
      enum: ['music', 'lifestyle', 'fitness', 'food', 'travel', 'fashion', 'tech', 'nightlife', 'business', 'other']
    },
    followerCount: {
      instagram: { type: Number, default: 0 },
      tiktok: { type: Number, default: 0 },
      youtube: { type: Number, default: 0 }
    },
    avgEngagementRate: {
      type: Number,
      min: 0,
      max: 100
    },
    contentTypes: [{
      type: String,
      enum: ['posts', 'stories', 'reels', 'videos']
    }],
    previousBrandPartnerships: String,
    rateCard: {
      post: { type: Number, default: 0 },
      story: { type: Number, default: 0 },
      reel: { type: Number, default: 0 },
      video: { type: Number, default: 0 }
    }
  },

  // Venue-specific details
  venueDetails: {
    venueType: {
      type: String,
      enum: ['restaurant', 'bar', 'nightclub', 'event_space', 'hotel', 'outdoor', 'rooftop', 'warehouse', 'other']
    },
    capacity: {
      type: Number,
      min: 1
    },
    location: {
      address: String,
      city: String,
      state: String,
      zipCode: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    eventTypes: [{
      type: String,
      enum: ['concerts', 'parties', 'corporate', 'weddings', 'conferences', 'exhibitions']
    }],
    amenities: [{
      type: String,
      enum: ['sound_system', 'lighting', 'bar', 'parking', 'catering', 'security', 'av_equipment']
    }],
    pricing: {
      hourlyRate: { type: Number, default: 0 },
      dailyRate: { type: Number, default: 0 }
    },
    licenses: {
      liquorLicense: { type: Boolean, default: false },
      musicLicense: { type: Boolean, default: false },
      eventPermit: { type: Boolean, default: false }
    }
  },

  // Application status
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'needs_info'],
    default: 'pending'
  },

  // Review information
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewDate: Date,
  reviewerNotes: String,

  // Documents/attachments
  documents: [{
    type: String,
    url: String,
    uploadDate: { type: Date, default: Date.now }
  }],

  // Application metrics
  metrics: {
    viewCount: { type: Number, default: 0 },
    lastViewed: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  },

  // Auto-calculated fields
  totalFollowers: {
    type: Number,
    default: 0
  },

  // Timestamps
  submissionDate: {
    type: Date,
    default: Date.now
  },

  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
monetizeApplicationSchema.index({ userId: 1 });
monetizeApplicationSchema.index({ applicationType: 1 });
monetizeApplicationSchema.index({ status: 1 });
monetizeApplicationSchema.index({ submissionDate: -1 });
monetizeApplicationSchema.index({ 'contactInfo.email': 1 });

// Pre-save middleware to calculate total followers
monetizeApplicationSchema.pre('save', function(next) {
  if (this.applicationType === 'influencer' && this.influencerDetails) {
    this.totalFollowers =
      (this.influencerDetails.followerCount.instagram || 0) +
      (this.influencerDetails.followerCount.tiktok || 0) +
      (this.influencerDetails.followerCount.youtube || 0);
  }
  this.lastUpdated = new Date();
  next();
});

// Virtual for application ID display
monetizeApplicationSchema.virtual('applicationId').get(function() {
  return `${this.applicationType.toUpperCase()}-${this._id.toString().slice(-6)}`;
});

// Virtual for status display
monetizeApplicationSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'pending': 'Pending Review',
    'under_review': 'Under Review',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'needs_info': 'Needs Information'
  };
  return statusMap[this.status] || this.status;
});

// Static method to get applications by status
monetizeApplicationSchema.statics.getByStatus = function(status) {
  return this.find({ status })
    .populate('userId', 'username email')
    .populate('reviewedBy', 'username email')
    .sort({ submissionDate: -1 });
};

// Static method to get applications statistics
monetizeApplicationSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ['$status', 'under_review'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        needsInfo: { $sum: { $cond: [{ $eq: ['$status', 'needs_info'] }, 1, 0] } },
        influencers: { $sum: { $cond: [{ $eq: ['$applicationType', 'influencer'] }, 1, 0] } },
        venues: { $sum: { $cond: [{ $eq: ['$applicationType', 'venue'] }, 1, 0] } }
      }
    }
  ]);

  return stats[0] || {
    total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0, needsInfo: 0,
    influencers: 0, venues: 0
  };
};

// Instance method to update status
monetizeApplicationSchema.methods.updateStatus = function(newStatus, reviewerId, notes) {
  this.status = newStatus;
  this.reviewedBy = reviewerId;
  this.reviewDate = new Date();
  if (notes) this.reviewerNotes = notes;
  return this.save();
};

module.exports = mongoose.model('MonetizeApplication', monetizeApplicationSchema);