const express = require('express');
const router = express.Router();
const MonetizeApplication = require('../models/MonetizeApplication');
const auth = require('../middleware/auth');
const { requireAdminAuth } = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

// Rate limiting for application submissions
const applicationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 applications per hour per IP
  message: { error: 'Too many applications submitted. Please try again later.' }
});

// Validation middleware
const validateApplication = (req, res, next) => {
  const { contactInfo, businessInfo, applicationType } = req.body;

  // Basic validation
  if (!contactInfo || !contactInfo.fullName || !contactInfo.email || !contactInfo.phone) {
    return res.status(400).json({ error: 'Contact information is required' });
  }

  if (!businessInfo || !businessInfo.businessName) {
    return res.status(400).json({ error: 'Business name is required' });
  }

  if (!applicationType || !['influencer', 'venue'].includes(applicationType)) {
    return res.status(400).json({ error: 'Valid application type is required' });
  }

  // Type-specific validation
  if (applicationType === 'influencer') {
    const { influencerDetails } = req.body;
    if (!influencerDetails || !influencerDetails.niche) {
      return res.status(400).json({ error: 'Influencer details and niche are required' });
    }
  }

  if (applicationType === 'venue') {
    const { venueDetails } = req.body;
    if (!venueDetails || !venueDetails.venueType || !venueDetails.capacity || !venueDetails.location) {
      return res.status(400).json({ error: 'Venue details, type, capacity, and location are required' });
    }
  }

  next();
};

// Submit influencer application
router.post('/apply/influencer', auth, applicationLimit, validateApplication, async (req, res) => {
  try {
    // Check if user already has a pending/approved influencer application
    const existingApplication = await MonetizeApplication.findOne({
      userId: req.user.id,
      applicationType: 'influencer',
      status: { $in: ['pending', 'under_review', 'approved'] }
    });

    if (existingApplication) {
      return res.status(400).json({
        error: 'You already have an existing influencer application',
        applicationId: existingApplication.applicationId,
        status: existingApplication.status
      });
    }

    const applicationData = {
      userId: req.user.id,
      applicationType: 'influencer',
      contactInfo: req.body.contactInfo,
      businessInfo: req.body.businessInfo,
      influencerDetails: req.body.influencerDetails
    };

    const application = new MonetizeApplication(applicationData);
    await application.save();

    // Populate user info for response
    await application.populate('userId', 'username email');

    res.status(201).json({
      message: 'Influencer application submitted successfully',
      application: {
        id: application._id,
        applicationId: application.applicationId,
        status: application.status,
        submissionDate: application.submissionDate
      }
    });

  } catch (error) {
    console.error('Error submitting influencer application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Submit venue application
router.post('/apply/venue', auth, applicationLimit, validateApplication, async (req, res) => {
  try {
    // Check if user already has a pending/approved venue application
    const existingApplication = await MonetizeApplication.findOne({
      userId: req.user.id,
      applicationType: 'venue',
      status: { $in: ['pending', 'under_review', 'approved'] }
    });

    if (existingApplication) {
      return res.status(400).json({
        error: 'You already have an existing venue application',
        applicationId: existingApplication.applicationId,
        status: existingApplication.status
      });
    }

    const applicationData = {
      userId: req.user.id,
      applicationType: 'venue',
      contactInfo: req.body.contactInfo,
      businessInfo: req.body.businessInfo,
      venueDetails: req.body.venueDetails
    };

    const application = new MonetizeApplication(applicationData);
    await application.save();

    // Populate user info for response
    await application.populate('userId', 'username email');

    res.status(201).json({
      message: 'Venue application submitted successfully',
      application: {
        id: application._id,
        applicationId: application.applicationId,
        status: application.status,
        submissionDate: application.submissionDate
      }
    });

  } catch (error) {
    console.error('Error submitting venue application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Get user's applications
router.get('/my-applications', auth, async (req, res) => {
  try {
    const applications = await MonetizeApplication.find({ userId: req.user.id })
      .populate('reviewedBy', 'username email')
      .sort({ submissionDate: -1 });

    res.json({ applications });
  } catch (error) {
    console.error('Error fetching user applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get specific application by ID (user's own only)
router.get('/application/:id', auth, async (req, res) => {
  try {
    const application = await MonetizeApplication.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('reviewedBy', 'username email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ application });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// Get all applications (admin only)
router.get('/admin/applications', requireAdminAuth, async (req, res) => {
  try {
    const {
      status,
      type,
      page = 1,
      limit = 20,
      sortBy = 'submissionDate',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.applicationType = type;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const applications = await MonetizeApplication.find(filter)
      .populate('userId', 'username email createdAt')
      .populate('reviewedBy', 'username email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await MonetizeApplication.countDocuments(filter);

    res.json({
      applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get application statistics (admin only)
router.get('/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    const stats = await MonetizeApplication.getStats();

    // Additional stats
    const recentApplications = await MonetizeApplication.find({
      submissionDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).countDocuments();

    const avgProcessingTime = await MonetizeApplication.aggregate([
      {
        $match: {
          status: { $in: ['approved', 'rejected'] },
          reviewDate: { $exists: true }
        }
      },
      {
        $project: {
          processingTime: { $subtract: ['$reviewDate', '$submissionDate'] }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$processingTime' }
        }
      }
    ]);

    res.json({
      ...stats,
      recentApplications,
      avgProcessingTimeHours: avgProcessingTime[0] ? Math.round(avgProcessingTime[0].avgTime / (1000 * 60 * 60)) : 0
    });
  } catch (error) {
    console.error('Error fetching application stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Update application status (admin only)
router.patch('/admin/application/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['pending', 'under_review', 'approved', 'rejected', 'needs_info'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const application = await MonetizeApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    await application.updateStatus(status, req.admin.id, notes);
    await application.populate('userId', 'username email');
    await application.populate('reviewedBy', 'username email');

    res.json({
      message: 'Application status updated successfully',
      application
    });
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

// Get specific application (admin only)
router.get('/admin/application/:id', requireAdminAuth, async (req, res) => {
  try {
    const application = await MonetizeApplication.findById(req.params.id)
      .populate('userId', 'username email createdAt lastLogin')
      .populate('reviewedBy', 'username email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Increment view count
    application.metrics.viewCount += 1;
    application.metrics.lastViewed = new Date();
    await application.save();

    res.json({ application });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// Delete application (admin only)
router.delete('/admin/application/:id', requireAdminAuth, async (req, res) => {
  try {
    const application = await MonetizeApplication.findByIdAndDelete(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// Search applications (admin only)
router.get('/admin/search', requireAdminAuth, async (req, res) => {
  try {
    const { q, type, status } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const filter = {
      $or: [
        { 'contactInfo.fullName': { $regex: q, $options: 'i' } },
        { 'contactInfo.email': { $regex: q, $options: 'i' } },
        { 'businessInfo.businessName': { $regex: q, $options: 'i' } }
      ]
    };

    if (type) filter.applicationType = type;
    if (status) filter.status = status;

    const applications = await MonetizeApplication.find(filter)
      .populate('userId', 'username email')
      .populate('reviewedBy', 'username email')
      .sort({ submissionDate: -1 })
      .limit(50);

    res.json({ applications });
  } catch (error) {
    console.error('Error searching applications:', error);
    res.status(500).json({ error: 'Failed to search applications' });
  }
});

module.exports = router;