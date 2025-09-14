const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  profilePicture: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  dateOfBirth: {
    type: Date
  },
  location: {
    city: String,
    state: String,
    country: String
  },
  interests: [{
    type: String,
    trim: true
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isOrganizer: {
    type: Boolean,
    default: false
  },
  organizerProfile: {
    companyName: String,
    companyDescription: String,
    website: String,
    socialMedia: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String
    }
  },
  settings: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      eventUpdates: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public'
      },
      showLocation: {
        type: Boolean,
        default: true
      }
    }
  },
  eventsAttended: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  eventsOrganized: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  favoriteEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '7d'
    }
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active'
  },
  authStatus: {
    activeTokens: [{
      token: String,
      device: String,
      userAgent: String,
      ipAddress: String,
      createdAt: {
        type: Date,
        default: Date.now
      },
      lastActivity: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    }],
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      return ret;
    }
  }
});

userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'location.city': 1, 'location.state': 1 });
userSchema.index({ interests: 1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshTokens;
  return userObject;
};

userSchema.methods.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};

// Clean up expired sessions
userSchema.methods.cleanExpiredSessions = async function() {
  const now = new Date();

  if (this.authStatus && this.authStatus.activeTokens) {
    this.authStatus.activeTokens = this.authStatus.activeTokens.filter(token =>
      token.expiresAt > now
    );

    // Update online status if no active sessions
    if (this.authStatus.activeTokens.length === 0) {
      this.authStatus.isOnline = false;
      this.authStatus.lastSeen = now;
    }
  }

  return this.save();
};

// Static method to clean expired sessions for all users
userSchema.statics.cleanAllExpiredSessions = function() {
  const now = new Date();
  return this.updateMany(
    { 'authStatus.activeTokens.expiresAt': { $lt: now } },
    {
      $pull: { 'authStatus.activeTokens': { expiresAt: { $lt: now } } }
    }
  );
};

userSchema.methods.addRefreshToken = function(token) {
  this.refreshTokens.push({ token });
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }
  return this.save();
};

userSchema.methods.removeRefreshToken = function(token) {
  this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
  return this.save();
};

userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  });
};

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);