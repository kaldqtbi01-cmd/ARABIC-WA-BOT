'use strict';

const { normalizeMessageContent } = require('@whiskeysockets/baileys');
const settings = require('../config/settings');
const store = require('../database/store');
const permissions = require('./permissions');
const { loadPlugins } = require('./pluginLoader');

let registry;
const recentlyHandled = new Map();
const repeatTracker = new Map();
const MAX_SEEN = 5000;

function getRegistry() {
  if (!registry) registry = loadPlugins();
  return registry;
}

function messageText(raw) {
  const message = normalizeMessageContent(raw.message) || raw.message || {};
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.buttonsResponseMessage?.selectedButtonId
    || message.listResponseMessage?.singleSelectReply?.selectedRowId
    || message.templateButtonReplyMessage?.selectedId
    || '';
}

function senderId(message) {
  return message.key?.participant || message.key?.remoteJid || '';
}

function rememberMessage(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [key, timestamp] of recentlyHandled) {
    if (now - timestamp > 60 * 60 * 1000) recentlyHandled.delete(key);
  }
  if (recentlyHandled.has(id)) return true;
  recentlyHandled.set(id, now);
  if (recentlyHandled.size > MAX_SEEN) recentlyHandled.delete(recentlyHandled.keys().next().value);
  return false;
}

async function reply(sock, chatId, message, text) {
  return sock.sendMessage(chatId, { text: String(text) }, { quoted: message });
}

async function processProtection(sock, message, text, chatId, author) {
  if (!chatId.endsWith('@g.us') || !text) return false;
  const group = await store.getGroup(chatId);
  if (group.antilink !== true) return false;
  if (await permissions.isGroupAdmin(sock, chatId, author) || permissions.isOwner(author)) return false;
  if (!/(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(text)) return false;
  if (!await permissions.isBotAdmin(sock, chatId)) {
    await reply(sock, chatId, message, 'تنبيه: لا أستطيع حذف الرابط لأنني لست مشرفًا في المجموعة.');
    return true;
  }
  try {
    await sock.sendMessage(chatId, { delete: message.key });
    await reply(sock, chatId, message, 'حُذف الرابط وفق إعداد حماية المجموعة.');
  } catch (error) {
    console.warn('تعذر حذف رابط مخالف:', error.message);
  }
  return true;
}

async function processAntiSpam(sock, message, text, chatId, author) {
  if (!chatId.endsWith('@g.us') || !text || text.length < 3) return false;
  const group = await store.getGroup(chatId);
  if (group.antispam !== true) return false;
  if (await permissions.isGroupAdmin(sock, chatId, author) || permissions.isOwner(author)) return false;
  const now = Date.now();
  const key = `${chatId}:${author}`;
  const recent = repeatTracker.get(key) || [];
  const normalized = text.trim().toLocaleLowerCase('ar');
  const fresh = recent.filter((entry) => now - entry.at < 12000);
  fresh.push({ at: now, text: normalized });
  repeatTracker.set(key, fresh.slice(-8));
  const repeated = fresh.filter((entry) => entry.text === normalized).length;
  if (fresh.length < 6 && repeated < 4) return false;
  if (await permissions.isBotAdmin(sock, chatId)) {
    try { await sock.sendMessage(chatId, { delete: message.key }); } catch (error) { console.warn('تعذر حذف رسالة مكررة:', error.message); }
  }
  await reply(sock, chatId, message, 'تنبيه: أوقف تكرار الرسائل أو الإرسال المتتابع.');
  repeatTracker.delete(key);
  return true;
}

async function handleMessage(sock, message) {
  if (!message?.message || !message.key || message.key.fromMe) return;
  if (message.key.remoteJid === 'status@broadcast') return;
  if (rememberMessage(message.key.id)) return;

  const chatId = message.key.remoteJid;
  const author = senderId(message);
  const text = messageText(message).trim();
  try {
    if (await processProtection(sock, message, text, chatId, author)) return;
    if (await processAntiSpam(sock, message, text, chatId, author)) return;

    if (!text.startsWith(settings.PREFIX)) return;
    const source = text.slice(settings.PREFIX.length).trim();
    if (!source) return;
    const [commandName, ...args] = source.split(/\s+/u);
    const loaded = getRegistry();
    const command = loaded.commands.get(commandName.toLowerCase()) || loaded.commands.get(commandName);
    if (!command) return;

    const isOwner = permissions.isOwner(author);
    const mode = await store.get((state) => state.system?.mode || 'عام');
    if (mode === 'خاص' && !isOwner && command.name !== 'مساعدة') {
      return reply(sock, chatId, message, 'البوت في الوضع الخاص؛ الأوامر متاحة للمالك فقط.');
    }

    const context = {
      sock,
      message,
      chatId,
      author,
      isGroup: chatId.endsWith('@g.us'),
      text,
      args,
      pluginCount: loaded.plugins.length,
      reply: (body) => reply(sock, chatId, message, body),
      getGroup: () => store.getGroup(chatId),
      setGroup: (key, value) => store.update((data) => {
        data.groups[chatId] ||= {};
        data.groups[chatId][key] = value;
      }),
      isOwner: () => isOwner,
      isAdmin: () => permissions.isGroupAdmin(sock, chatId, author),
      botIsAdmin: () => permissions.isBotAdmin(sock, chatId),
      store
    };
    await command.execute(context);
  } catch (error) {
    console.error(`خطأ أثناء معالجة رسالة ${message.key.id || 'غير معرّفة'}:`, error.stack || error.message);
    try { await reply(sock, chatId, message, 'حدث خطأ أثناء تنفيذ الطلب. أعد المحاولة أو أرسل للمالك نص الخطأ دون مشاركة بيانات الجلسة.'); } catch {}
  }
}

async function handleGroupParticipants(sock, update) {
  const group = await store.getGroup(update.id);
  if (group.welcome !== true || !['add', 'remove'].includes(update.action)) return;
  const additions = update.action === 'add';
  const template = additions ? (group.welcomeText || 'أهلًا بك، {العضو}!') : (group.goodbyeText || 'غادر المجموعة: {العضو}');
  for (const jid of update.participants || []) {
    const display = `@${jid.split('@')[0]}`;
    try {
      await sock.sendMessage(update.id, { text: template.replaceAll('{العضو}', display), mentions: [jid] });
    } catch (error) { console.warn('تعذر إرسال رسالة ترحيب/مغادرة:', error.message); }
  }
}

module.exports = { handleMessage, handleGroupParticipants, getRegistry, messageText };
