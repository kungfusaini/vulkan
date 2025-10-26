const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.status(200).type('text/plain').send('online');
});

router.use((req, res) => {
    res.status(404).send('Not Found');
});

console.log('[status] router loaded');
module.exports = router;
