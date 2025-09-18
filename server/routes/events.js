const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const Event = require('../models/Event');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'video/mp4',
      'video/mov',
      'video/avi'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG images and MP4, MOV videos are allowed.'));
    }
  }
});

const router = express.Router();

// Get all events with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      location, 
      date, 
      featured, 
      limit = 20, 
      page = 1,
      sort = 'date'
    } = req.query;

    // Build query
    const query = {
      status: 'published',
      visibility: 'public'
    };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (location) {
      query.$or = [
        { 'location.venue.address.city': new RegExp(location, 'i') },
        { 'location.venue.address.state': new RegExp(location, 'i') }
      ];
    }

    if (date) {
      const targetDate = new Date(date);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      query['dateTime.start'] = {
        $gte: targetDate,
        $lt: nextDay
      };
    }

    if (featured === 'true') {
      query.featured = true;
    }

    // Sorting
    let sortOptions = { createdAt: -1 };
    switch (sort) {
      case 'date':
        sortOptions = { 'dateTime.start': 1 };
        break;
      case 'popular':
        sortOptions = { views: -1, likesCount: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
    }

    const limitNum = Math.min(parseInt(limit), 50); // Max 50 events per request
    const skip = (parseInt(page) - 1) * limitNum;

    const events = await Event.find(query)
      .populate('organizer', 'firstName lastName email profilePicture')
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip);

    const total = await Event.countDocuments(query);

    res.json({
      success: true,
      events: events.map(event => event.getPublicData()),
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events'
    });
  }
});

// Get events by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;

    const events = await Event.findByCategory(category, parseInt(limit))
      .populate('organizer', 'firstName lastName email profilePicture');

    res.json({
      success: true,
      category,
      events: events.map(event => event.getPublicData())
    });

  } catch (error) {
    console.error('Error fetching events by category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events by category'
    });
  }
});

// Get upcoming events
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const events = await Event.findUpcoming(parseInt(limit))
      .populate('organizer', 'firstName lastName email profilePicture');

    res.json({
      success: true,
      events: events.map(event => event.getPublicData())
    });

  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming events'
    });
  }
});

// Get featured events
router.get('/featured', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const events = await Event.findFeatured(parseInt(limit))
      .populate('organizer', 'firstName lastName email profilePicture');

    res.json({
      success: true,
      events: events.map(event => event.getPublicData())
    });

  } catch (error) {
    console.error('Error fetching featured events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured events'
    });
  }
});

// Get user's events (Protected route) - Must be BEFORE /:id route
router.get('/my-events', authenticateToken, async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user.id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      events: events.map(event => event.getPublicData())
    });

  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user events'
    });
  }
});

// Get single event by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id)
      .populate('organizer', 'firstName lastName email profilePicture organizerProfile')
      .populate('attendees.user', 'firstName lastName profilePicture');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Increment view count
    event.views += 1;
    await event.save();

    res.json({
      success: true,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event'
    });
  }
});

