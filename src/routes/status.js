const express = require('express');
const https = require('https');
const http = require('http');
const router = express.Router();

// Service URLs with custom timeouts
const services = {
  sumeetsaini_com: { url: 'https://sumeetsaini.com', timeout: 5000 },
  arcanecodex_dev: { url: 'https://arcanecodex.dev', timeout: 5000 },
  mail: { url: 'https://mail.sumeetsaini.com', timeout: 30000 }, // 30 seconds for slow mail
  stats: { url: 'https://stats.sumeetsaini.com', timeout: 5000 }
};

// Simple health check using native Node.js modules
async function checkService(url, timeout) {
  return new Promise((resolve) => {
    const start = Date.now();
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const module = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: timeout
    };
    
    const req = module.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ status: 'healthy', response_time: `${Date.now() - start}ms` });
      });
    });
    
    req.on('error', (error) => {
      resolve({ status: 'unhealthy', error: error.code });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'unhealthy', error: 'TIMEOUT' });
    });
    
    req.end();
  });
}

// Single status endpoint
router.get('/', async (req, res) => {
  const results = {};
  
  // Add vulkan as always healthy since this endpoint is accessible
  results.vulkan = { status: 'healthy', response_time: '0ms' };
  
  // Check external services
  results.sumeetsaini_com = await checkService(services.sumeetsaini_com.url, services.sumeetsaini_com.timeout);
  results.arcanecodex_dev = await checkService(services.arcanecodex_dev.url, services.arcanecodex_dev.timeout);
  results.mail = await checkService(services.mail.url, services.mail.timeout);
  results.stats = await checkService(services.stats.url, services.stats.timeout);
  
  // Calculate overall status
  const allHealthy = Object.values(results).every(s => s.status === 'healthy');
  const overallStatus = allHealthy ? 'healthy' : 'degraded';
  
  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: results
  });
});

module.exports = router;