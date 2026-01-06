const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/auth');
const backupMiddleware = require('../middleware/backup-middleware');
const fs = require('node:fs').promises;
const path = require('node:path');

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
  validatePaymentMethod,
  addIncome,
  getAllIncome
} = require('../utils/csv-manager');

const DATA_DIR = path.join(__dirname, '../../data');
const CSV_FILE = path.join(DATA_DIR, 'financial_data.csv');
const {
  addCategory,
  addSubcategory,
  getCategories,
  getCategoriesFile,
  validateCategory,
  validateSubcategory,
  clearCache,
  writeCategoriesFile
} = require('../utils/category-manager');
const {
  loadBudget,
  writeBudgetFile,
  duplicateLastMonth,
  getCurrentMonth
} = require('../utils/budget-manager');

// POST /vault/spend - Add new financial entry
router.post('/spend', backupMiddleware('POST /spend'), apiKeyAuth, async (req, res) => {
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

// PUT /vault/data - Overwrite entire transaction file
router.put('/data', backupMiddleware('PUT /data'), apiKeyAuth, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (content === undefined) {
      return res.status(400).json({
        error: 'Missing required field: content'
      });
    }
    
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Ensure content ends with proper newline to prevent CSV corruption
    let normalizedContent = content;
    if (!normalizedContent.endsWith('\n')) {
      normalizedContent += '\n';
    }
    
    // Write entire content to CSV file with proper newline handling
    await fs.writeFile(CSV_FILE, normalizedContent, 'utf8');
    
    res.status(200).json({
      success: true,
      message: 'Transaction data updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('PUT /vault/data error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update transaction data'
    });
  }
});

// GET /vault/categories - Get available categories and subcategories
router.get('/categories', apiKeyAuth, async (req, res) => {
  try {
    const fileContent = await getCategoriesFile();
    res.json(fileContent);
  } catch (error) {
    console.error('GET /vault/categories error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve categories'
    });
  }
});

// POST /vault/income - Add new income entry
router.post('/income', backupMiddleware('POST /income'), apiKeyAuth, async (req, res) => {
  try {
    const { date, amount, name } = req.body;
    
    // Validate required fields
    if (!date || amount === null || amount === undefined || !name) {
      return res.status(400).json({
        error: 'Missing required fields: date, amount, name'
      });
    }
    
    // Validate data formats
    validateDate(date);
    const validName = validateName(name);
    const validAmount = validateAmount(amount);
    
    // Add income to CSV
    const csvLine = await addIncome({
      date,
      name: validName,
      amount: validAmount
    });
    
    res.status(201).json({
      success: true,
      message: 'Income added successfully',
      preview: csvLine,
      entry: {
        date,
        name: validName,
        amount: validAmount
      }
    });
    
  } catch (error) {
    console.error('POST /vault/income error:', error);
    
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
      message: 'Failed to add income'
    });
  }
});

// GET /vault/income - Retrieve all income data
router.get('/income', apiKeyAuth, async (req, res) => {
  try {
    const content = await getAllIncome();
    res.type('text/csv').send(content);
  } catch (error) {
    console.error('GET /vault/income error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve income data'
    });
  }
});

// PUT /vault/income - Overwrite entire income file
router.put('/income', backupMiddleware('PUT /income'), apiKeyAuth, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (content === undefined) {
      return res.status(400).json({
        error: 'Missing required field: content'
      });
    }
    
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Write entire content to income file (no validation as requested)
    await fs.writeFile(path.join(DATA_DIR, 'income.csv'), content, 'utf8');
    
    res.status(200).json({
      success: true,
      message: 'Income data updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('PUT /vault/income error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update income data'
    });
  }
});

// GET /vault/budget - Retrieve current budget
router.get('/budget', apiKeyAuth, async (req, res) => {
  try {
    const budget = await loadBudget();
    res.json(budget);
  } catch (error) {
    console.error('GET /vault/budget error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve budget'
    });
  }
});

// PUT /vault/budget - Overwrite entire budget file
router.put('/budget', backupMiddleware('PUT /budget'), apiKeyAuth, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (content === undefined) {
      return res.status(400).json({
        error: 'Missing required field: content'
      });
    }
    
    // Write entire content to budget file (no validation as requested)
    await writeBudgetFile(content);
    
    res.status(200).json({
      success: true,
      message: 'Budget updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('PUT /vault/budget error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update budget'
    });
  }
});

// POST /vault/budget/duplicate - Duplicate last month to current month
router.post('/budget/duplicate', backupMiddleware('POST /budget/duplicate'), apiKeyAuth, async (req, res) => {
  try {
    const { targetMonth } = req.body;
    
    // Duplicate last month to current month (or specified month)
    const result = await duplicateLastMonth(targetMonth);
    
    // Get the updated budget to return
    const budget = await loadBudget();
    
    res.status(201).json({
      success: true,
      message: `Budget duplicated from ${result.sourceMonth} to ${result.targetMonth}`,
      result,
      budget
    });
  } catch (error) {
    console.error('POST /vault/budget/duplicate error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to duplicate budget',
      details: error.message
    });
  }
});

// PUT /vault/categories - Overwrite entire categories file
router.put('/categories', backupMiddleware('PUT /categories'), apiKeyAuth, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (content === undefined) {
      return res.status(400).json({
        error: 'Missing required field: content'
      });
    }
    
    // Write entire content to categories file (no validation as requested)
    await writeCategoriesFile(content);
    
    // Clear cache to force reload on next access
    clearCache();
    
    res.status(200).json({
      success: true,
      message: 'Categories updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('PUT /vault/categories error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update categories'
    });
  }
});

// POST /vault/categories - Add new category or subcategory
router.post('/categories', backupMiddleware('POST /categories'), apiKeyAuth, async (req, res) => {
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