// Create sample events for testing (temporary endpoint)
router.post('/create-samples', async (req, res) => {
  try {
    const sampleEvents = [
      {
        title: 'Friday Night Jazz at The Blue Note',
        description: 'Join us for an intimate evening of smooth jazz featuring local artists and special guest performers. Enjoy craft cocktails and a sophisticated atmosphere.',
        category: 'nightlife',
        organizer: '507f1f77bcf86cd799439011', // This would be a real user ID
        organizerInfo: {
          name: 'Blue Note Events',
          email: 'events@bluenote.com'
        },
        dateTime: {
          start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000) // +4 hours
        },
        location: {
          type: 'venue',
          venue: {
            name: 'The Blue Note',
            address: {
              street: '131 W 3rd St',
              city: 'New York',
              state: 'NY',
              country: 'USA',
              zipCode: '10012'
            }
          }
        },
        pricing: {
          type: 'paid',
          amount: 25,
          tickets: [
            { name: 'General Admission', price: 25, quantity: 100, available: 85 }
          ]
        },
        status: 'published',
        featured: true,
        tags: ['jazz', 'music', 'nightlife', 'drinks'],
        images: [
          { url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800', isPrimary: true }
        ]
      },
      {
        title: 'Rooftop Summer Party',
        description: 'Dance under the stars at our exclusive rooftop party. DJ sets, premium drinks, and stunning city views await!',
        category: 'nightlife',
        organizer: '507f1f77bcf86cd799439011',
        organizerInfo: {
          name: 'Skyline Events',
          email: 'info@skylineevents.com'
        },
        dateTime: {
          start: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000)
        },
        location: {
          type: 'venue',
          venue: {
            name: 'Sky Lounge',
            address: {
              street: '200 5th Ave',
              city: 'New York',
              state: 'NY', 
              country: 'USA',
              zipCode: '10010'
            }
          }
        },
        pricing: {
          type: 'paid',
          amount: 45,
          tickets: [
            { name: 'Early Bird', price: 35, quantity: 50, available: 12 },
            { name: 'General Admission', price: 45, quantity: 150, available: 134 }
          ]
        },
        status: 'published',
        featured: true,
        tags: ['party', 'rooftop', 'dance', 'dj', 'nightlife'],
        images: [
          { url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800', isPrimary: true }
        ]
      },
      {
        title: 'Wine Tasting & Live Acoustic',
        description: 'An elegant evening combining fine wines with intimate acoustic performances. Perfect for a sophisticated night out.',
        category: 'food-drink',
        organizer: '507f1f77bcf86cd799439011',
        organizerInfo: {
          name: 'Vino & Vibes',
          email: 'events@vinovibes.com'
        },
        dateTime: {
          start: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000)
        },
        location: {
          type: 'venue',
          venue: {
            name: 'The Wine Cellar',
            address: {
              street: '45 Grove St',
              city: 'New York',
              state: 'NY',
              country: 'USA', 
              zipCode: '10014'
            }
          }
        },
        pricing: {
          type: 'paid',
          amount: 65,
          tickets: [
            { name: 'Wine Tasting Experience', price: 65, quantity: 40, available: 23 }
          ]
        },
        status: 'published',
        tags: ['wine', 'acoustic', 'music', 'tasting', 'elegant'],
        images: [
          { url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800', isPrimary: true }
        ]
      }
    ];

    const createdEvents = await Event.insertMany(sampleEvents);

    res.status(201).json({
      success: true,
      message: `Created ${createdEvents.length} sample events`,
      events: createdEvents.map(event => event.getPublicData())
    });

  } catch (error) {
    console.error('Error creating sample events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sample events'
    });
  }
});

// Test route - temporary
router.post('/test', (req, res) => {
  res.json({ success: true, message: 'POST route working' });
});

