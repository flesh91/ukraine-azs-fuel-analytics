'use strict';
const createApp = require('./app');
const config    = require('./config');

const app = createApp();

app.listen(config.port, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  🚀  AZS Analytics  —  server started           ║
║  📡  http://localhost:${config.port}                     ║
║  💾  Local JSON cache: ./data/                   ║
╚══════════════════════════════════════════════════╝
  `);
});
