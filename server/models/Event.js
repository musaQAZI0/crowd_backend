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
          'music', 'business', 'food', 'community', 'performing-arts',
          'film-media', 'sports', 'health', 'science-tech', 'travel-outdoor',
          'charity', 'religion', 'family-education', 'seasonal', 'government',
          'fashion', 'home-lifestyle', 'auto-boat-air', 'hobbies', 'school', 'other'
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
      enum: ['online', 'venue', 'physical'],
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
    // Advanced ticket classes structure based on Eventbrite model
    ticketClasses: [{
      id: {
        type: String,
        default: function() { return new mongoose.Types.ObjectId().toString(); }
      },
      name: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['free', 'paid', 'donation'],
        required: true
      },
      free: {
        type: Boolean,
        default: function() { return this.type === 'free'; }
      },
      donation: {
        type: Boolean,
        default: function() { return this.type === 'donation'; }
      },
      cost: {
        value: {
          type: Number,
          default: 0
        },
        currency: {
          type: String,
          default: 'USD'
        },
        display: String // "USD,2000" format
      },
      suggestedDonation: {
        type: Number,
        default: 0
      },
      quantity: {
        total: Number, // null for unlimited
        sold: {
          type: Number,
          default: 0
        },
        reserved: {
          type: Number,
          default: 0
        }
      },
      restrictions: {
        minimumQuantity: {
          type: Number,
          default: 1
        },
        maximumQuantity: Number, // null for unlimited
        requiresApproval: {
          type: Boolean,
          default: false
        }
      },
      sales: {
        start: Date,
        end: Date,
        hideSaleDates: {
          type: Boolean,
          default: false
        }
      },
      visibility: {
        hidden: {
          type: Boolean,
          default: false
        },
        autoHide: {
          type: Boolean,
          default: false
        },
        autoHideBefore: Date,
        autoHideAfter: Date
      },
      salesChannels: [{
        type: String,
        enum: ['online', 'atd', 'facebook', 'everywhere'],
        default: 'online'
      }],
      deliveryMethods: [{
        type: String,
        enum: ['electronic', 'physical', 'will_call'],
        default: 'electronic'
      }],
      fees: {
        includeFee: {
          type: Boolean,
          default: false
        },
        absorptionType: {
          type: String,
          enum: ['absorb_fee', 'pass_fee', 'split_fee']
        }
      },
      description: String,
      inventoryTierId: String, // For tiered events
      order: {
        type: Number,
        default: 0
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }],

    // Legacy tickets field for backward compatibility
    tickets: [{
      name: String,
      price: Number,
      quantity: Number,
      available: Number,
      description: String
    }]
  },

  // Inventory Tiers for advanced capacity management
  inventoryTiers: [{
    id: {
      type: String,
      default: function() { return new mongoose.Types.ObjectId().toString(); }
    },
    name: {
      type: String,
      required: true
    },
    quantityTotal: Number, // null for unlimited
    countAgainstEventCapacity: {
      type: Boolean,
      default: true
    },
    isAddon: {
      type: Boolean,
      default: false // Add-ons don't count toward event capacity
    },
    description: String,
    order: {
      type: Number,
      default: 0
    }
  }],

  // Ticket Groups for grouping multiple ticket classes
  ticketGroups: [{
    id: {
      type: String,
      default: function() { return new mongoose.Types.ObjectId().toString(); }
    },
    name: {
      type: String,
      required: true,
      maxlength: 20
    },
    status: {
      type: String,
      enum: ['live', 'transfer', 'deleted', 'archived'],
      default: 'live'
    },
    ticketClassIds: [String], // Array of ticket class IDs in this group
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Inventory information
  inventoryInfo: {
    hasAdmissionTiers: {
      type: Boolean,
      default: false
    },
    totalCapacity: Number,
    remainingCapacity: Number,
    soldOut: {
      type: Boolean,
      default: false
    }
  },

  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  videos: [{
    url: String,
    title: String,
    duration: Number, // in seconds
    thumbnail: String
  }],
  lineup: {
    enabled: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: 'Lineup'
    },
    speakers: [{
      name: {
        type: String,
        required: true
      },
      tagline: String,
      description: String,
      image: String,
      isHeadliner: {
        type: Boolean,
        default: false
      },
      socialLinks: {
        website: String,
        twitter: String,
        linkedin: String,
        instagram: String
      },
      order: {
        type: Number,
        default: 0
      }
    }]
  },
  agenda: {
    enabled: {
      type: Boolean,
      default: false
    },
    schedules: [{
      title: {
        type: String,
        default: 'Agenda'
      },
      date: Date,
      items: [{
        title: {
          type: String,
          required: true
        },
        startTime: String, // HH:MM format
        endTime: String,   // HH:MM format
        description: String,
        host: String,
        location: String,
        order: {
          type: Number,
          default: 0
        }
      }]
    }]
  },
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
    enum: ['draft', 'live', 'started', 'ended', 'completed', 'canceled'],
    default: 'draft'
  },
  eventType: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        const validEventTypes = [
          'conference', 'seminar', 'tradeshow', 'convention', 'festival',
          'concert', 'screening', 'dinner', 'class', 'meeting', 'party',
          'rally', 'tournament', 'game', 'race', 'tour', 'attraction',
          'camp', 'appearance', 'other'
        ];
        return validEventTypes.includes(v.toLowerCase());
      },
      message: 'Invalid event type provided'
    },
    set: function(v) {
      return v ? v.toLowerCase() : v;
    }
  },
  publishedAt: {
    type: Date,
    default: null
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
    },
    listed: {
      type: Boolean,
      default: true
    },
    shareable: {
      type: Boolean,
      default: true
    },
    inviteOnly: {
      type: Boolean,
      default: false
    },
    showRemaining: {
      type: Boolean,
      default: true
    },
    onlineEvent: {
      type: Boolean,
      default: false
    }
  },
  summary: {
    type: String,
    maxlength: 500  // Short summary describing the event
  },
  url: {
    type: String,  // URL of the Event's listing page on crowd.com
    trim: true
  },
  created: {
    type: Date,  // Event creation date and time
    default: Date.now
  },
  changed: {
    type: Date,  // Date and time of most recent changes
    default: Date.now
  },
  published: {
    type: Date,  // Event publication date and time
    default: null
  },
  hide_start_date: {
    type: Boolean,
    default: false  // If true, the start date should not be displayed
  },
  hide_end_date: {
    type: Boolean,
    default: false  // If true, the end date should not be displayed
  },
  password: String,
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR']  // ISO 4217 currency code
  },
  capacity_is_custom: {
    type: Boolean,
    default: false  // true = Use custom capacity value; false = Calculate from Ticket Classes
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
  }],
  // Music Properties for music-related events
  music_properties: {
    age_restriction: {
      type: String,
      enum: ['all_ages', '18+', '21+', 'family_friendly']
    },
    presented_by: {
      type: String,  // Main music event sponsor
      trim: true
    },
    door_time: {
      type: String,  // UTC time when doors open (HH:MM format)
      trim: true
    }
  },
  // External ticketing data
  external_ticketing: {
    enabled: {
      type: Boolean,
      default: false
    },
    url: String,
    provider: String
  },
  // Checkout and payment settings
  checkout_settings: {
    country: {
      type: String,
      default: 'US'
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  // Display/listing properties
  listing_properties: {
    show_map: {
      type: Boolean,
      default: true
    },
    show_social_share: {
      type: Boolean,
      default: true
    }
  },
  // Digital content flag
  has_digital_content: {
    type: Boolean,
    default: false
  }
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

  // Add primary image for frontend convenience
  if (this.images && this.images.length > 0) {
    const primaryImage = this.images.find(img => img.isPrimary) || this.images[0];
    eventObj.primaryImage = primaryImage.url;
    eventObj.imageUrl = primaryImage.url; // For backward compatibility
  }

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

// Ticket Class Methods
eventSchema.methods.addTicketClass = function(ticketData) {
  if (!this.ticketClasses) {
    this.ticketClasses = [];
  }

  const ticketClass = {
    id: new mongoose.Types.ObjectId().toString(),
    ...ticketData,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  this.ticketClasses.push(ticketClass);
  return ticketClass;
};

eventSchema.methods.updateTicketClass = function(ticketClassId, updateData) {
  const ticketClass = this.ticketClasses.id(ticketClassId) ||
                      this.ticketClasses.find(tc => tc.id === ticketClassId);

  if (ticketClass) {
    Object.assign(ticketClass, updateData);
    ticketClass.updatedAt = new Date();
    return ticketClass;
  }
  return null;
};

eventSchema.methods.removeTicketClass = function(ticketClassId) {
  const index = this.ticketClasses.findIndex(tc => tc.id === ticketClassId);
  if (index > -1) {
    return this.ticketClasses.splice(index, 1)[0];
  }
  return null;
};

eventSchema.methods.getRemainingTickets = function(ticketClassId) {
  const ticketClass = this.ticketClasses.find(tc => tc.id === ticketClassId);
  if (!ticketClass || !ticketClass.quantity.total) {
    return null; // Unlimited
  }
  return ticketClass.quantity.total - ticketClass.quantity.sold - ticketClass.quantity.reserved;
};

// Inventory Tier Methods
eventSchema.methods.addInventoryTier = function(tierData) {
  if (!this.inventoryTiers) {
    this.inventoryTiers = [];
  }

  const tier = {
    id: new mongoose.Types.ObjectId().toString(),
    ...tierData
  };

  this.inventoryTiers.push(tier);
  this.inventoryInfo.hasAdmissionTiers = true;
  return tier;
};

eventSchema.methods.updateInventoryTier = function(tierId, updateData) {
  const tier = this.inventoryTiers.find(t => t.id === tierId);
  if (tier) {
    Object.assign(tier, updateData);
    return tier;
  }
  return null;
};

// Ticket Group Methods
eventSchema.methods.addTicketGroup = function(groupData) {
  if (!this.ticketGroups) {
    this.ticketGroups = [];
  }

  const group = {
    id: new mongoose.Types.ObjectId().toString(),
    ...groupData,
    createdAt: new Date()
  };

  this.ticketGroups.push(group);
  return group;
};

eventSchema.methods.addTicketClassToGroup = function(ticketClassId, groupId) {
  const group = this.ticketGroups.find(g => g.id === groupId);
  if (group && !group.ticketClassIds.includes(ticketClassId)) {
    group.ticketClassIds.push(ticketClassId);
    return group;
  }
  return null;
};

eventSchema.methods.removeTicketClassFromGroup = function(ticketClassId, groupId) {
  const group = this.ticketGroups.find(g => g.id === groupId);
  if (group) {
    const index = group.ticketClassIds.indexOf(ticketClassId);
    if (index > -1) {
      group.ticketClassIds.splice(index, 1);
      return group;
    }
  }
  return null;
};

// Calculate total event capacity
eventSchema.methods.calculateTotalCapacity = function() {
  if (!this.inventoryInfo.hasAdmissionTiers) {
    // Simple capacity based on event capacity or sum of ticket classes
    return this.capacity?.total || null;
  }

  // For tiered events, sum the tier capacities
  let totalCapacity = 0;
  this.inventoryTiers.forEach(tier => {
    if (tier.countAgainstEventCapacity && tier.quantityTotal) {
      totalCapacity += tier.quantityTotal;
    }
  });

  return totalCapacity || null;
};

module.exports = mongoose.model('Event', eventSchema);