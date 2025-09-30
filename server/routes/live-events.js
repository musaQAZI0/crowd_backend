const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { LiveEvent, Icebreaker, LivePoll, LiveQA, LivePhoto, LiveChat } = require('../models/LiveEvent');
const Event = require('../models/Event');
const User = require('../models/User');
const Analytics = require('../models/Analytics');

// Start Live Event
router.post('/:eventId/start', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { liveSettings } = req.body;

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found or access denied'
      });
    }

    // Check if live event already exists
    let liveEvent = await LiveEvent.findOne({ eventId });

    if (liveEvent && liveEvent.status === 'live') {
      return res.status(400).json({
        success: false,
        message: 'Event is already live'
      });
    }

    if (!liveEvent) {
      liveEvent = new LiveEvent({
        eventId,
        liveSettings: liveSettings || {}
      });
    }

    liveEvent.status = 'live';
    liveEvent.startedAt = new Date();
    if (liveSettings) {
      liveEvent.liveSettings = { ...liveEvent.liveSettings, ...liveSettings };
    }

    await liveEvent.save();

    // Emit to socket.io (will be handled by socket service)
    req.app.get('io')?.to(`event_${eventId}`).emit('event_started', {
      eventId,
      liveEventId: liveEvent._id,
      startedAt: liveEvent.startedAt
    });

    res.json({
      success: true,
      message: 'Live event started successfully',
      liveEvent: {
        id: liveEvent._id,
        status: liveEvent.status,
        settings: liveEvent.liveSettings,
        startedAt: liveEvent.startedAt
      }
    });
  } catch (error) {
    console.error('Error starting live event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start live event'
    });
  }
});

// End Live Event
router.post('/:eventId/end', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    const liveEvent = await LiveEvent.findOne({ eventId });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found'
      });
    }

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    liveEvent.status = 'ended';
    liveEvent.endedAt = new Date();
    await liveEvent.updateMetrics();
    await liveEvent.save();

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('event_ended', {
      eventId,
      endedAt: liveEvent.endedAt,
      metrics: liveEvent.metrics
    });

    res.json({
      success: true,
      message: 'Live event ended successfully',
      metrics: liveEvent.metrics
    });
  } catch (error) {
    console.error('Error ending live event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end live event'
    });
  }
});

// Create Icebreaker Question
router.post('/:eventId/icebreakers', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const liveEvent = await LiveEvent.findOne({ eventId, status: 'live' });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found or not active'
      });
    }

    const icebreaker = new Icebreaker({
      liveEventId: liveEvent._id,
      question: question.trim()
    });

    await icebreaker.save();

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('new_icebreaker', {
      id: icebreaker._id,
      question: icebreaker.question,
      createdAt: icebreaker.createdAt
    });

    res.status(201).json({
      success: true,
      message: 'Icebreaker question created successfully',
      icebreaker: {
        id: icebreaker._id,
        question: icebreaker.question,
        responseCount: 0
      }
    });
  } catch (error) {
    console.error('Error creating icebreaker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create icebreaker question'
    });
  }
});

// Respond to Icebreaker
router.post('/:eventId/icebreakers/:icebreakerId/respond', authenticateToken, async (req, res) => {
  try {
    const { icebreakerId } = req.params;
    const { response } = req.body;

    if (!response || response.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Response is required'
      });
    }

    const icebreaker = await Icebreaker.findById(icebreakerId);
    if (!icebreaker) {
      return res.status(404).json({
        success: false,
        message: 'Icebreaker not found'
      });
    }

    // Check if user already responded
    const existingResponse = icebreaker.responses.find(r => r.userId.toString() === req.user.id);
    if (existingResponse) {
      return res.status(400).json({
        success: false,
        message: 'You have already responded to this question'
      });
    }

    const responseData = {
      userId: req.user.id,
      response: response.trim()
    };

    icebreaker.responses.push(responseData);
    icebreaker.responseCount++;
    await icebreaker.save();

    // Populate user data for response
    await icebreaker.populate('responses.userId', 'firstName lastName profilePicture');
    const newResponse = icebreaker.responses[icebreaker.responses.length - 1];

    // Emit to socket.io
    req.app.get('io')?.to(`event_${req.params.eventId}`).emit('icebreaker_response', {
      icebreakerId,
      response: {
        id: newResponse._id,
        user: newResponse.userId,
        response: newResponse.response,
        timestamp: newResponse.timestamp
      },
      totalResponses: icebreaker.responseCount
    });

    res.status(201).json({
      success: true,
      message: 'Response added successfully',
      response: newResponse
    });
  } catch (error) {
    console.error('Error responding to icebreaker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response'
    });
  }
});

