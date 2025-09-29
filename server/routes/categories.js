const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { authenticateToken } = require('../middleware/auth');

// Helper function for error responses
const handleError = (res, error, message = 'An error occurred', statusCode = 500) => {
  console.error('Category API Error:', error);
  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Helper function for success responses
const handleSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...data
  });
};

// GET /api/categories - List all categories with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      includeSubcategories = 'true',
      parentOnly = 'false',
      search = '',
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    let query = { isActive: true };

    // Filter by parent categories only
    if (parentOnly === 'true') {
      query.parentCategory = null;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortOptions = {};
    const sortField = ['name', 'createdAt', 'sortOrder'].includes(sortBy) ? sortBy : 'name';
    const sortDir = sortOrder === 'desc' ? -1 : 1;
    sortOptions[sortField] = sortDir;
    if (sortField !== 'sortOrder') {
      sortOptions.sortOrder = 1; // Secondary sort by sortOrder
    }

    // Execute query
    let categoriesQuery = Category.find(query);

    // Include subcategories if requested
    if (includeSubcategories === 'true') {
      categoriesQuery = categoriesQuery.populate({
        path: 'subcategories',
        match: { isActive: true },
        select: 'name value description sortOrder',
        options: { sort: { sortOrder: 1, name: 1 } }
      });
    }

    // Get total count for pagination
    const totalCategories = await Category.countDocuments(query);

    // Execute main query with pagination and sorting
    const categories = await categoriesQuery
      .select('name value description parentCategory subcategories isActive sortOrder metadata createdAt updatedAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate pagination info
    const totalPages = Math.ceil(totalCategories / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    handleSuccess(res, {
      categories,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCategories,
        limit: limitNum,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null
      },
      filters: {
        search,
        includeSubcategories: includeSubcategories === 'true',
        parentOnly: parentOnly === 'true',
        sortBy: sortField,
        sortOrder: sortOrder
      }
    }, 'Categories retrieved successfully');

  } catch (error) {
    handleError(res, error, 'Failed to retrieve categories');
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeSubcategories = 'true', includeParent = 'true' } = req.query;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return handleError(res, new Error('Invalid category ID'), 'Invalid category ID format', 400);
    }

    // Build query with population options
    let query = Category.findById(id);

    // Include subcategories if requested
    if (includeSubcategories === 'true') {
      query = query.populate({
        path: 'subcategories',
        match: { isActive: true },
        select: 'name value description sortOrder metadata',
        options: { sort: { sortOrder: 1, name: 1 } }
      });
    }

    // Include parent category if requested
    if (includeParent === 'true') {
      query = query.populate({
        path: 'parentCategory',
        select: 'name value description'
      });
    }

    const category = await query;

    if (!category) {
      return handleError(res, new Error('Category not found'), 'Category not found', 404);
    }

    // Check if category is active
    if (!category.isActive) {
      return handleError(res, new Error('Category is inactive'), 'Category is not available', 404);
    }

    handleSuccess(res, {
      category
    }, 'Category retrieved successfully');

  } catch (error) {
    handleError(res, error, 'Failed to retrieve category');
  }
});

// GET /api/categories/tree - Get categories in tree structure
router.get('/tree/hierarchy', async (req, res) => {
  try {
    const categories = await Category.getCategoriesWithSubcategories();

    handleSuccess(res, {
      categories,
      totalCount: categories.length
    }, 'Category tree retrieved successfully');

  } catch (error) {
    handleError(res, error, 'Failed to retrieve category tree');
  }
});

// POST /api/categories - Create new category (Admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin privileges (you may need to implement this check)
    // if (!req.user.isAdmin) {
    //   return handleError(res, new Error('Unauthorized'), 'Admin access required', 403);
    // }

    const {
      name,
      value,
      description,
      parentCategory,
      sortOrder = 0
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return handleError(res, new Error('Name is required'), 'Category name is required', 400);
    }

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingCategory) {
      return handleError(res, new Error('Category already exists'), 'Category with this name already exists', 409);
    }

    // Create new category
    const categoryData = {
      name: name.trim(),
      description: description?.trim(),
      sortOrder: parseInt(sortOrder) || 0
    };

    if (value) {
      categoryData.value = value.trim().toLowerCase();
    }

    if (parentCategory) {
      // Validate parent category exists
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return handleError(res, new Error('Parent category not found'), 'Parent category not found', 404);
      }
      categoryData.parentCategory = parentCategory;
    }

    const category = new Category(categoryData);
    await category.save();

    // If this is a subcategory, add it to parent's subcategories array
    if (parentCategory) {
      await Category.findByIdAndUpdate(
        parentCategory,
        { $addToSet: { subcategories: category._id } }
      );
    }

    handleSuccess(res, {
      category
    }, 'Category created successfully', 201);

  } catch (error) {
    handleError(res, error, 'Failed to create category');
  }
});

// PUT /api/categories/:id - Update category (Admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin privileges
    // if (!req.user.isAdmin) {
    //   return handleError(res, new Error('Unauthorized'), 'Admin access required', 403);
    // }

    const { id } = req.params;
    const {
      name,
      value,
      description,
      parentCategory,
      sortOrder,
      isActive
    } = req.body;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return handleError(res, new Error('Invalid category ID'), 'Invalid category ID format', 400);
    }

    const category = await Category.findById(id);
    if (!category) {
      return handleError(res, new Error('Category not found'), 'Category not found', 404);
    }

    // Build update object
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (value) updateData.value = value.trim().toLowerCase();
    if (description !== undefined) updateData.description = description?.trim();
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder) || 0;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    // Handle parent category change
    if (parentCategory !== undefined) {
      if (parentCategory && parentCategory !== category.parentCategory?.toString()) {
        // Validate new parent exists
        const parent = await Category.findById(parentCategory);
        if (!parent) {
          return handleError(res, new Error('Parent category not found'), 'Parent category not found', 404);
        }
        updateData.parentCategory = parentCategory;
      } else if (parentCategory === null) {
        updateData.parentCategory = null;
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    handleSuccess(res, {
      category: updatedCategory
    }, 'Category updated successfully');

  } catch (error) {
    handleError(res, error, 'Failed to update category');
  }
});

// DELETE /api/categories/:id - Delete category (Admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user has admin privileges
    // if (!req.user.isAdmin) {
    //   return handleError(res, new Error('Unauthorized'), 'Admin access required', 403);
    // }

    const { id } = req.params;

    // Validate ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return handleError(res, new Error('Invalid category ID'), 'Invalid category ID format', 400);
    }

    const category = await Category.findById(id);
    if (!category) {
      return handleError(res, new Error('Category not found'), 'Category not found', 404);
    }

    // Check if category has subcategories
    if (category.subcategories && category.subcategories.length > 0) {
      return handleError(res,
        new Error('Cannot delete category with subcategories'),
        'Cannot delete category that has subcategories. Delete subcategories first.',
        409
      );
    }

    // Soft delete (set isActive to false) instead of hard delete
    await Category.findByIdAndUpdate(id, { isActive: false });

    // Remove from parent's subcategories array if applicable
    if (category.parentCategory) {
      await Category.findByIdAndUpdate(
        category.parentCategory,
        { $pull: { subcategories: id } }
      );
    }

    handleSuccess(res, {}, 'Category deleted successfully');

  } catch (error) {
    handleError(res, error, 'Failed to delete category');
  }
});

module.exports = router;