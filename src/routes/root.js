const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
res.send(`
	<!doctype html>
	<html>
	<head>
		<meta name="robots" content="noindex, nofollow">
		<title>You've gone too far</title>
	</head>
	<body>
		<h1>You've gone too far</h1>
		<p>You shouldn't be here, and now you are on the list</p>
	</body>
	</html>
`);
});

module.exports = router;
