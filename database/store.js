'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const settings = require('../config/settings');

const EMPTY = Object.freeze({ users: {}, groups: {}, games: {} });
let cache = null;
let loadPromise = null;
let writeQueue = Promise.resolve();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

async function load() {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const text = await fs.readFile(settings.DATA_FILE, 'utf8');
      const parsed = JSON.parse(text);
      cache = {
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
        groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {},
        games: parsed.games && typeof parsed.games === 'object' ? parsed.games : {}
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`تعذر قراءة قاعدة البيانات المحلية: ${error.message}`);
      cache = clone(EMPTY);
    }
    return cache;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

async function get(selector) {
  await writeQueue;
  const state = await load();
  return clone(typeof selector === 'function' ? selector(state) : state);
}

function update(mutator) {
  const operation = writeQueue.then(async () => {
    const current = await load();
    const draft = clone(current);
    const result = await mutator(draft);
    await fs.mkdir(path.dirname(settings.DATA_FILE), { recursive: true });
    const tempPath = `${settings.DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(draft, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tempPath, settings.DATA_FILE);
    cache = draft;
    return clone(result);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

async function getUser(userId) {
  const id = String(userId);
  return get((state) => state.users[id] || { coins: 0, xp: 0, level: 1, dailyAt: 0, inventory: [], warnings: 0 });
}

async function getGroup(groupId) {
  const id = String(groupId);
  return get((state) => state.groups[id] || {});
}

module.exports = { get, update, getUser, getGroup };
