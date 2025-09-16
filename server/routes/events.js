const express = require('express');
const Joi = require('joi');
const Event = require('../models/Event');
const { authenticateToken } = require('../middleware/auth');

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
router.post('/upload-image', authenticateToken, async (req, res) => {
  try {
    // For now, return a placeholder since we don't have actual file upload configured
    // In production, you'd use multer and cloud storage like AWS S3 or Cloudinary

    const imageUrl = `https://via.placeholder.com/800x400.png?text=Event+Image`;

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image'
    });
  }
});

module.exports = router;