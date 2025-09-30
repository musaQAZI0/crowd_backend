const mongoose = require('mongoose');

// Live Event Engagement Schema
const liveEventSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'scheduled'
  },
  liveSettings: {
    enableChat: { type: Boolean, default: true },
    enablePolls: { type: Boolean, default: true },
    enableQA: { type: Boolean, default: true },
    enablePhotoSharing: { type: Boolean, default: true },
    moderationRequired: { type: Boolean, default: true }
  },
  metrics: {
    activeUsers: { type: Number, default: 0 },
    totalInteractions: { type: Number, default: 0 },
    peakAttendance: { type: Number, default: 0 },
    averageEngagementTime: { type: Number, default: 0 }
  },
  startedAt: Date,
  endedAt: Date
}, {
  timestamps: true
});

// Icebreaker Questions Schema
const icebreakerSchema = new mongoose.Schema({
  liveEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 500
  },
  isActive: {
    type: Boolean,
    default: true
  },
  responses: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    response: {
      type: String,
      required: true,
      maxlength: 1000
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  responseCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Live Polls Schema
const livePollSchema = new mongoose.Schema({
  liveEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 500
  },
  options: [{
    text: {
      type: String,
      required: true,
      maxlength: 200
    },
    votes: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    voteCount: {
      type: Number,
      default: 0
    }
  }],
  totalVotes: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  allowMultiple: {
    type: Boolean,
    default: false
  },
  expiresAt: Date
}, {
  timestamps: true
});

// Live Q&A Schema
const liveQASchema = new mongoose.Schema({
  liveEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 1000
  },
  askedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  upvoteCount: {
    type: Number,
    default: 0
  },
  answer: {
    text: String,
    answeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    answeredAt: Date
  },
  status: {
    type: String,
    enum: ['pending', 'answered', 'dismissed'],
    default: 'pending'
  },
  isHighlighted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Live Photo Sharing Schema
const livePhotoSchema = new mongoose.Schema({
  liveEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  caption: {
    type: String,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date,
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  tags: [String]
}, {
  timestamps: true
});

// Live Chat Schema
const liveChatSchema = new mongoose.Schema({
  liveEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveEvent',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  messageType: {
    type: String,
    enum: ['text', 'emoji', 'system'],
    default: 'text'
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderationReason: String,
  reactions: [{
    emoji: String,
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }]
}, {
  timestamps: true
});

// Indexes
liveEventSchema.index({ eventId: 1 });
icebreakerSchema.index({ liveEventId: 1, isActive: 1 });
livePollSchema.index({ liveEventId: 1, isActive: 1 });
liveQASchema.index({ liveEventId: 1, status: 1, upvoteCount: -1 });
livePhotoSchema.index({ liveEventId: 1, status: 1, createdAt: -1 });
liveChatSchema.index({ liveEventId: 1, createdAt: -1 });

// Methods for real-time stats
liveEventSchema.methods.updateMetrics = async function() {
  const [
    chatMessages,
    pollVotes,
    qaQuestions,
    photos
  ] = await Promise.all([
    mongoose.model('LiveChat').countDocuments({ liveEventId: this._id }),
    mongoose.model('LivePoll').aggregate([
      { $match: { liveEventId: this._id } },
      { $group: { _id: null, total: { $sum: '$totalVotes' } } }
    ]),
    mongoose.model('LiveQA').countDocuments({ liveEventId: this._id }),
    mongoose.model('LivePhoto').countDocuments({ liveEventId: this._id })
  ]);

  this.metrics.totalInteractions =
    chatMessages +
    (pollVotes[0]?.total || 0) +
    qaQuestions +
    photos;

  await this.save();
};

const LiveEvent = mongoose.model('LiveEvent', liveEventSchema);
const Icebreaker = mongoose.model('Icebreaker', icebreakerSchema);
const LivePoll = mongoose.model('LivePoll', livePollSchema);
const LiveQA = mongoose.model('LiveQA', liveQASchema);
const LivePhoto = mongoose.model('LivePhoto', livePhotoSchema);
const LiveChat = mongoose.model('LiveChat', liveChatSchema);

module.exports = {
  LiveEvent,
  Icebreaker,
  LivePoll,
  LiveQA,
  LivePhoto,
  LiveChat
};