// Create Live Poll
router.post('/:eventId/polls', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { question, options, allowMultiple, expiresIn } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Question and at least 2 options are required'
      });
    }

    const liveEvent = await LiveEvent.findOne({ eventId, status: 'live' });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found or not active'
      });
    }

    const pollOptions = options.map(text => ({ text: text.trim() }));

    const poll = new LivePoll({
      liveEventId: liveEvent._id,
      question: question.trim(),
      options: pollOptions,
      allowMultiple: allowMultiple || false,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
    });

    await poll.save();

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('new_poll', {
      id: poll._id,
      question: poll.question,
      options: poll.options.map(opt => ({
        text: opt.text,
        voteCount: 0
      })),
      allowMultiple: poll.allowMultiple,
      expiresAt: poll.expiresAt
    });

    res.status(201).json({
      success: true,
      message: 'Poll created successfully',
      poll: {
        id: poll._id,
        question: poll.question,
        options: poll.options,
        totalVotes: 0
      }
    });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create poll'
    });
  }
});

// Vote in Poll
router.post('/:eventId/polls/:pollId/vote', authenticateToken, async (req, res) => {
  try {
    const { pollId } = req.params;
    const { optionIndexes } = req.body;

    if (!Array.isArray(optionIndexes) || optionIndexes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'optionIndexes array is required'
      });
    }

    const poll = await LivePoll.findById(pollId);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    if (!poll.isActive || (poll.expiresAt && poll.expiresAt < new Date())) {
      return res.status(400).json({
        success: false,
        message: 'Poll is no longer active'
      });
    }

    // Check if user already voted
    const hasVoted = poll.options.some(option =>
      option.votes.some(vote => vote.userId && vote.userId.toString() === req.user.id)
    );

    if (hasVoted) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted in this poll'
      });
    }

    // Validate option indexes
    const maxIndex = poll.options.length - 1;
    if (optionIndexes.some(index => index < 0 || index > maxIndex)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option index'
      });
    }

    // Add votes
    optionIndexes.forEach(index => {
      poll.options[index].votes.push({ userId: req.user.id });
      poll.options[index].voteCount++;
      poll.totalVotes++;
    });

    await poll.save();

    // Calculate percentages
    const pollResults = poll.options.map(option => ({
      text: option.text,
      voteCount: option.voteCount,
      percentage: poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0
    }));

    // Emit to socket.io
    req.app.get('io')?.to(`event_${req.params.eventId}`).emit('poll_vote', {
      pollId,
      options: pollResults,
      totalVotes: poll.totalVotes
    });

    res.json({
      success: true,
      message: 'Vote recorded successfully',
      results: pollResults
    });
  } catch (error) {
    console.error('Error voting in poll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record vote'
    });
  }
});

// Submit Q&A Question
router.post('/:eventId/qa/questions', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const liveEvent = await LiveEvent.findOne({ eventId, status: 'live' });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found or not active'
      });
    }

    const qaQuestion = new LiveQA({
      liveEventId: liveEvent._id,
      question: question.trim(),
      askedBy: req.user.id
    });

    await qaQuestion.save();
    await qaQuestion.populate('askedBy', 'firstName lastName profilePicture');

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('new_qa_question', {
      id: qaQuestion._id,
      question: qaQuestion.question,
      askedBy: qaQuestion.askedBy,
      upvoteCount: 0,
      status: qaQuestion.status,
      createdAt: qaQuestion.createdAt
    });

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      question: {
        id: qaQuestion._id,
        question: qaQuestion.question,
        askedBy: qaQuestion.askedBy,
        upvoteCount: 0,
        status: qaQuestion.status
      }
    });
  } catch (error) {
    console.error('Error submitting Q&A question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit question'
    });
  }
});

// Upvote Q&A Question
router.post('/:eventId/qa/questions/:questionId/upvote', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await LiveQA.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Check if user already upvoted
    const hasUpvoted = question.upvotes.includes(req.user.id);

    if (hasUpvoted) {
      // Remove upvote
      question.upvotes = question.upvotes.filter(id => id.toString() !== req.user.id);
      question.upvoteCount--;
    } else {
      // Add upvote
      question.upvotes.push(req.user.id);
      question.upvoteCount++;
    }

    await question.save();

    // Emit to socket.io
    req.app.get('io')?.to(`event_${req.params.eventId}`).emit('qa_upvote', {
      questionId,
      upvoteCount: question.upvoteCount,
      userUpvoted: !hasUpvoted
    });

    res.json({
      success: true,
      message: hasUpvoted ? 'Upvote removed' : 'Question upvoted',
      upvoteCount: question.upvoteCount
    });
  } catch (error) {
    console.error('Error upvoting question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upvote question'
    });
  }
});

// Answer Q&A Question (Host only)
router.post('/:eventId/qa/questions/:questionId/answer', authenticateToken, async (req, res) => {
  try {
    const { questionId, eventId } = req.params;
    const { answer } = req.body;

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Answer is required'
      });
    }

    // Verify event ownership
    const event = await Event.findOne({ _id: eventId, organizer: req.user.id });
    if (!event) {
      return res.status(403).json({
        success: false,
        message: 'Only event organizers can answer questions'
      });
    }

    const question = await LiveQA.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    question.answer = {
      text: answer.trim(),
      answeredBy: req.user.id,
      answeredAt: new Date()
    };
    question.status = 'answered';

    await question.save();
    await question.populate('answer.answeredBy', 'firstName lastName profilePicture');

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('qa_answered', {
      questionId,
      answer: question.answer,
      status: question.status
    });

    res.json({
      success: true,
      message: 'Question answered successfully',
      answer: question.answer
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to answer question'
    });
  }
});

