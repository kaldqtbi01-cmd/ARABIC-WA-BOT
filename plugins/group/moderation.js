'use strict';

const cooldowns = new Map();

function getTarget(ctx) {
  const message = ctx.message.message || {};
  const info = message.extendedTextMessage?.contextInfo || message.imageMessage?.contextInfo || message.videoMessage?.contextInfo;
  return info?.mentionedJid?.[0] || info?.participant || '';
}

async function requireAdmin(ctx) {
  if (!ctx.isGroup) { await ctx.reply('هذا الأمر يعمل داخل المجموعة فقط.'); return false; }
  if (!await ctx.isAdmin()) { await ctx.reply('هذا الأمر للمشرفين فقط.'); return false; }
  return true;
}

async function requireBotAdmin(ctx) {
  if (!await ctx.botIsAdmin()) { await ctx.reply('يجب ترقية البوت إلى مشرف لتنفيذ هذا الإجراء.'); return false; }
  return true;
}

async function participantAction(ctx, action) {
  if (!await requireAdmin(ctx) || !await requireBotAdmin(ctx)) return;
  const target = getTarget(ctx);
  if (!target || target === ctx.sock.user?.id) return ctx.reply('أشر إلى عضو واحد أو رد على رسالته. لا يدعم الأمر التنفيذ الجماعي.');
  try {
    await ctx.sock.groupParticipantsUpdate(ctx.chatId, [target], action);
    await ctx.reply(action === 'remove' ? 'تم طلب إزالة العضو.' : action === 'promote' ? 'تم طلب ترقية العضو إلى مشرف.' : 'تم طلب تنزيل العضو من الإشراف.');
  } catch (error) { await ctx.reply(`تعذر تنفيذ الإجراء: ${error.message}`); }
}

function createToggle(name, key, title) {
  return {
    name, description: `تشغيل أو إيقاف ${title}`,
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const value = ctx.args[0];
      if (!['تشغيل', 'إيقاف'].includes(value)) return ctx.reply(`استخدم: .${name} تشغيل أو .${name} إيقاف`);
      await ctx.setGroup(key, value === 'تشغيل');
      await ctx.reply(`${title}: ${value}.`);
    }
  };
}

