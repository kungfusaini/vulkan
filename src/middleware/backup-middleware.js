const backupManager = require('../utils/backup-manager');

/**
 * Express middleware to trigger backup after API calls
 * @param {string} endpointName - Name of endpoint for logging
 * @returns {Function} Express middleware function
 */
function backupMiddleware(endpointName) {
  return async (req, res, next) => {
    // Only trigger backup in production
    if (process.env.NODE_ENV === 'production') {
      // Run backup in background using setImmediate to avoid blocking
      setImmediate(() => {
        backupManager.backupData(endpointName).catch(error => {
          console.error('Backup middleware error:', error);
        });
      });
    }
    
    next();
  };
}

module.exports = backupMiddleware;