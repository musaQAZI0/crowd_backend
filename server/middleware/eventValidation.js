const Joi = require('joi');

// Validation schemas for event publishing
const eventPublishingValidation = {
  // Basic event requirements for publishing
  publishRequirements: Joi.object({
    title: Joi.string().required().min(1).max(200).messages({
      'string.empty': 'Event title is required',
      'string.min': 'Event title must not be empty',
      'string.max': 'Event title must be less than 200 characters',
      'any.required': 'Event title is required for publishing'
    }),

    description: Joi.string().required().min(10).max(2000).messages({
      'string.empty': 'Event description is required',
      'string.min': 'Event description must be at least 10 characters',
      'string.max': 'Event description must be less than 2000 characters',
      'any.required': 'Event description is required for publishing'
    }),

    dateTime: Joi.object({
      start: Joi.date().required().greater('now').messages({
        'date.greater': 'Event start date must be in the future',
        'any.required': 'Event start date is required for publishing'
      }),
      end: Joi.date().required().greater(Joi.ref('start')).messages({
        'date.greater': 'Event end date must be after start date',
        'any.required': 'Event end date is required for publishing'
      })
    }).required(),

    location: Joi.object({
      type: Joi.string().valid('online', 'venue', 'physical').required(),
      venue: Joi.when('type', {
        is: Joi.string().valid('venue', 'physical'),
        then: Joi.object({
          name: Joi.string().required().messages({
            'any.required': 'Venue name is required for physical events'
          }),
          address: Joi.object({
            city: Joi.string().required().messages({
              'any.required': 'City is required for venue location'
            }),
            state: Joi.string(),
            country: Joi.string().default('United States'),
            street: Joi.string(),
            zipCode: Joi.string()
          })
        }).required(),
        otherwise: Joi.optional()
      }),
      onlineDetails: Joi.when('type', {
        is: 'online',
        then: Joi.object({
          platform: Joi.string().required(),
          url: Joi.string().uri().required(),
          accessInstructions: Joi.string()
        }).required(),
        otherwise: Joi.optional()
      })
    }).required(),

    category: Joi.string().valid(
      'music', 'business', 'food', 'community', 'performing-arts',
      'film-media', 'sports', 'health', 'science-tech', 'travel-outdoor',
      'charity', 'religion', 'family-education', 'seasonal', 'government',
      'fashion', 'home-lifestyle', 'auto-boat-air', 'hobbies', 'school', 'other'
    ).required().messages({
      'any.required': 'Event category is required for publishing',
      'any.only': 'Invalid event category'
    }),

    eventType: Joi.string().valid(
      'conference', 'seminar', 'tradeshow', 'convention', 'festival',
      'concert', 'screening', 'dinner', 'class', 'meeting', 'party',
      'rally', 'tournament', 'game', 'race', 'tour', 'attraction',
      'camp', 'appearance', 'other'
    ).required().messages({
      'any.required': 'Event type is required for publishing',
      'any.only': 'Invalid event type'
    }),

    // At least one ticket type is required
    pricing: Joi.object({
      type: Joi.string().valid('free', 'paid').required(),
      ticketClasses: Joi.array().min(1).messages({
        'array.min': 'At least one ticket type is required for publishing'
      })
    }).when('ticketClasses', {
      is: Joi.array().min(1),
      otherwise: Joi.object({
        type: Joi.string().valid('free', 'paid').required()
      })
    })
  }),

  // Update validation schema
  updateEvent: Joi.object({
    title: Joi.string().min(1).max(200),
    description: Joi.string().min(10).max(2000),
    category: Joi.string().valid(
      'music', 'business', 'food', 'community', 'performing-arts',
      'film-media', 'sports', 'health', 'science-tech', 'travel-outdoor',
      'charity', 'religion', 'family-education', 'seasonal', 'government',
      'fashion', 'home-lifestyle', 'auto-boat-air', 'hobbies', 'school', 'other'
    ),
    eventType: Joi.string().valid(
      'conference', 'seminar', 'tradeshow', 'convention', 'festival',
      'concert', 'screening', 'dinner', 'class', 'meeting', 'party',
      'rally', 'tournament', 'game', 'race', 'tour', 'attraction',
      'camp', 'appearance', 'other'
    ),
    status: Joi.string().valid('draft', 'published', 'cancelled', 'completed'),
    publishedAt: Joi.date(),
    dateTime: Joi.object({
      start: Joi.date(),
      end: Joi.date().greater(Joi.ref('start'))
    }),
    location: Joi.object({
      type: Joi.string().valid('online', 'venue', 'physical'),
      venue: Joi.object({
        name: Joi.string(),
        address: Joi.object({
          street: Joi.string(),
          city: Joi.string(),
          state: Joi.string(),
          country: Joi.string(),
          zipCode: Joi.string()
        })
      }),
      onlineDetails: Joi.object({
        platform: Joi.string(),
        url: Joi.string().uri(),
        accessInstructions: Joi.string()
      })
    }),
    pricing: Joi.object({
      type: Joi.string().valid('free', 'paid'),
      amount: Joi.number().min(0)
    }),
    images: Joi.array().items(Joi.object({
      url: Joi.string().uri(),
      isPrimary: Joi.boolean()
    })),
    visibility: Joi.string().valid('public', 'private', 'unlisted'),
    tags: Joi.array().items(Joi.string()),
    featured: Joi.boolean()
  })
};

