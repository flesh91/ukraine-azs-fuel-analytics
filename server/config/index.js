'use strict';
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  cacheTtl: parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10),
};
