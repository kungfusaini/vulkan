const express = require('express');
const crypto = require('crypto');
const projectsManager = require('../utils/projects-manager');

const router = express.Router();

// GET /projects - Get all projects with optional filtering
router.get('/', (req, res) => {
  try {
    const filters = {
      group: req.query.group,
      tech: req.query.tech,
      skills: req.query.skills,
      company: req.query.company,
      include_drafts: req.query.include_drafts
    };

    const projects = projectsManager.getProjects(filters);
    
    res.json({
      success: true,
      count: projects.length,
      filters: Object.keys(filters).filter(k => filters[k]),
      projects
    });
  } catch (error) {
    console.error('GET /projects error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve projects'
    });
  }
});

// GET /projects/:slug - Get single project by slug
router.get('/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const project = projectsManager.getProject(slug);

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        slug
      });
    }

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error('GET /projects/:slug error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve project'
    });
  }
});

// POST /projects/sync - Manually trigger a sync from the repo
router.post('/sync', async (req, res) => {
  try {
    const result = await projectsManager.syncProjects();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        filesUpdated: result.filesUpdated
      });
    } else {
      res.status(500).json({
        error: 'Sync failed',
        message: result.error || result.message
      });
    }
  } catch (error) {
    console.error('POST /projects/sync error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to sync projects'
    });
  }
});

// POST /projects/webhook - GitHub webhook endpoint
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    // Verify webhook secret if configured
    if (projectsManager.webhookSecret && signature) {
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', projectsManager.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[projects/webhook] Invalid signature');
        return res.status(401).json({
          error: 'Invalid signature'
        });
      }
    }

    // Only respond to push events
    if (event !== 'push') {
      return res.json({
        message: `Event ${event} ignored`
      });
    }

    console.log('[projects/webhook] Received push event, syncing...');
    const result = await projectsManager.syncProjects();

    if (result.success) {
      res.json({
        success: true,
        message: 'Projects synced successfully',
        filesUpdated: result.filesUpdated
      });
    } else {
      res.status(500).json({
        error: 'Sync failed',
        message: result.error
      });
    }
  } catch (error) {
    console.error('POST /projects/webhook error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Webhook processing failed'
    });
  }
});

// GET /projects/info - Get cache info (for debugging)
router.get('/info', (req, res) => {
  try {
    const info = projectsManager.getCacheInfo();
    res.json({
      success: true,
      ...info
    });
  } catch (error) {
    console.error('GET /projects/info error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get info'
    });
  }
});

// GET /projects/media - Get list of all media files (images, videos)
router.get('/media', async (req, res) => {
  try {
    const mediaFiles = await projectsManager.getMediaFiles();
    res.json({
      success: true,
      count: mediaFiles.length,
      files: mediaFiles
    });
  } catch (error) {
    console.error('GET /projects/media error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get media files'
    });
  }
});

module.exports = router;