module.exports = [
  { name: 'طرد', description: 'إزالة عضو واحد بالإشارة أو الرد', async execute(ctx) { await participantAction(ctx, 'remove'); } },
  { name: 'ترقية', description: 'ترقية عضو واحد إلى مشرف', async execute(ctx) { await participantAction(ctx, 'promote'); } },
  { name: 'تنزيل', description: 'تنزيل عضو واحد من الإشراف', async execute(ctx) { await participantAction(ctx, 'demote'); } },
  createToggle('روابط', 'antilink', 'منع الروابط'),
  createToggle('سبام', 'antispam', 'مكافحة التكرار والإغراق'),
  createToggle('ترحيب', 'welcome', 'رسائل الترحيب والمغادرة'),
  {
    name: 'رسالة_الترحيب', description: 'تعيين نص الترحيب',
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const text = ctx.args.join(' ').trim();
      if (!text || text.length > 300) return ctx.reply('استخدم: .رسالة_الترحيب نص الرسالة. ضع {العضو} مكان اسم العضو.');
      await ctx.setGroup('welcomeText', text);
      await ctx.reply('حُفظ نص الترحيب.');
    }
  },
  {
    name: 'رسالة_الوداع', description: 'تعيين نص رسالة المغادرة',
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const text = ctx.args.join(' ').trim();
      if (!text || text.length > 300) return ctx.reply('استخدم: .رسالة_الوداع نص الرسالة. ضع {العضو} مكان اسم العضو.');
      await ctx.setGroup('goodbyeText', text);
      await ctx.reply('حُفظ نص المغادرة.');
    }
  },
  {
    name: 'تحذير', description: 'تسجيل تحذير على عضو واحد دون طرد آلي',
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const target = getTarget(ctx);
      if (!target) return ctx.reply('أشر إلى عضو واحد أو رد على رسالته.');
      let count;
      await ctx.store.update((state) => {
        const user = state.users[target] ||= { coins: 0, xp: 0, level: 1, dailyAt: 0, inventory: [], warnings: 0 };
        user.warnings = (user.warnings || 0) + 1;
        count = user.warnings;
      });
      await ctx.sock.sendMessage(ctx.chatId, { text: `سُجّل تحذير على @${target.split('@')[0]}. مجموع التحذيرات: ${count}. لا يوجد طرد آلي.`, mentions: [target] }, { quoted: ctx.message });
    }
  },
  {
    name: 'التحذيرات', description: 'عرض تحذيرات عضو واحد',
    async execute(ctx) {
      if (ctx.isGroup && !await ctx.isAdmin()) return ctx.reply('عرض تحذيرات الأعضاء للمشرفين فقط.');
      const target = getTarget(ctx) || ctx.author;
      const user = await ctx.store.getUser(target);
      await ctx.reply(`عدد التحذيرات المسجلة: ${user.warnings || 0}.`);
    }
  },
  {
    name: 'مسح_التحذيرات', description: 'مسح تحذيرات عضو واحد',
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const target = getTarget(ctx);
      if (!target) return ctx.reply('أشر إلى العضو أو رد على رسالته.');
      await ctx.store.update((state) => { const user = state.users[target]; if (user) user.warnings = 0; });
      await ctx.reply('تم مسح التحذيرات المسجلة للعضو.');
    }
  },
  {
    name: 'منشنالمشرفين', description: 'إشعار مشرفي المجموعة',
    async execute(ctx) {
      if (!ctx.isGroup) return ctx.reply('هذا الأمر يعمل داخل المجموعة فقط.');
      const meta = await ctx.sock.groupMetadata(ctx.chatId);
      const admins = (meta.participants || []).filter((p) => p.admin === 'admin' || p.admin === 'superadmin').map((p) => p.id);
      if (!admins.length) return ctx.reply('لم أجد مشرفين في المجموعة.');
      const note = ctx.args.join(' ').slice(0, 300);
      await ctx.sock.sendMessage(ctx.chatId, { text: `تنبيه للمشرفين${note ? `: ${note}` : ''}\n${admins.map((jid) => `@${jid.split('@')[0]}`).join(' ')}`, mentions: admins });
    }
  },
  {
    name: 'منشنالكل', description: 'منشن جميع الأعضاء بمعدل محدود',
    async execute(ctx) {
      if (!await requireAdmin(ctx)) return;
      const last = cooldowns.get(ctx.chatId) || 0;
      if (Date.now() - last < 10 * 60 * 1000) return ctx.reply('استخدم منشن الجميع مرة واحدة فقط كل 10 دقائق.');
      const meta = await ctx.sock.groupMetadata(ctx.chatId);
      const members = (meta.participants || []).map((p) => p.id);
      if (!members.length || members.length > 100) return ctx.reply('لتجنب الإزعاج وحجم الرسالة، يقتصر المنشن الجماعي على مجموعات حتى 100 عضو.');
      cooldowns.set(ctx.chatId, Date.now());
      const note = ctx.args.join(' ').slice(0, 160);
      await ctx.sock.sendMessage(ctx.chatId, { text: `${note ? `${note}\n` : ''}${members.map((jid) => `@${jid.split('@')[0]}`).join(' ')}`, mentions: members });
    }
  },
  {
    name: 'قفل', description: 'قصر إرسال الرسائل على المشرفين',
    async execute(ctx) {
      if (!await requireAdmin(ctx) || !await requireBotAdmin(ctx)) return;
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');
      await ctx.reply('تم قفل إرسال الرسائل على المشرفين.');
    }
  },
  {
    name: 'فتح', description: 'السماح لكل الأعضاء بإرسال الرسائل',
    async execute(ctx) {
      if (!await requireAdmin(ctx) || !await requireBotAdmin(ctx)) return;
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');
      await ctx.reply('تم فتح إرسال الرسائل لجميع الأعضاء.');
    }
  },
  {
    name: 'رابط_المجموعة', description: 'إظهار رابط الدعوة بعد تحقق الصلاحيات',
    async execute(ctx) {
      if (!await requireAdmin(ctx) || !await requireBotAdmin(ctx)) return;
      const code = await ctx.sock.groupInviteCode(ctx.chatId);
      await ctx.reply(`رابط الدعوة: https://chat.whatsapp.com/${code}`);
    }
  }
];