// Create new event (Protected route) - Updated to fix deployment issue
router.post('/', authenticateToken, async (req, res) => {
  try {
    const eventData = {
      ...req.body,
      organizer: req.user.id
    };

    // Convert frontend format to backend format
    if (eventData.startDate && eventData.endDate) {
      eventData.dateTime = {
        start: new Date(eventData.startDate),
        end: new Date(eventData.endDate)
      };
      delete eventData.startDate;
      delete eventData.endDate;
    }

    if (eventData.venue || eventData.city) {
      eventData.location = {
        type: eventData.isOnline ? 'online' : 'venue',
        venue: {
          name: eventData.venue || '',
          address: {
            street: eventData.address || '',
            city: eventData.city || '',
            state: eventData.state || '',
            country: eventData.country || 'United States',
            zipCode: eventData.zipCode || ''
          }
        }
      };
    }

    if (eventData.price !== undefined) {
      eventData.pricing = {
        type: eventData.price > 0 ? 'paid' : 'free',
        amount: eventData.price || 0,
        tickets: eventData.price > 0 ? [{
          name: 'General Admission',
          price: eventData.price,
          quantity: eventData.capacity || 100,
          available: eventData.capacity || 100
        }] : []
      };
    }

    // Set images if provided
    if (eventData.imageUrl) {
      eventData.images = [{
        url: eventData.imageUrl,
        isPrimary: true
      }];
    }

    // Handle video upload
    if (eventData.videoUrl) {
      eventData.videos = [{
        url: eventData.videoUrl,
        title: eventData.title || 'Event Video'
      }];
    }

    // Handle lineup data
    if (eventData.lineup && eventData.lineup.enabled) {
      eventData.lineup = {
        enabled: true,
        title: eventData.lineup.title || 'Lineup',
        speakers: eventData.lineup.speakers || []
      };
    }

    // Handle agenda data
    if (eventData.agenda && eventData.agenda.enabled) {
      eventData.agenda = {
        enabled: true,
        schedules: eventData.agenda.schedules || []
      };
    }

    // Handle additional settings
    if (eventData.settings) {
      eventData.settings = {
        ...eventData.settings,
        listed: eventData.settings.listed !== undefined ? eventData.settings.listed : true,
        shareable: eventData.settings.shareable !== undefined ? eventData.settings.shareable : true,
        onlineEvent: eventData.settings.onlineEvent || false
      };
    }

    const event = new Event(eventData);
    await event.save();

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create event'
    });
  }
});

// Update event (Protected route)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Find event and check ownership
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this event'
      });
    }

    // Convert frontend format to backend format
    if (updateData.startDate && updateData.endDate) {
      updateData.dateTime = {
        start: new Date(updateData.startDate),
        end: new Date(updateData.endDate)
      };
      delete updateData.startDate;
      delete updateData.endDate;
    }

    if (updateData.venue || updateData.city) {
      updateData.location = {
        type: updateData.isOnline ? 'online' : 'venue',
        venue: {
          name: updateData.venue || '',
          address: {
            street: updateData.address || '',
            city: updateData.city || '',
            state: updateData.state || '',
            country: updateData.country || 'United States',
            zipCode: updateData.zipCode || ''
          }
        }
      };
    }

    if (updateData.price !== undefined) {
      updateData.pricing = {
        type: updateData.price > 0 ? 'paid' : 'free',
        amount: updateData.price || 0,
        tickets: updateData.price > 0 ? [{
          name: 'General Admission',
          price: updateData.price,
          quantity: updateData.capacity || 100,
          available: updateData.capacity || 100
        }] : []
      };
    }

    // Set images if provided
    if (updateData.imageUrl) {
      updateData.images = [{
        url: updateData.imageUrl,
        isPrimary: true
      }];
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Event updated successfully',
      event: updatedEvent.getPublicData()
    });

  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update event'
    });
  }
});

// /my-events route is positioned before /:id route to prevent conflicts

// Upload image for event (Protected route)
router.post('/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // For development, we'll use placeholder URLs
    // In production, you'd upload to AWS S3, Cloudinary, or similar service
    const imageUrl = `https://picsum.photos/800/400?random=${Date.now()}`;

    // Log file details for debugging
    console.log('Image upload details:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      user: req.user.id
    });

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl,
      fileDetails: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });

  } catch (error) {
    console.error('Error uploading image:', error);

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 100MB.'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload image: ' + error.message
    });
  }
});

// Video upload endpoint
router.post('/upload-video', authenticateToken, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    // For development, we'll use placeholder URLs
    // In production, you'd upload to AWS S3, Cloudinary, or similar service
    const videoUrl = `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`;
    const thumbnailUrl = `https://picsum.photos/800/450?random=${Date.now()}`;

    // Log file details for debugging
    console.log('Video upload details:', {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      user: req.user.id
    });

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      fileDetails: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });

  } catch (error) {
    console.error('Error uploading video:', error);

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 100MB.'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload video: ' + error.message
    });
  }
});

