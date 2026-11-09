'use strict';

const { spawn } = require('node:child_process');
const pino = require('pino');
const { downloadMediaMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');

const MAX_INPUT = 8 * 1024 * 1024;
const MAX_OUTPUT = 5 * 1024 * 1024;

function transcode(input, args, maxOutput = MAX_OUTPUT, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', 'pipe:0', ...args, 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    const errors = [];
    let outputSize = 0;
    let errorSize = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('انتهت مهلة التحويل.'));
    }, timeoutMs);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    }

    child.on('error', (error) => {
      if (error.code === 'ENOENT') return finish(new Error('FFmpeg غير مثبت. ثبّته في Termux بالأمر: pkg install ffmpeg'));
      finish(error);
    });
    child.stdout.on('data', (chunk) => {
      outputSize += chunk.length;
      if (outputSize > maxOutput) {
        child.kill('SIGKILL');
        finish(new Error('حجم الناتج تجاوز الحد المسموح.'));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (errorSize < 3000) {
        const part = chunk.subarray(0, 3000 - errorSize);
        errors.push(part);
        errorSize += part.length;
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0 || outputSize === 0) return finish(new Error(`فشل التحويل${errors.length ? `: ${Buffer.concat(errors).toString('utf8').trim().slice(0, 250)}` : ''}`));
      finish(null, Buffer.concat(output));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function findMedia(message) {
  const content = normalizeMessageContent(message?.message) || message?.message || {};
  for (const type of ['imageMessage', 'videoMessage']) {
    if (content[type]) return { message, type, media: content[type] };
  }
  const context = content.extendedTextMessage?.contextInfo
    || content.imageMessage?.contextInfo
    || content.videoMessage?.contextInfo
    || content.documentMessage?.contextInfo;
  const quoted = context?.quotedMessage;
  if (!quoted) return null;
  const quotedContent = normalizeMessageContent(quoted) || quoted;
  for (const type of ['imageMessage', 'videoMessage']) {
    if (quotedContent[type]) {
      return {
        message: { key: { remoteJid: message.key.remoteJid, participant: context.participant || message.key.participant, id: context.stanzaId, fromMe: false }, message: quoted },
        type,
        media: quotedContent[type]
      };
    }
  }
  return null;
}

async function getInput(ctx) {
  const found = findMedia(ctx.message);
  if (!found) {
    await ctx.reply('أرفق صورة أو فيديو مع الأمر، أو رد على رسالة صورة أو فيديو بالأمر.');
    return null;
  }
  const declared = Number(found.media.fileLength || 0);
  if (declared > MAX_INPUT) {
    await ctx.reply('الحد الأقصى للوسيط 8 ميغابايت.');
    return null;
  }
  if (!declared) {
    await ctx.reply('تعذر التحقق من حجم الوسيط؛ أرسل صورة أو فيديو عاديًا غير معاد توجيهه.');
    return null;
  }
  try {
    const buffer = await downloadMediaMessage(found.message, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: (msg) => ctx.sock.updateMediaMessage(msg) });
    if (buffer.length > MAX_INPUT) {
      await ctx.reply('الحد الأقصى للوسيط 8 ميغابايت.');
      return null;
    }
    return { ...found, buffer };
  } catch (error) {
    console.warn('تعذر تنزيل وسيط الرسالة:', error.message);
    await ctx.reply('تعذر قراءة الوسيط من واتساب؛ حاول إرسال الملف مباشرة بدلًا من إعادة توجيهه.');
    return null;
  }
}

async function sendSticker(ctx) {
  const input = await getInput(ctx);
  if (!input) return;
  const video = input.type === 'videoMessage';
  const args = video
    ? ['-t', '4', '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-an', '-c:v', 'libwebp', '-quality', '60', '-loop', '0', '-f', 'webp']
    : ['-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-an', '-c:v', 'libwebp', '-quality', '70', '-f', 'webp'];
  const output = await transcode(input.buffer, args, 1000 * 1000, 20000);
  await ctx.sock.sendMessage(ctx.chatId, { sticker: output }, { quoted: ctx.message });
}

async function sendAudio(ctx) {
  const input = await getInput(ctx);
  if (!input) return;
  if (input.type !== 'videoMessage') return ctx.reply('أرسل فيديو لاستخراج الصوت منه.');
  const output = await transcode(input.buffer, ['-t', '60', '-vn', '-c:a', 'libopus', '-b:a', '96k', '-f', 'ogg'], MAX_OUTPUT, 25000);
  await ctx.sock.sendMessage(ctx.chatId, { audio: output, mimetype: 'audio/ogg; codecs=opus', ptt: false }, { quoted: ctx.message });
}

async function sendGif(ctx) {
  const input = await getInput(ctx);
  if (!input) return;
  if (input.type !== 'videoMessage') return ctx.reply('أرسل فيديو لتحويله إلى GIF.');
  const output = await transcode(input.buffer, ['-t', '8', '-vf', 'fps=10,scale=480:-1:flags=lanczos', '-loop', '0', '-f', 'gif'], MAX_OUTPUT, 25000);
  await ctx.sock.sendMessage(ctx.chatId, { document: output, mimetype: 'image/gif', fileName: 'تحويل.gif' }, { quoted: ctx.message });
}

module.exports = [
  { name: 'ملصق', description: 'إنشاء ملصق من صورة أو فيديو قصير', async execute(ctx) { try { await sendSticker(ctx); } catch (error) { await ctx.reply(`تعذر إنشاء الملصق: ${error.message}`); } } },
  { name: 'صوت', description: 'استخراج الصوت من فيديو', async execute(ctx) { try { await sendAudio(ctx); } catch (error) { await ctx.reply(`تعذر استخراج الصوت: ${error.message}`); } } },
  { name: 'متحركة', aliases: ['صورة_متحركة'], description: 'تحويل مقطع فيديو قصير إلى GIF', async execute(ctx) { try { await sendGif(ctx); } catch (error) { await ctx.reply(`تعذر إنشاء GIF: ${error.message}`); } } }
];

module.exports.transcode = transcode;
