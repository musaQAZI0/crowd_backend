const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const Event = require('../models/Event');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

// Team permission middleware
const checkTeamPermission = (permission, action) => {
  return async (req, res, next) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.id;

      const teamMember = await TeamMember.findOne({
        teamId,
        userId,
        status: 'active'
      });

      if (!teamMember) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Not a team member'
        });
      }

      if (!teamMember.hasPermission(permission, action)) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Insufficient permissions for ${permission}.${action}`
        });
      }

      req.teamMember = teamMember;
      next();
    } catch (error) {
      console.error('Error checking team permission:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

// Create Team (automatically done when creating first event)
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { teamName, eventId } = req.body;
    const userId = req.user.id;

    // Generate team ID
    const teamId = teamName ? teamName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() :
                  'team-' + Date.now();

    // Create owner team member
    const teamOwner = new TeamMember({
      teamId,
      userId,
      organizerId: userId,
      role: 'owner',
      status: 'active',
      invitedBy: userId,
      joinedAt: new Date()
    });

    await teamOwner.save();

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      team: {
        teamId,
        role: 'owner',
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team'
    });
  }
});

// Invite Team Member
router.post('/:teamId/invite', authenticateToken, checkTeamPermission('team', 'invite'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role = 'helper', customPermissions } = req.body;
    const invitedBy = req.user.id;

    // Validate email
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this email not found. They need to sign up first.'
      });
    }

    // Check if already a team member
    const existingMember = await TeamMember.findOne({
      teamId,
      userId: user._id
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(400).json({
          success: false,
          message: 'User is already a team member'
        });
      } else if (existingMember.status === 'invited') {
        return res.status(400).json({
          success: false,
          message: 'User already has a pending invitation'
        });
      }
    }

    // Generate invite token
    const inviteToken = uuidv4();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const teamMember = new TeamMember({
      teamId,
      userId: user._id,
      organizerId: req.teamMember.organizerId,
      role,
      status: 'invited',
      invitedBy,
      inviteToken,
      inviteExpires
    });

    // Set custom permissions if provided
    if (customPermissions) {
      teamMember.permissions = customPermissions;
    }

    await teamMember.save();

    // Send invitation email (placeholder - integrate with actual email service)
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/team/invite/${inviteToken}`;

    // TODO: Send actual email
    console.log(`Invite sent to ${email}: ${inviteLink}`);

    res.status(201).json({
      success: true,
      message: 'Team invitation sent successfully',
      invitation: {
        email,
        role,
        inviteToken,
        expiresAt: inviteExpires
      }
    });
  } catch (error) {
    console.error('Error inviting team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send team invitation'
    });
  }
});

// Accept Team Invitation
router.post('/invite/:token/accept', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const teamMember = await TeamMember.findOne({
      inviteToken: token,
      userId,
      status: 'invited'
    });

    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired invitation'
      });
    }

    if (teamMember.inviteExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invitation has expired'
      });
    }

    // Accept invitation
    teamMember.status = 'active';
    teamMember.joinedAt = new Date();
    teamMember.inviteToken = undefined;
    teamMember.inviteExpires = undefined;

    await teamMember.save();

    res.json({
      success: true,
      message: 'Team invitation accepted successfully',
      team: {
        teamId: teamMember.teamId,
        role: teamMember.role,
        permissions: teamMember.permissions
      }
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept invitation'
    });
  }
});

// Get Team Members
router.get('/:teamId/members', authenticateToken, checkTeamPermission('team', 'view'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { status = 'active' } = req.query;

    const filter = { teamId };
    if (status !== 'all') {
      filter.status = status;
    }

    const members = await TeamMember.find(filter)
      .populate('userId', 'firstName lastName email profilePicture lastLogin createdAt')
      .populate('invitedBy', 'firstName lastName email')
      .sort({ role: 1, joinedAt: 1 });

    const memberData = members.map(member => ({
      id: member._id,
      user: member.userId,
      role: member.role,
      permissions: member.permissions,
      status: member.status,
      joinedAt: member.joinedAt,
      lastActive: member.lastActive,
      invitedBy: member.invitedBy,
      invitedAt: member.invitedAt
    }));

    res.json({
      success: true,
      members: memberData,
      summary: {
        total: members.length,
        active: members.filter(m => m.status === 'active').length,
        pending: members.filter(m => m.status === 'invited').length
      }
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members'
    });
  }
});

