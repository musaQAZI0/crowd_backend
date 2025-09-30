const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { LiveEvent } = require('../models/LiveEvent');
const Analytics = require('../models/Analytics');

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

// Socket.io connection handler
const handleConnection = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.firstName} ${socket.user.lastName} connected`);

    // Join event room
    socket.on('join_event', async (data) => {
      try {
        const { eventId } = data;

        if (!eventId) {
          socket.emit('error', { message: 'Event ID is required' });
          return;
        }

        // Join the event room
        socket.join(`event_${eventId}`);
        socket.eventId = eventId;

        // Track user joining event
        const analytics = new Analytics({
          eventId,
          userId: socket.user._id,
          sessionId: socket.id,
          action: 'join_live_event',
          metadata: {
            socketId: socket.id,
            userAgent: socket.handshake.headers['user-agent'],
            ipAddress: socket.handshake.address
          }
        });
        await analytics.save();

        // Update live event active users count
        const liveEvent = await LiveEvent.findOne({ eventId });
        if (liveEvent && liveEvent.status === 'live') {
          const activeUsers = await getActiveUsersCount(eventId);
          liveEvent.metrics.activeUsers = activeUsers;

          if (activeUsers > liveEvent.metrics.peakAttendance) {
            liveEvent.metrics.peakAttendance = activeUsers;
          }

          await liveEvent.save();

          // Broadcast updated user count
          io.to(`event_${eventId}`).emit('active_users_update', {
            activeUsers,
            peakAttendance: liveEvent.metrics.peakAttendance
          });
        }

        socket.emit('joined_event', {
          eventId,
          message: 'Successfully joined event',
          activeUsers: await getActiveUsersCount(eventId)
        });

        console.log(`User ${socket.user._id} joined event ${eventId}`);
      } catch (error) {
        console.error('Error joining event:', error);
        socket.emit('error', { message: 'Failed to join event' });
      }
    });

    // Leave event room
    socket.on('leave_event', async (data) => {
      try {
        const { eventId } = data;

        if (eventId) {
          socket.leave(`event_${eventId}`);

          // Update active users count
          const activeUsers = await getActiveUsersCount(eventId);
          const liveEvent = await LiveEvent.findOne({ eventId });

          if (liveEvent && liveEvent.status === 'live') {
            liveEvent.metrics.activeUsers = activeUsers;
            await liveEvent.save();

            // Broadcast updated user count
            io.to(`event_${eventId}`).emit('active_users_update', { activeUsers });
          }

          socket.emit('left_event', { eventId, message: 'Left event successfully' });
          console.log(`User ${socket.user._id} left event ${eventId}`);
        }
      } catch (error) {
        console.error('Error leaving event:', error);
        socket.emit('error', { message: 'Failed to leave event' });
      }
    });

    // Real-time typing indicator for chat
    socket.on('typing_start', (data) => {
      const { eventId } = data;
      if (eventId && socket.eventId === eventId) {
        socket.to(`event_${eventId}`).emit('user_typing', {
          userId: socket.user._id,
          userName: `${socket.user.firstName} ${socket.user.lastName}`,
          isTyping: true
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const { eventId } = data;
      if (eventId && socket.eventId === eventId) {
        socket.to(`event_${eventId}`).emit('user_typing', {
          userId: socket.user._id,
          userName: `${socket.user.firstName} ${socket.user.lastName}`,
          isTyping: false
        });
      }
    });

    // Real-time reactions
    socket.on('send_reaction', async (data) => {
      try {
        const { eventId, emoji, targetType, targetId } = data;

        if (!eventId || !emoji || !targetType) {
          socket.emit('error', { message: 'Missing required fields for reaction' });
          return;
        }

        const reaction = {
          userId: socket.user._id,
          userName: `${socket.user.firstName} ${socket.user.lastName}`,
          emoji,
          targetType,
          targetId,
          timestamp: new Date()
        };

        // Broadcast reaction to all users in the event
        io.to(`event_${eventId}`).emit('reaction_received', reaction);

        // Track in analytics
        const analytics = new Analytics({
          eventId,
          userId: socket.user._id,
          sessionId: socket.id,
          action: 'engagement_interaction',
          metadata: {
            type: 'reaction',
            emoji,
            targetType,
            targetId
          }
        });
        await analytics.save();

      } catch (error) {
        console.error('Error sending reaction:', error);
        socket.emit('error', { message: 'Failed to send reaction' });
      }
    });

    // Live engagement tracking
    socket.on('track_engagement', async (data) => {
      try {
        const { eventId, action, metadata = {} } = data;

        if (!eventId || !action) {
          return;
        }

        const analytics = new Analytics({
          eventId,
          userId: socket.user._id,
          sessionId: socket.id,
          action,
          metadata: {
            ...metadata,
            realtime: true,
            socketId: socket.id
          }
        });
        await analytics.save();

        // Update live event metrics
        const liveEvent = await LiveEvent.findOne({ eventId });
        if (liveEvent && liveEvent.status === 'live') {
          liveEvent.metrics.totalInteractions++;
          await liveEvent.save();
        }

      } catch (error) {
        console.error('Error tracking engagement:', error);
      }
    });

    // Screen sharing for presentations (host only)
    socket.on('start_screen_share', async (data) => {
      try {
        const { eventId, streamId } = data;

        // Verify user is event organizer
        const Event = require('../models/Event');
        const event = await Event.findOne({ _id: eventId, organizer: socket.user._id });

        if (!event) {
          socket.emit('error', { message: 'Only event organizers can start screen sharing' });
          return;
        }

        // Broadcast to all attendees
        socket.to(`event_${eventId}`).emit('screen_share_started', {
          hostId: socket.user._id,
          hostName: `${socket.user.firstName} ${socket.user.lastName}`,
          streamId
        });

        socket.emit('screen_share_confirmed', { streamId });

      } catch (error) {
        console.error('Error starting screen share:', error);
        socket.emit('error', { message: 'Failed to start screen sharing' });
      }
    });

    socket.on('stop_screen_share', (data) => {
      const { eventId } = data;
      socket.to(`event_${eventId}`).emit('screen_share_stopped', {
        hostId: socket.user._id
      });
    });

    // Handle user activity updates
    socket.on('user_activity', async (data) => {
      try {
        const { eventId, activity } = data;

        if (eventId && activity) {
          // Track user activity
          const analytics = new Analytics({
            eventId,
            userId: socket.user._id,
            sessionId: socket.id,
            action: 'user_activity',
            metadata: { activity }
          });
          await analytics.save();

          // Broadcast activity to moderators/hosts
          socket.to(`event_${eventId}_moderators`).emit('user_activity_update', {
            userId: socket.user._id,
            userName: `${socket.user.firstName} ${socket.user.lastName}`,
            activity,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('Error tracking user activity:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      try {
        console.log(`User ${socket.user._id} disconnected: ${reason}`);

        if (socket.eventId) {
          // Update active users count
          const activeUsers = await getActiveUsersCount(socket.eventId);
          const liveEvent = await LiveEvent.findOne({ eventId: socket.eventId });

          if (liveEvent && liveEvent.status === 'live') {
            liveEvent.metrics.activeUsers = activeUsers;
            await liveEvent.save();

            // Broadcast updated user count
            io.to(`event_${socket.eventId}`).emit('active_users_update', { activeUsers });
          }

          // Track user leaving event
          const analytics = new Analytics({
            eventId: socket.eventId,
            userId: socket.user._id,
            sessionId: socket.id,
            action: 'leave_live_event',
            metadata: {
              reason,
              duration: Date.now() - socket.handshake.time
            }
          });
          await analytics.save();
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      socket.emit('error', { message: 'An error occurred' });
    });
  });

  // Helper function to get active users count
  async function getActiveUsersCount(eventId) {
    try {
      const sockets = await io.in(`event_${eventId}`).fetchSockets();
      return sockets.length;
    } catch (error) {
      console.error('Error getting active users count:', error);
      return 0;
    }
  }

  // Periodic cleanup and metrics update
  setInterval(async () => {
    try {
      // Update metrics for all live events
      const liveEvents = await LiveEvent.find({ status: 'live' });

      for (const liveEvent of liveEvents) {
        const activeUsers = await getActiveUsersCount(liveEvent.eventId);

        if (activeUsers !== liveEvent.metrics.activeUsers) {
          liveEvent.metrics.activeUsers = activeUsers;

          if (activeUsers > liveEvent.metrics.peakAttendance) {
            liveEvent.metrics.peakAttendance = activeUsers;
          }

          await liveEvent.save();

          // Broadcast updated metrics
          io.to(`event_${liveEvent.eventId}`).emit('metrics_update', {
            activeUsers: liveEvent.metrics.activeUsers,
            peakAttendance: liveEvent.metrics.peakAttendance,
            totalInteractions: liveEvent.metrics.totalInteractions
          });
        }
      }
    } catch (error) {
      console.error('Error updating live event metrics:', error);
    }
  }, 30000); // Update every 30 seconds

  return io;
};

module.exports = { handleConnection, authenticateSocket };