// Middleware to validate event publishing requirements
const validateEventPublishing = async (req, res, next) => {
  try {
    // Only validate if status is being set to 'published'
    if (req.body.status !== 'published') {
      return next();
    }

    const Event = require('../models/Event');
    const eventId = req.params.id;

    // Get current event data
    const currentEvent = await Event.findById(eventId);
    if (!currentEvent) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Merge current event data with update data
    const eventDataToValidate = {
      ...currentEvent.toObject(),
      ...req.body
    };

    // Validate against publishing requirements
    const { error } = eventPublishingValidation.publishRequirements.validate(eventDataToValidate, {
      abortEarly: false
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Event cannot be published due to validation errors',
        errors: validationErrors,
        requirements: {
          missingFields: validationErrors.map(err => err.field),
          totalErrors: validationErrors.length
        }
      });
    }

    next();
  } catch (error) {
    console.error('Event publishing validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating event for publishing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware to validate event update data
const validateEventUpdate = (req, res, next) => {
  try {
    const { error } = eventPublishingValidation.updateEvent.validate(req.body, {
      abortEarly: false,
      allowUnknown: true // Allow other fields not in schema
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Invalid event data provided',
        errors: validationErrors
      });
    }

    next();
  } catch (error) {
    console.error('Event update validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating event data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Function to check event publishing requirements
const checkPublishingRequirements = (event, ticketClasses = []) => {
  const requirements = {
    hasTitle: !!(event.title && event.title.trim() !== '' && event.title !== 'Event Title'),
    hasDateTime: !!(event.dateTime?.start && event.dateTime?.end),
    hasLocation: !!(event.location?.venue?.name || event.location?.onlineDetails?.url),
    hasDescription: !!(event.description && event.description.trim() !== ''),
    hasTickets: ticketClasses.length > 0 || (event.pricing?.type && event.pricing.type !== ''),
    hasEventType: !!(event.eventType),
    hasCategory: !!(event.category)
  };

  const allRequirementsMet = Object.values(requirements).every(req => req);

  return {
    requirements,
    allRequirementsMet,
    missingRequirements: Object.entries(requirements)
      .filter(([key, value]) => !value)
      .map(([key]) => key)
  };
};

module.exports = {
  validateEventPublishing,
  validateEventUpdate,
  checkPublishingRequirements,
  eventPublishingValidation
};