// Add lineup speaker
router.post('/:id/lineup/speakers', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const speakerData = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    // Initialize lineup if not exists
    if (!event.lineup.enabled) {
      event.lineup = {
        enabled: true,
        title: speakerData.sectionTitle || 'Lineup',
        speakers: []
      };
    }

    // Add speaker
    const newSpeaker = {
      name: speakerData.name,
      tagline: speakerData.tagline,
      description: speakerData.description,
      image: speakerData.image,
      isHeadliner: speakerData.isHeadliner || false,
      socialLinks: speakerData.socialLinks || {},
      order: event.lineup.speakers.length
    };

    event.lineup.speakers.push(newSpeaker);
    await event.save();

    res.json({
      success: true,
      message: 'Speaker added successfully',
      speaker: newSpeaker,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error adding speaker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add speaker'
    });
  }
});

// Update lineup speaker
router.put('/:id/lineup/speakers/:speakerId', authenticateToken, async (req, res) => {
  try {
    const { id, speakerId } = req.params;
    const updateData = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const speaker = event.lineup.speakers.id(speakerId);
    if (!speaker) {
      return res.status(404).json({
        success: false,
        message: 'Speaker not found'
      });
    }

    // Update speaker
    Object.assign(speaker, updateData);
    await event.save();

    res.json({
      success: true,
      message: 'Speaker updated successfully',
      speaker: speaker,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error updating speaker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update speaker'
    });
  }
});

// Delete lineup speaker
router.delete('/:id/lineup/speakers/:speakerId', authenticateToken, async (req, res) => {
  try {
    const { id, speakerId } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    event.lineup.speakers.pull(speakerId);
    await event.save();

    res.json({
      success: true,
      message: 'Speaker deleted successfully',
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error deleting speaker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete speaker'
    });
  }
});

// Add agenda schedule
router.post('/:id/agenda/schedules', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const scheduleData = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    // Initialize agenda if not exists
    if (!event.agenda.enabled) {
      event.agenda = {
        enabled: true,
        schedules: []
      };
    }

    // Add schedule
    const newSchedule = {
      title: scheduleData.title || 'Agenda',
      date: scheduleData.date || event.dateTime.start,
      items: scheduleData.items || []
    };

    event.agenda.schedules.push(newSchedule);
    await event.save();

    res.json({
      success: true,
      message: 'Schedule added successfully',
      schedule: newSchedule,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error adding schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add schedule'
    });
  }
});

// Add agenda item to schedule
router.post('/:id/agenda/schedules/:scheduleId/items', authenticateToken, async (req, res) => {
  try {
    const { id, scheduleId } = req.params;
    const itemData = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const schedule = event.agenda.schedules.id(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    // Add agenda item
    const newItem = {
      title: itemData.title,
      startTime: itemData.startTime,
      endTime: itemData.endTime,
      description: itemData.description,
      host: itemData.host,
      location: itemData.location,
      order: schedule.items.length
    };

    schedule.items.push(newItem);
    await event.save();

    res.json({
      success: true,
      message: 'Agenda item added successfully',
      item: newItem,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error adding agenda item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add agenda item'
    });
  }
});

// Update agenda item
router.put('/:id/agenda/schedules/:scheduleId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const { id, scheduleId, itemId } = req.params;
    const updateData = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const schedule = event.agenda.schedules.id(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    const item = schedule.items.id(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Agenda item not found'
      });
    }

    // Update item
    Object.assign(item, updateData);
    await event.save();

    res.json({
      success: true,
      message: 'Agenda item updated successfully',
      item: item,
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error updating agenda item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agenda item'
    });
  }
});

