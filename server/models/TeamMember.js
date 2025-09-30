const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  teamId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['owner', 'admin', 'manager', 'helper', 'viewer'],
    default: 'helper'
  },
  permissions: {
    events: {
      create: { type: Boolean, default: false },
      edit: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      publish: { type: Boolean, default: false },
      view: { type: Boolean, default: true }
    },
    marketing: {
      create: { type: Boolean, default: false },
      edit: { type: Boolean, default: false },
      send: { type: Boolean, default: false },
      view: { type: Boolean, default: true }
    },
    analytics: {
      view: { type: Boolean, default: true },
      export: { type: Boolean, default: false }
    },
    team: {
      invite: { type: Boolean, default: false },
      remove: { type: Boolean, default: false },
      edit_roles: { type: Boolean, default: false },
      view: { type: Boolean, default: true }
    },
    finance: {
      view: { type: Boolean, default: false },
      manage: { type: Boolean, default: false }
    }
  },
  status: {
    type: String,
    enum: ['invited', 'active', 'suspended', 'left'],
    default: 'invited'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invitedAt: {
    type: Date,
    default: Date.now
  },
  joinedAt: {
    type: Date
  },
  lastActive: {
    type: Date
  },
  inviteToken: {
    type: String,
    unique: true,
    sparse: true
  },
  inviteExpires: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
teamMemberSchema.index({ userId: 1 });
teamMemberSchema.index({ organizerId: 1 });
teamMemberSchema.index({ inviteToken: 1 });

// Pre-save middleware to set role-based permissions
teamMemberSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    this.setRolePermissions();
  }
  next();
});

// Method to set permissions based on role
teamMemberSchema.methods.setRolePermissions = function() {
  const rolePermissions = {
    owner: {
      events: { create: true, edit: true, delete: true, publish: true, view: true },
      marketing: { create: true, edit: true, send: true, view: true },
      analytics: { view: true, export: true },
      team: { invite: true, remove: true, edit_roles: true, view: true },
      finance: { view: true, manage: true }
    },
    admin: {
      events: { create: true, edit: true, delete: true, publish: true, view: true },
      marketing: { create: true, edit: true, send: true, view: true },
      analytics: { view: true, export: true },
      team: { invite: true, remove: false, edit_roles: false, view: true },
      finance: { view: true, manage: false }
    },
    manager: {
      events: { create: true, edit: true, delete: false, publish: true, view: true },
      marketing: { create: true, edit: true, send: true, view: true },
      analytics: { view: true, export: false },
      team: { invite: false, remove: false, edit_roles: false, view: true },
      finance: { view: true, manage: false }
    },
    helper: {
      events: { create: false, edit: true, delete: false, publish: false, view: true },
      marketing: { create: false, edit: false, send: false, view: true },
      analytics: { view: true, export: false },
      team: { invite: false, remove: false, edit_roles: false, view: true },
      finance: { view: false, manage: false }
    },
    viewer: {
      events: { create: false, edit: false, delete: false, publish: false, view: true },
      marketing: { create: false, edit: false, send: false, view: true },
      analytics: { view: true, export: false },
      team: { invite: false, remove: false, edit_roles: false, view: true },
      finance: { view: false, manage: false }
    }
  };

  this.permissions = rolePermissions[this.role] || rolePermissions.viewer;
};

// Method to check specific permission
teamMemberSchema.methods.hasPermission = function(category, action) {
  return this.permissions[category] && this.permissions[category][action];
};

// Static method to get team members with permissions
teamMemberSchema.statics.getTeamMembers = async function(teamId) {
  return await this.find({ teamId, status: 'active' })
    .populate('userId', 'firstName lastName email profilePicture lastLogin')
    .populate('invitedBy', 'firstName lastName email')
    .sort({ role: 1, joinedAt: 1 });
};

// Static method to get user's teams
teamMemberSchema.statics.getUserTeams = async function(userId) {
  return await this.find({ userId, status: 'active' })
    .populate('organizerId', 'firstName lastName email profilePicture')
    .sort({ joinedAt: -1 });
};

module.exports = mongoose.model('TeamMember', teamMemberSchema);