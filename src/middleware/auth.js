const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.WELL_API_KEY;
  
  if (!expectedApiKey) {
    return res.status(500).json({ 
      error: 'API key not configured on server' 
    });
  }
  
  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ 
      error: 'Invalid or missing API key' 
    });
  }
  
  next();
};

module.exports = apiKeyAuth;