// Delete agenda item
router.delete('/:id/agenda/schedules/:scheduleId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const { id, scheduleId, itemId } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const schedule = event.agenda.schedules.id(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }

    schedule.items.pull(itemId);
    await event.save();

    res.json({
      success: true,
      message: 'Agenda item deleted successfully',
      event: event.getPublicData()
    });

  } catch (error) {
    console.error('Error deleting agenda item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete agenda item'
    });
  }
});

// Event copy endpoint (like Eventbrite API)
router.post('/:id/copy', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const originalEvent = await Event.findById(id);
    if (!originalEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check ownership
    if (originalEvent.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to copy this event'
      });
    }

    // Create a copy
    const eventData = originalEvent.toObject();
    delete eventData._id;
    delete eventData.createdAt;
    delete eventData.updatedAt;
    delete eventData.attendees;
    delete eventData.likes;

    // Update title
    eventData.title = `Copy of ${eventData.title}`;
    eventData.status = 'draft';
    eventData.views = 0;
    eventData.shares = 0;

    const copiedEvent = new Event(eventData);
    await copiedEvent.save();

    res.status(201).json({
      success: true,
      message: 'Event copied successfully',
      event: copiedEvent.getPublicData()
    });

  } catch (error) {
    console.error('Error copying event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to copy event'
    });
  }
});

// ================================
// ADVANCED TICKET CLASS MANAGEMENT
// ================================

// Get event with ticket classes expansion
router.get('/:id/ticket-classes', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this event'
      });
    }

    res.json({
      success: true,
      ticketClasses: event.ticketClasses || [],
      inventoryTiers: event.inventoryTiers || [],
      ticketGroups: event.ticketGroups || [],
      inventoryInfo: event.inventoryInfo || {}
    });

  } catch (error) {
    console.error('Error fetching ticket classes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket classes'
    });
  }
});

// Create ticket class
router.post('/:id/ticket-classes', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const ticketClassData = {
      name: req.body.name,
      type: req.body.type,
      cost: {
        value: req.body.cost?.value || 0,
        currency: req.body.cost?.currency || 'USD',
        display: req.body.cost?.display
      },
      suggestedDonation: req.body.suggestedDonation || 0,
      quantity: {
        total: req.body.quantity?.total || null,
        sold: 0,
        reserved: 0
      },
      restrictions: {
        minimumQuantity: req.body.restrictions?.minimumQuantity || 1,
        maximumQuantity: req.body.restrictions?.maximumQuantity || null,
        requiresApproval: req.body.restrictions?.requiresApproval || false
      },
      sales: {
        start: req.body.sales?.start ? new Date(req.body.sales.start) : null,
        end: req.body.sales?.end ? new Date(req.body.sales.end) : null,
        hideSaleDates: req.body.sales?.hideSaleDates || false
      },
      visibility: {
        hidden: req.body.visibility?.hidden || false,
        autoHide: req.body.visibility?.autoHide || false,
        autoHideBefore: req.body.visibility?.autoHideBefore ? new Date(req.body.visibility.autoHideBefore) : null,
        autoHideAfter: req.body.visibility?.autoHideAfter ? new Date(req.body.visibility.autoHideAfter) : null
      },
      salesChannels: req.body.salesChannels || ['online'],
      deliveryMethods: req.body.deliveryMethods || ['electronic'],
      fees: {
        includeFee: req.body.fees?.includeFee || false,
        absorptionType: req.body.fees?.absorptionType || 'pass_fee'
      },
      description: req.body.description || '',
      inventoryTierId: req.body.inventoryTierId || null,
      order: req.body.order || 0
    };

    const newTicketClass = event.addTicketClass(ticketClassData);
    await event.save();

    res.json({
      success: true,
      message: 'Ticket class created successfully',
      ticketClass: newTicketClass
    });

  } catch (error) {
    console.error('Error creating ticket class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket class'
    });
  }
});

