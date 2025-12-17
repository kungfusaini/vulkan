const express = require('express');
const https = require('https');
const http = require('http');
const net = require('net');
const router = express.Router();

// Service URLs with custom timeouts
const services = {
  sumeetsaini_com: { url: 'https://sumeetsaini.com', timeout: 5000 },
  arcanecodex_dev: { url: 'https://arcanecodex.dev', timeout: 5000 },
  mail: { url: 'https://mail.sumeetsaini.com', timeout: 30000 }, // 30 seconds for slow mail
  stats: { url: 'https://stats.sumeetsaini.com', timeout: 5000 },
  laptop_tunnel: { type: 'tcp', host: '172.22.1.1', port: 2222, timeout: 3000 }, // Check reverse tunnel to laptop
  bucketbot: { type: 'container', name: 'bucketbot', timeout: 3000 }
};

// TCP port connection check for SSH tunnel detection
async function checkTCPPort(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    
    socket.setTimeout(timeout);
    
    socket.connect(port, host, () => {
      // Connection successful - port is open
      resolve({ status: 'healthy', response_time: `${Date.now() - start}ms` });
      socket.destroy();
    });
    
    socket.on('error', (error) => {
      // Connection failed - port closed or unreachable
      resolve({ status: 'unhealthy', error: error.code });
    });
    
    socket.on('timeout', () => {
      // Connection timed out
      resolve({ status: 'unhealthy', error: 'TIMEOUT' });
      socket.destroy();
    });
  });
}

// Docker container health check
async function checkContainerStatus(containerName) {
  try {
    const Docker = require('dockerode');
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    const container = docker.getContainer(containerName);
    const data = await container.inspect();
    
    return { 
      status: data.State.Running ? 'healthy' : 'unhealthy', 
      response_time: '0ms' 
    };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: 'Container not found or not running' 
    };
  }
}

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
  // Check TCP-based services (SSH tunnel)
  if (services.laptop_tunnel && services.laptop_tunnel.type === 'tcp') {
    results.laptop_tunnel = await checkTCPPort(
      services.laptop_tunnel.host, 
      services.laptop_tunnel.port, 
      services.laptop_tunnel.timeout
    );
  }
  
  // Check container services
  if (services.bucketbot && services.bucketbot.type === 'container') {
    results.bucketbot = await checkContainerStatus(services.bucketbot.name);
  }
  
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