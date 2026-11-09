'use strict';

const path = require('node:path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const baileys = require('@whiskeysockets/baileys');
const settings = require('../config/settings');
const { handleMessage, handleGroupParticipants, getRegistry } = require('./handler');

const makeWASocket = baileys.default || baileys;
const { useMultiFileAuthState, DisconnectReason, Browsers } = baileys;

let activeSocket = null;
let reconnectTimer = null;
let stopping = false;
let connectionAttempt = 0;

function getLogger() {
  return pino({ level: settings.LOG_LEVEL });
}

async function startConnection() {
  if (stopping) return;
  if (settings.PAIRING_NUMBER && !/^[1-9]\d{7,14}$/.test(settings.PAIRING_NUMBER)) {
    throw new Error('PAIRING_NUMBER غير صالح؛ أدخل الرقم بصيغة دولية وأرقام فقط، دون + أو مسافات.');
  }

  getRegistry();
  connectionAttempt += 1;
  const attemptNumber = connectionAttempt;
  const authDirectory = path.resolve(settings.SESSION_DIR);
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);

  const socket = makeWASocket({
    auth: state,
    logger: getLogger(),
    browser: Browsers.ubuntu(settings.BOT_NAME),
    markOnlineOnConnect: false,
    syncFullHistory: false
  });
  activeSocket = socket;
  let pairingCodeRequested = false;

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages || []) {
      try { await handleMessage(socket, message); }
      catch (error) { console.error('تعذر تمرير رسالة إلى المعالج:', error.message); }
    }
  });
  socket.ev.on('group-participants.update', (update) => {
    void handleGroupParticipants(socket, update).catch((error) => console.error('تعذر معالجة تغيير أعضاء المجموعة:', error.message));
  });
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (settings.PAIRING_NUMBER) {
        if (!pairingCodeRequested) {
          pairingCodeRequested = true;
          if (typeof socket.requestPairingCode !== 'function') {
            console.error('إصدار Baileys الحالي لا يتيح طلب رمز الربط.');
          } else {
            void socket.requestPairingCode(settings.PAIRING_NUMBER)
              .then((code) => {
                console.log('\nرمز ربط واتساب:');
                console.log(code);
                console.log('أدخله في واتساب على الهاتف: الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف بدلًا من ذلك.');
                console.log('لا تشارك الرمز مع أي شخص.\n');
              })
              .catch((error) => {
                console.error('تعذر الحصول على رمز الربط:', error.message);
                console.error('تحقق من الرقم الدولي والاتصال بالإنترنت، ثم أعد المحاولة.');
              });
          }
        }
      } else {
        console.log('\nامسح رمز QR التالي من واتساب على هاتفك لإقران الجهاز:');
        qrcode.generate(qr, { small: true });
        console.log('من واتساب: الأجهزة المرتبطة ← ربط جهاز. لا تشارك الرمز مع أي شخص.\n');
      }
    }

    if (connection === 'connecting') console.log('جارٍ الاتصال بواتساب...');
    if (connection === 'open') {
      console.log(`تم الاتصال بواتساب بنجاح. اسم الجهاز: ${settings.BOT_NAME}`);
      console.log(`تُحفظ بيانات الجلسة محليًا في: ${authDirectory}`);
      console.log('أرسل .مساعدة في محادثة البوت لعرض الأوامر المتاحة.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.warn(`انقطع اتصال واتساب (رمز الحالة: ${statusCode ?? 'غير معروف'}).`);
      if (loggedOut) {
        console.error('الجلسة مسجّلة الخروج. لم تُحذف ملفات الجلسة.');
        return;
      }
      if (!stopping && attemptNumber === connectionAttempt && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void startConnection().catch((error) => console.error('فشلت محاولة إعادة الاتصال:', error.message));
        }, settings.RECONNECT_DELAY_MS);
        reconnectTimer.unref?.();
        console.log(`ستتم محاولة إعادة الاتصال بعد ${Math.round(settings.RECONNECT_DELAY_MS / 1000)} ثوانٍ.`);
      }
    }
  });

  return socket;
}

async function stopConnection() {
  stopping = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeSocket?.ws && typeof activeSocket.ws.close === 'function') activeSocket.ws.close();
  activeSocket = null;
}

module.exports = { startConnection, stopConnection };
