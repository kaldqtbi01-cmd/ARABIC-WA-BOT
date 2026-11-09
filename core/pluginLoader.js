'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', 'plugins');

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function loadPlugins() {
  const registry = new Map();
  const plugins = [];
  const files = collectJavaScriptFiles(PLUGIN_ROOT).sort();

  for (const file of files) {
    const loaded = require(file);
    const entries = Array.isArray(loaded) ? loaded : [loaded];
    for (const plugin of entries) {
      if (!plugin || typeof plugin.execute !== 'function' || typeof plugin.name !== 'string') {
        throw new TypeError(`تعريف إضافة غير صالح: ${path.relative(PLUGIN_ROOT, file)}`);
      }
      const names = [plugin.name, ...(plugin.aliases || [])];
      for (const name of names) {
        if (typeof name !== 'string' || !name.trim()) throw new TypeError(`اسم أمر غير صالح في: ${file}`);
        if (registry.has(name)) throw new Error(`اسم أمر مكرر: ${name}`);
        registry.set(name, plugin);
      }
      plugins.push(plugin);
    }
  }

  console.log(`تم تحميل ${plugins.length} إضافة وأمر من ${files.length} ملفًا.`);
  return { commands: registry, plugins };
}

module.exports = { loadPlugins };