// Share Photo
router.post('/:eventId/photos', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { imageUrl, caption, tags } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    const liveEvent = await LiveEvent.findOne({ eventId, status: 'live' });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found or not active'
      });
    }

    const status = liveEvent.liveSettings.moderationRequired ? 'pending' : 'approved';

    const photo = new LivePhoto({
      liveEventId: liveEvent._id,
      uploadedBy: req.user.id,
      imageUrl,
      caption: caption?.trim() || '',
      tags: tags || [],
      status
    });

    await photo.save();
    await photo.populate('uploadedBy', 'firstName lastName profilePicture');

    // Emit to socket.io (only if approved or if moderation not required)
    if (status === 'approved') {
      req.app.get('io')?.to(`event_${eventId}`).emit('new_photo', {
        id: photo._id,
        imageUrl: photo.imageUrl,
        caption: photo.caption,
        uploadedBy: photo.uploadedBy,
        likeCount: 0,
        createdAt: photo.createdAt
      });
    }

    res.status(201).json({
      success: true,
      message: status === 'pending' ? 'Photo submitted for moderation' : 'Photo shared successfully',
      photo: {
        id: photo._id,
        imageUrl: photo.imageUrl,
        caption: photo.caption,
        status: photo.status,
        uploadedBy: photo.uploadedBy
      }
    });
  } catch (error) {
    console.error('Error sharing photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share photo'
    });
  }
});

// Like Photo
router.post('/:eventId/photos/:photoId/like', authenticateToken, async (req, res) => {
  try {
    const { photoId } = req.params;

    const photo = await LivePhoto.findById(photoId);
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found'
      });
    }

    const hasLiked = photo.likes.includes(req.user.id);

    if (hasLiked) {
      photo.likes = photo.likes.filter(id => id.toString() !== req.user.id);
      photo.likeCount--;
    } else {
      photo.likes.push(req.user.id);
      photo.likeCount++;
    }

    await photo.save();

    // Emit to socket.io
    req.app.get('io')?.to(`event_${req.params.eventId}`).emit('photo_like', {
      photoId,
      likeCount: photo.likeCount,
      userLiked: !hasLiked
    });

    res.json({
      success: true,
      message: hasLiked ? 'Like removed' : 'Photo liked',
      likeCount: photo.likeCount
    });
  } catch (error) {
    console.error('Error liking photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to like photo'
    });
  }
});

// Send Chat Message
router.post('/:eventId/chat', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { message, messageType = 'text' } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const liveEvent = await LiveEvent.findOne({ eventId, status: 'live' });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found or not active'
      });
    }

    const chatMessage = new LiveChat({
      liveEventId: liveEvent._id,
      userId: req.user.id,
      message: message.trim(),
      messageType
    });

    await chatMessage.save();
    await chatMessage.populate('userId', 'firstName lastName profilePicture');

    // Emit to socket.io
    req.app.get('io')?.to(`event_${eventId}`).emit('chat_message', {
      id: chatMessage._id,
      user: chatMessage.userId,
      message: chatMessage.message,
      messageType: chatMessage.messageType,
      timestamp: chatMessage.createdAt
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      chatMessage: {
        id: chatMessage._id,
        user: chatMessage.userId,
        message: chatMessage.message,
        timestamp: chatMessage.createdAt
      }
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// Get Live Event Data
router.get('/:eventId/data', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;

    const liveEvent = await LiveEvent.findOne({ eventId });
    if (!liveEvent) {
      return res.status(404).json({
        success: false,
        message: 'Live event not found'
      });
    }

    const [
      icebreakers,
      polls,
      qaQuestions,
      photos,
      recentChat
    ] = await Promise.all([
      Icebreaker.find({ liveEventId: liveEvent._id, isActive: true })
        .populate('responses.userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 }),
      LivePoll.find({ liveEventId: liveEvent._id, isActive: true })
        .sort({ createdAt: -1 }),
      LiveQA.find({ liveEventId: liveEvent._id })
        .populate('askedBy', 'firstName lastName profilePicture')
        .populate('answer.answeredBy', 'firstName lastName profilePicture')
        .sort({ upvoteCount: -1, createdAt: -1 }),
      LivePhoto.find({ liveEventId: liveEvent._id, status: 'approved' })
        .populate('uploadedBy', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .limit(20),
      LiveChat.find({ liveEventId: liveEvent._id, isVisible: true })
        .populate('userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .limit(50)
    ]);

    res.json({
      success: true,
      liveEvent: {
        id: liveEvent._id,
        status: liveEvent.status,
        settings: liveEvent.liveSettings,
        metrics: liveEvent.metrics,
        startedAt: liveEvent.startedAt,
        endedAt: liveEvent.endedAt
      },
      data: {
        icebreakers,
        polls,
        qaQuestions,
        photos,
        chat: recentChat.reverse() // Show oldest first
      }
    });
  } catch (error) {
    console.error('Error fetching live event data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch live event data'
    });
  }
});

module.exports = router;