// Update Team Member Role
router.patch('/:teamId/members/:memberId/role', authenticateToken, checkTeamPermission('team', 'edit_roles'), async (req, res) => {
  try {
    const { teamId, memberId } = req.params;
    const { role, customPermissions } = req.body;

    const validRoles = ['admin', 'manager', 'helper', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    const teamMember = await TeamMember.findOne({
      _id: memberId,
      teamId,
      status: 'active'
    });

    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Prevent changing owner role
    if (teamMember.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change owner role'
      });
    }

    // Update role and permissions
    teamMember.role = role;
    if (customPermissions) {
      teamMember.permissions = customPermissions;
    } else {
      teamMember.setRolePermissions();
    }

    await teamMember.save();

    res.json({
      success: true,
      message: 'Team member role updated successfully',
      member: {
        id: teamMember._id,
        role: teamMember.role,
        permissions: teamMember.permissions
      }
    });
  } catch (error) {
    console.error('Error updating team member role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member role'
    });
  }
});

// Remove Team Member
router.delete('/:teamId/members/:memberId', authenticateToken, checkTeamPermission('team', 'remove'), async (req, res) => {
  try {
    const { teamId, memberId } = req.params;

    const teamMember = await TeamMember.findOne({
      _id: memberId,
      teamId
    });

    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Prevent removing owner
    if (teamMember.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove team owner'
      });
    }

    await TeamMember.findByIdAndDelete(memberId);

    res.json({
      success: true,
      message: 'Team member removed successfully'
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove team member'
    });
  }
});

// Get User's Teams
router.get('/my-teams', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const teams = await TeamMember.getUserTeams(userId);

    const teamsWithStats = await Promise.all(teams.map(async (team) => {
      const memberCount = await TeamMember.countDocuments({
        teamId: team.teamId,
        status: 'active'
      });

      const eventCount = await Event.countDocuments({
        organizer: team.organizerId
      });

      return {
        teamId: team.teamId,
        role: team.role,
        permissions: team.permissions,
        organizer: team.organizerId,
        joinedAt: team.joinedAt,
        stats: {
          memberCount,
          eventCount
        }
      };
    }));

    res.json({
      success: true,
      teams: teamsWithStats
    });
  } catch (error) {
    console.error('Error fetching user teams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user teams'
    });
  }
});

// Update Team Member Activity
router.post('/:teamId/activity', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    await TeamMember.findOneAndUpdate(
      { teamId, userId, status: 'active' },
      { lastActive: new Date() }
    );

    res.json({
      success: true,
      message: 'Activity updated'
    });
  } catch (error) {
    console.error('Error updating activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update activity'
    });
  }
});

// Get Team Activity Log
router.get('/:teamId/activity-log', authenticateToken, checkTeamPermission('team', 'view'), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { limit = 50 } = req.query;

    // Get recent member activities
    const members = await TeamMember.find({
      teamId,
      status: 'active',
      lastActive: { $exists: true }
    })
    .populate('userId', 'firstName lastName email profilePicture')
    .sort({ lastActive: -1 })
    .limit(parseInt(limit));

    const activityLog = members.map(member => ({
      user: member.userId,
      role: member.role,
      lastActive: member.lastActive,
      joinedAt: member.joinedAt
    }));

    res.json({
      success: true,
      activityLog
    });
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity log'
    });
  }
});

// Team Statistics
router.get('/:teamId/stats', authenticateToken, checkTeamPermission('team', 'view'), async (req, res) => {
  try {
    const { teamId } = req.params;

    const [
      totalMembers,
      activeMembers,
      pendingInvites,
      recentActivity,
      roleDistribution
    ] = await Promise.all([
      TeamMember.countDocuments({ teamId }),
      TeamMember.countDocuments({ teamId, status: 'active' }),
      TeamMember.countDocuments({ teamId, status: 'invited' }),
      TeamMember.countDocuments({
        teamId,
        status: 'active',
        lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      TeamMember.aggregate([
        { $match: { teamId, status: 'active' } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalMembers,
        activeMembers,
        pendingInvites,
        recentActivity,
        roleDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team statistics'
    });
  }
});

module.exports = router;