// Update ticket class
router.put('/:id/ticket-classes/:ticketClassId', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const updatedTicketClass = event.updateTicketClass(req.params.ticketClassId, req.body);
    if (!updatedTicketClass) {
      return res.status(404).json({
        success: false,
        message: 'Ticket class not found'
      });
    }

    await event.save();

    res.json({
      success: true,
      message: 'Ticket class updated successfully',
      ticketClass: updatedTicketClass
    });

  } catch (error) {
    console.error('Error updating ticket class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket class'
    });
  }
});

// Delete ticket class
router.delete('/:id/ticket-classes/:ticketClassId', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const removedTicketClass = event.removeTicketClass(req.params.ticketClassId);
    if (!removedTicketClass) {
      return res.status(404).json({
        success: false,
        message: 'Ticket class not found'
      });
    }

    await event.save();

    res.json({
      success: true,
      message: 'Ticket class deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting ticket class:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket class'
    });
  }
});

// ================================
// INVENTORY TIERS MANAGEMENT
// ================================

// Create inventory tier
router.post('/:id/inventory-tiers', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const tierData = {
      name: req.body.name,
      quantityTotal: req.body.quantityTotal,
      countAgainstEventCapacity: req.body.countAgainstEventCapacity !== false,
      isAddon: req.body.isAddon || false,
      description: req.body.description || '',
      order: req.body.order || 0
    };

    const newTier = event.addInventoryTier(tierData);
    await event.save();

    res.json({
      success: true,
      message: 'Inventory tier created successfully',
      inventoryTier: newTier
    });

  } catch (error) {
    console.error('Error creating inventory tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create inventory tier'
    });
  }
});

// Get inventory tiers
router.get('/:id/inventory-tiers', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.json({
      success: true,
      inventoryTiers: event.inventoryTiers || []
    });

  } catch (error) {
    console.error('Error fetching inventory tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory tiers'
    });
  }
});

// ================================
// TICKET GROUPS MANAGEMENT
// ================================

// Create ticket group
router.post('/:id/ticket-groups', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const groupData = {
      name: req.body.name.substring(0, 20), // Eventbrite limit
      status: req.body.status || 'live',
      ticketClassIds: req.body.ticketClassIds || []
    };

    const newGroup = event.addTicketGroup(groupData);
    await event.save();

    res.json({
      success: true,
      message: 'Ticket group created successfully',
      ticketGroup: newGroup
    });

  } catch (error) {
    console.error('Error creating ticket group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket group'
    });
  }
});

// Add ticket class to group
router.post('/:id/ticket-classes/:ticketClassId/ticket-groups', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event
    if (event.organizer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this event'
      });
    }

    const ticketGroupIds = req.body.ticket_group_ids || req.body.ticketGroupIds;
    const results = [];

    for (const groupId of ticketGroupIds) {
      const updatedGroup = event.addTicketClassToGroup(req.params.ticketClassId, groupId);
      if (updatedGroup) {
        results.push(updatedGroup);
      }
    }

    await event.save();

    res.json({
      success: true,
      message: 'Ticket class added to groups successfully',
      updatedGroups: results
    });

  } catch (error) {
    console.error('Error adding ticket class to groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add ticket class to groups'
    });
  }
});

// Get remaining tickets for a ticket class
router.get('/:id/ticket-classes/:ticketClassId/remaining', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    const remaining = event.getRemainingTickets(req.params.ticketClassId);
    const ticketClass = event.ticketClasses.find(tc => tc.id === req.params.ticketClassId);

    if (!ticketClass) {
      return res.status(404).json({
        success: false,
        message: 'Ticket class not found'
      });
    }

    res.json({
      success: true,
      ticketClassId: req.params.ticketClassId,
      quantityTotal: ticketClass.quantity.total,
      quantitySold: ticketClass.quantity.sold,
      quantityReserved: ticketClass.quantity.reserved,
      remaining: remaining,
      unlimited: remaining === null
    });

  } catch (error) {
    console.error('Error getting remaining tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get remaining tickets'
    });
  }
});

module.exports = router;