'use strict';

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = err.status || 500;
  const message = err.message || 'Internal Server Error';
  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.url} — ${message}`);
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
