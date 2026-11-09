'use strict';

const path = require('node:path');

module.exports = Object.freeze({
  BOT_NAME: process.env.BOT_NAME || 'ARABIC-WA-BOT',
  PREFIX: process.env.PREFIX || '.',
  SESSION_DIR: process.env.SESSION_DIR || './sessions/auth',
  PAIRING_NUMBER: process.env.PAIRING_NUMBER || '',
  OWNER_NUMBERS: (process.env.OWNER_NUMBERS || '').split(',').map((value) => value.trim()).filter(Boolean),
  LOG_LEVEL: process.env.LOG_LEVEL || 'silent',
  RECONNECT_DELAY_MS: Number.parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10),
  DATA_FILE: path.resolve(process.env.DATA_FILE || './database/data.json'),
  AI_BASE_URL: process.env.AI_BASE_URL || '',
  AI_API_KEY: process.env.AI_API_KEY || process.env.GROQ_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || '',
  HTTP_TIMEOUT_MS: Number.parseInt(process.env.HTTP_TIMEOUT_MS || '15000', 10)
});
