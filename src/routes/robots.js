const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nDisallow: /');
});

module.exports = router;