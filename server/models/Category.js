const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  value: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  subcategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    eventCount: {
      type: Number,
      default: 0
    },
    popularityScore: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for getting all events in this category
CategorySchema.virtual('eventCount', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Index for performance
CategorySchema.index({ name: 1 });
CategorySchema.index({ value: 1 });
CategorySchema.index({ parentCategory: 1 });
CategorySchema.index({ isActive: 1, sortOrder: 1 });

// Pre-save middleware to generate value from name if not provided
CategorySchema.pre('save', function(next) {
  if (!this.value && this.name) {
    this.value = this.name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  }
  next();
});

// Static method to get categories with subcategories
CategorySchema.statics.getCategoriesWithSubcategories = async function() {
  return await this.find({ parentCategory: null, isActive: true })
    .populate({
      path: 'subcategories',
      match: { isActive: true },
      options: { sort: { sortOrder: 1, name: 1 } }
    })
    .sort({ sortOrder: 1, name: 1 });
};

// Static method to get flat list of all categories
CategorySchema.statics.getAllCategoriesFlat = async function() {
  return await this.find({ isActive: true })
    .sort({ name: 1 });
};

// Instance method to add subcategory
CategorySchema.methods.addSubcategory = async function(subcategoryId) {
  if (!this.subcategories.includes(subcategoryId)) {
    this.subcategories.push(subcategoryId);
    await this.save();
  }
};

// Instance method to remove subcategory
CategorySchema.methods.removeSubcategory = async function(subcategoryId) {
  this.subcategories.pull(subcategoryId);
  await this.save();
};

module.exports = mongoose.model('Category', CategorySchema);