'use strict';

async function requireOwner(ctx) {
  if (ctx.isOwner()) return true;
  await ctx.reply('هذا الأمر مخصص لمالك البوت المسجل في OWNER_NUMBERS داخل .env.');
  return false;
}

module.exports = [
  {
    name: 'وضع_خاص', description: 'قصر تنفيذ الأوامر على مالك البوت',
    async execute(ctx) {
      if (!await requireOwner(ctx)) return;
      await ctx.store.update((state) => { state.system ||= {}; state.system.mode = 'خاص'; });
      await ctx.reply('فُعّل الوضع الخاص. لن ينفذ البوت الأوامر إلا من المالك.');
    }
  },
  {
    name: 'وضع_عام', description: 'السماح بتنفيذ الأوامر حسب صلاحيات كل إضافة',
    async execute(ctx) {
      if (!await requireOwner(ctx)) return;
      await ctx.store.update((state) => { state.system ||= {}; state.system.mode = 'عام'; });
      await ctx.reply('فُعّل الوضع العام. تبقى أوامر الإدارة مقيدة بصلاحياتها.');
    }
  },
  {
    name: 'إحصائيات', description: 'عرض ملخص التشغيل للمالك',
    async execute(ctx) {
      if (!await requireOwner(ctx)) return;
      const snapshot = await ctx.store.get((state) => ({ users: Object.keys(state.users).length, groups: Object.keys(state.groups).length, mode: state.system?.mode || 'عام' }));
      const seconds = Math.floor(process.uptime());
      await ctx.reply(`إحصائيات البوت:\nالإضافات المحملة: ${ctx.pluginCount}\nالمستخدمون المسجلون: ${snapshot.users}\nالمجموعات ذات الإعدادات: ${snapshot.groups}\nالوضع: ${snapshot.mode}\nمدة التشغيل: ${seconds} ثانية`);
    }
  }
];
