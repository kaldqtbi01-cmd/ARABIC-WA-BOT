'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'arabic-wa-bot-test-'));
process.env.DATA_FILE = path.join(temporary, 'data.json');
const store = require('../database/store');
const { loadPlugins } = require('../core/pluginLoader');
const { handleMessage } = require('../core/handler');
const permissions = require('../core/permissions');
const registry = loadPlugins();

test('إعدادات Node والاعتماديات الأساسية صالحة', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 20);
  assert.equal(typeof require('@whiskeysockets/baileys').useMultiFileAuthState, 'function');
  assert.equal(typeof require('@whiskeysockets/baileys').normalizeMessageContent, 'function');
  assert.equal(typeof require('qrcode-terminal').generate, 'function');
  assert.equal(typeof require('pino'), 'function');
});

test('الإضافات تُحمّل وأسماء الأوامر الأساسية عربية ولا تتكرر', () => {
  assert.ok(registry.plugins.length >= 6);
  for (const name of ['مساعدة', 'القائمة', 'فحص', 'حاسبة', 'طرد', 'ترقية', 'ذكاء', 'رصيدي', 'خمن', 'طقس', 'حزمة', 'ملصق', 'متحركة', 'وضع_خاص']) {
    assert.ok(registry.commands.has(name), `الأمر غير محمّل: ${name}`);
  }
  assert.equal(registry.commands.has('npm'), false);
  for (const name of registry.commands.keys()) assert.match(name, /^[\u0600-\u06FF0-9_]+$/u, `اسم الأمر ليس عربيًا: ${name}`);
});

test('الحاسبة الآمنة تحسب ولا تسمح بالقسمة على صفر', async () => {
  let answer = '';
  const command = registry.commands.get('حاسبة');
  await command.execute({ args: ['(12+3)*2'], reply: async (text) => { answer = text; } });
  assert.equal(answer, 'الناتج: 30');
  await command.execute({ args: ['10/0'], reply: async (text) => { answer = text; } });
  assert.match(answer, /صفر/);
});

test('معالج الرسائل ينفذ الأمر مرة واحدة فقط لكل معرف رسالة', async () => {
  const sent = [];
  const sock = { sendMessage: async (_jid, content) => { sent.push(content); } };
  const message = {
    key: { id: 'smoke-message-1', remoteJid: '100@s.whatsapp.net', fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: '.فحص' }
  };
  await handleMessage(sock, message);
  await handleMessage(sock, message);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /البوت يعمل/);
});

test('التخزين يحفظ المستخدم والإعدادات بين عمليات القراءة', async () => {
  await store.update((state) => {
    state.users['100@s.whatsapp.net'] = { coins: 50, warnings: 1 };
    state.groups['123@g.us'] = { antilink: true };
  });
  assert.equal((await store.getUser('100@s.whatsapp.net')).coins, 50);
  assert.equal((await store.getGroup('123@g.us')).antilink, true);
  assert.ok(fs.existsSync(process.env.DATA_FILE));
});

test('فحص صلاحية مشرف يعتمد بيانات المجموعة ولا يفشل مفتوحًا', async () => {
  const adminSock = { groupMetadata: async () => ({ participants: [{ id: '123@s.whatsapp.net', admin: 'admin' }] }) };
  const ordinarySock = { groupMetadata: async () => ({ participants: [{ id: '123@s.whatsapp.net', admin: null }] }) };
  assert.equal(await permissions.isGroupAdmin(adminSock, 'g@g.us', '123@s.whatsapp.net'), true);
  assert.equal(await permissions.isGroupAdmin(ordinarySock, 'g@g.us', '123@s.whatsapp.net'), false);
  assert.equal(await permissions.isGroupAdmin({ groupMetadata: async () => { throw new Error('offline'); } }, 'g@g.us', '123@s.whatsapp.net'), false);
});

test('FFmpeg يحول عينة صورة إلى ملصق WebP', async (t) => {
  const availability = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (availability.error || availability.status !== 0) return t.skip('FFmpeg غير مثبت في بيئة الاختبار.');
  const { transcode } = require('../plugins/media/convert');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L2kAAAAASUVORK5CYII=', 'base64');
  const webp = await transcode(png, ['-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-an', '-c:v', 'libwebp', '-quality', '70', '-f', 'webp'], 1000000, 20000);
  assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
});

test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
