const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: false,
    default: 'other',
    validate: {
      validator: function(v) {
        // If no category provided, allow it (will use default)
        if (!v) return true;

        // Convert to lowercase for validation
        const validCategories = [
          'music', 'nightlife', 'performing-arts', 'holidays',
          'dating', 'hobbies', 'business', 'food-drink',
          'sports-fitness', 'health', 'travel', 'charity',
          'community', 'family', 'education', 'fashion',
          'film', 'games', 'government', 'language-culture',
          'lgbtq', 'lifestyle', 'other'
        ];

        return validCategories.includes(v.toLowerCase());
      },
      message: 'Invalid category provided'
    },
    set: function(v) {
      // Convert any category to lowercase automatically
      return v ? v.toLowerCase() : 'other';
    }
  },
  subcategory: {
    type: String,
    trim: true
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizerInfo: {
    name: String,
    email: String,
    phone: String,
    website: String
  },
  dateTime: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  location: {
    type: {
      type: String,
      enum: ['online', 'venue'],
      required: true
    },
    venue: {
      name: String,
      address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    onlineDetails: {
      platform: String,
      url: String,
      accessInstructions: String
    }
  },
  pricing: {
    type: {
      type: String,
      enum: ['free', 'paid'],
      required: true
    },
    amount: {
      type: Number,
      min: 0,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    },
    tickets: [{
      name: String,
      price: Number,
      quantity: Number,
      available: Number,
      description: String
    }]
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  capacity: {
    total: Number,
    available: Number
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registrationDate: {
      type: Date,
      default: Date.now
    },
    ticketType: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    }
  }],
  tags: [String],
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'draft'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'public'
  },
  settings: {
    allowWaitlist: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    showAttendeesCount: {
      type: Boolean,
      default: true
    },
    enableComments: {
      type: Boolean,
      default: true
    }
  },
  socialLinks: {
    facebook: String,
    twitter: String,
    instagram: String,
    website: String
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  shares: {
    type: Number,
    default: 0
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
eventSchema.index({ category: 1, status: 1 });
eventSchema.index({ 'dateTime.start': 1 });
eventSchema.index({ 'location.venue.address.city': 1, 'location.venue.address.state': 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ tags: 1 });
eventSchema.index({ featured: 1, status: 1 });
eventSchema.index({ createdAt: -1 });

// Virtual for attendee count
eventSchema.virtual('attendeeCount').get(function() {
  return this.attendees ? this.attendees.length : 0;
});

// Virtual for likes count
eventSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Methods
eventSchema.methods.isUserAttending = function(userId) {
  return this.attendees.some(attendee => 
    attendee.user && attendee.user.toString() === userId.toString()
  );
};

eventSchema.methods.isUserLiked = function(userId) {
  return this.likes.some(like => 
    like.user && like.user.toString() === userId.toString()
  );
};

eventSchema.methods.getPublicData = function() {
  const eventObj = this.toObject();
  eventObj.attendeeCount = this.attendeeCount;
  eventObj.likesCount = this.likesCount;
  return eventObj;
};

// Static methods
eventSchema.statics.findByCategory = function(category, limit = 20) {
  return this.find({ 
    category: category, 
    status: 'published',
    visibility: 'public'
  }).limit(limit).sort({ createdAt: -1 });
};

eventSchema.statics.findUpcoming = function(limit = 20) {
  return this.find({
    'dateTime.start': { $gte: new Date() },
    status: 'published',
    visibility: 'public'
  }).limit(limit).sort({ 'dateTime.start': 1 });
};

eventSchema.statics.findFeatured = function(limit = 10) {
  return this.find({
    featured: true,
    status: 'published',
    visibility: 'public'
  }).limit(limit).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Event', eventSchema);