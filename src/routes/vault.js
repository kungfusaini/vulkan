const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/auth');

// Test endpoint to verify vault route is working
router.get('/test', apiKeyAuth, (req, res) => {
  res.json({ success: true, message: 'Vault route is working!' });
});
const { 
  addEntry, 
  getAllEntries, 
  getEntriesAsArray,
  validateDate,
  validateName,
  validateAmount,
  validatePaymentMethod
} = require('../utils/csv-manager');
const {
  addCategory,
  addSubcategory,
  getCategories,
  validateCategory,
  validateSubcategory
} = require('../utils/category-manager');

// POST /vault/spend - Add new financial entry
router.post('/spend', apiKeyAuth, async (req, res) => {
  try {
    const { date, name, amount, category, subcategory, payment_method, notes } = req.body;
    
    // Validate required fields
    if (!date || !name || amount === null || amount === undefined || !category || !subcategory || !payment_method) {
      return res.status(400).json({
        error: 'Missing required fields: date, name, amount, category, subcategory, payment_method'
      });
    }
    
    // Validate data formats
    validateDate(date);
    const validName = validateName(name);
    const validAmount = validateAmount(amount);
    const validPaymentMethod = validatePaymentMethod(payment_method);
    
    // Validate category and subcategory exist
    const categoryExists = await validateCategory(category);
    if (!categoryExists) {
      return res.status(400).json({
        error: `Category "${category}" does not exist. Please create it first.`
      });
    }
    
    const subcategoryExists = await validateSubcategory(category, subcategory);
    if (!subcategoryExists) {
      return res.status(400).json({
        error: `Subcategory "${subcategory}" does not exist in category "${category}". Please create it first.`
      });
    }
    
    // Add entry to CSV
    const csvLine = await addEntry({
      date,
      name: validName,
      amount: validAmount,
      category,
      subcategory,
      payment_method: validPaymentMethod,
      notes: notes || ''
    });
    
    res.status(201).json({
      success: true,
      message: 'Entry added successfully',
      preview: csvLine,
      entry: {
        date,
        name: validName,
        amount: validAmount,
        category,
        subcategory,
        payment_method: validPaymentMethod,
        notes: notes || ''
      }
    });
    
  } catch (error) {
    console.error('POST /vault/spend error:', error);
    
    if (error.message.includes('required') || 
        error.message.includes('format') || 
        error.message.includes('Invalid') ||
        error.message.includes('cannot') ||
        error.message.includes('must be')) {
      return res.status(400).json({
        error: error.message
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to add entry'
    });
  }
});

// GET /vault/data - Retrieve all financial data
router.get('/data', apiKeyAuth, async (req, res) => {
  try {
    const content = await getAllEntries();
    res.type('text/csv').send(content);
  } catch (error) {
    console.error('GET /vault/data error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve data'
    });
  }
});

// GET /vault/categories - Get available categories and subcategories
router.get('/categories', apiKeyAuth, async (req, res) => {
  try {
    const categories = await getCategories();
    const categoryCount = Object.keys(categories).length;
    const subcategoryCount = Object.values(categories).reduce((sum, subs) => sum + subs.length, 0);
    
    res.json({
      success: true,
      categories,
      stats: {
        categories: categoryCount,
        subcategories: subcategoryCount
      }
    });
  } catch (error) {
    console.error('GET /vault/categories error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve categories'
    });
  }
});

// POST /vault/categories - Add new category or subcategory
router.post('/categories', apiKeyAuth, async (req, res) => {
  try {
    console.log('POST /vault/categories request body:', req.body);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    const { category: inputCategory, subcategory: inputSubcategory } = req.body;
    console.log('Extracted category:', inputCategory, 'subcategory:', inputSubcategory);
    
    if (!inputCategory || typeof inputCategory !== 'string') {
      return res.status(400).json({
        error: 'Category is required and must be a string'
      });
    }
    
    const category = inputCategory.trim();
    if (category.length === 0) {
      return res.status(400).json({
        error: 'Category cannot be empty'
      });
    }
    
    if (!inputSubcategory) {
      // Add new category
      const result = await addCategory(category);
      res.status(201).json({
        success: true,
        message: `Category "${category}" added successfully`,
        result
      });
    } else {
      // Add new subcategory
      if (typeof inputSubcategory !== 'string') {
        return res.status(400).json({
          error: 'Subcategory must be a string'
        });
      }
      
      const trimmedSubcategory = inputSubcategory.trim();
      if (trimmedSubcategory.length === 0) {
        return res.status(400).json({
          error: 'Subcategory cannot be empty'
        });
      }
      
      const result = await addSubcategory(category, trimmedSubcategory);
      res.status(201).json({
        success: true,
        message: `Subcategory "${trimmedSubcategory}" added to category "${category}" successfully`,
        result
      });
    }
    
  } catch (error) {
    console.error('POST /vault/categories error:', error);
    
    if (error.message.includes('already exists') || 
        error.message.includes('does not exist') ||
        error.message.includes('required') ||
        error.message.includes('empty')) {
      return res.status(400).json({
        error: error.message
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to add category/subcategory'
    });
  }
});

// GET /vault/summary - Get summary statistics
router.get('/summary', apiKeyAuth, async (req, res) => {
  try {
    const entries = await getEntriesAsArray();
    const categories = await getCategories();
    
    if (entries.length === 0) {
      return res.json({
        success: true,
        summary: {
          total_entries: 0,
          total_amount: 0,
          categories_count: Object.keys(categories).length,
          average_amount: 0
        }
      });
    }
    
    const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const averageAmount = totalAmount / entries.length;
    
    // Group by category
    const categoryTotals = {};
    entries.forEach(entry => {
      if (!categoryTotals[entry.category]) {
        categoryTotals[entry.category] = { count: 0, total: 0 };
      }
      categoryTotals[entry.category].count++;
      categoryTotals[entry.category].total += entry.amount;
    });
    
    res.json({
      success: true,
      summary: {
        total_entries: entries.length,
        total_amount: Math.round(totalAmount * 100) / 100,
        categories_count: Object.keys(categories).length,
        average_amount: Math.round(averageAmount * 100) / 100,
        category_breakdown: categoryTotals
      }
    });
    
  } catch (error) {
    console.error('GET /vault/summary error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate summary'
    });
  }
});

module.exports = router;