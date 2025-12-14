const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/auth');
const { writeToMarkdown } = require('../utils/file-writer');
const fs = require('node:fs').promises;
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '../../data');

router.post('/', apiKeyAuth, async (req, res) => {
  try {
    const { type, body } = req.body;
    
    if (!type || !body) {
      return res.status(400).json({
        error: 'Missing required fields: type and body'
      });
    }
    
    const normalizedType = type.toLowerCase();
    
    if (typeof body !== 'string' || body.trim() === '') {
      return res.status(400).json({
        error: 'Body must be a non-empty string'
      });
    }
    
    const result = await writeToMarkdown(normalizedType, body.trim());
    
    res.status(201).json({
      success: true,
      message: 'Entry saved successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Well endpoint error:', error);
    
    if (error.message.includes('Invalid type')) {
      return res.status(400).json({
        error: error.message
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save entry'
    });
  }
});

router.get('/', apiKeyAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const validTypes = ['note', 'task', 'bookmark'];
    const normalizedType = type.toLowerCase();
    
    if (!type) {
      return res.status(400).json({ 
        error: 'Missing required query parameter: type' 
      });
    }
    
    if (!validTypes.includes(normalizedType)) {
      return res.status(400).json({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      });
    }
    
    const filename = `${normalizedType}s.md`;
    const filePath = path.join(DATA_DIR, filename);
    
    const content = await fs.readFile(filePath, 'utf8')
      .catch(() => ''); // Return empty string if file doesn't exist
    
    res.type('text/markdown').send(content);
    
  } catch (error) {
    console.error('GET /well error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

module.exports = router;