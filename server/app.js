'use strict';
const express      = require('express');
const path         = require('path');
const morgan       = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const apiRouter    = require('./routes/api');

function createApp() {
  const app = express();

  // ─── Middleware ──────────────────────────────────────────────────────────
  app.use(morgan('dev'));
  app.use(express.json());

  // ─── API routes ──────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ─── Static client ───────────────────────────────────────────────────────
  const clientDir = path.join(__dirname, '..', 'client');
  app.use(express.static(clientDir));

  // SPA fallback: return index.html for any non-API GET
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  // ─── Error handler (must be last) ────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
