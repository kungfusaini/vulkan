const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/auth');
const { writeToMarkdown } = require('../utils/file-writer');

router.post('/', apiKeyAuth, async (req, res) => {
  try {
    const { type, body } = req.body;
    
    if (!type || !body) {
      return res.status(400).json({
        error: 'Missing required fields: type and body'
      });
    }
    
    if (typeof body !== 'string' || body.trim() === '') {
      return res.status(400).json({
        error: 'Body must be a non-empty string'
      });
    }
    
    const result = await writeToMarkdown(type, body.trim());
    
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

module.exports = router;