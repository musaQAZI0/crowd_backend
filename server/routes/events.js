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

module.exports = router;