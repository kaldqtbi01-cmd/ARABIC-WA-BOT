#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { startConnection, stopConnection } = require('./core/connection');

if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('إصدار Node.js غير مدعوم. يلزم Node.js 20 أو أحدث.');
  process.exit(1);
}

let stopping = false;

async function main() {
  try {
    await startConnection();
  } catch (error) {
    console.error('تعذر بدء الاتصال بواتساب:', error.message);
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\nاستُقبل ${signal}؛ يجري إيقاف الاتصال مع الإبقاء على ملفات الجلسة.`);
  await stopConnection();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

void main();
