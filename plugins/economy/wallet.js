'use strict';

const catalog = Object.freeze({
  'وسام': { price: 250, description: 'وسام افتراضي' },
  'لون': { price: 500, description: 'لون اسم افتراضي' },
  'لقب': { price: 1000, description: 'لقب افتراضي' }
});

function targetJid(ctx) {
  const message = ctx.message.message || {};
  const context = message.extendedTextMessage?.contextInfo || message.imageMessage?.contextInfo || message.videoMessage?.contextInfo;
  return context?.mentionedJid?.[0] || context?.participant || '';
}

function userDefault() { return { coins: 0, xp: 0, level: 1, dailyAt: 0, inventory: [], warnings: 0 }; }

module.exports = [
  { name: 'رصيدي', description: 'عرض رصيدك ونقاط الخبرة', async execute(ctx) { const u = await ctx.store.getUser(ctx.author); await ctx.reply(`رصيدك: ${u.coins || 0} نقطة\nالخبرة: ${u.xp || 0}\nالمستوى: ${u.level || 1}\nمشترياتك: ${(u.inventory || []).join('، ') || 'لا يوجد'}`); } },
  {
    name: 'يومي', description: 'استلام مكافأة يومية',
    async execute(ctx) {
      let response = '';
      await ctx.store.update((state) => {
        const user = state.users[ctx.author] ||= userDefault();
        const now = Date.now();
        const next = (user.dailyAt || 0) + 24 * 60 * 60 * 1000;
        if (now < next) { response = `استلمت مكافأتك مسبقًا. حاول بعد ${Math.ceil((next - now) / 3600000)} ساعة.`; return; }
        user.coins = (user.coins || 0) + 100;
        user.xp = (user.xp || 0) + 10;
        user.dailyAt = now;
        response = 'استلمت 100 نقطة و10 نقاط خبرة. عد غدًا لمكافأة جديدة.';
      });
      await ctx.reply(response);
    }
  },
  {
    name: 'تحويل', description: 'تحويل نقاط إلى عضو',
    async execute(ctx) {
      if (!ctx.isGroup) return ctx.reply('التحويل متاح داخل المجموعة فقط، مع الإشارة للعضو والمبلغ.');
      const target = targetJid(ctx);
      const amount = Number(ctx.args.find((x) => /^\d+$/.test(x)));
      if (!target || target === ctx.author || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000) return ctx.reply('استخدم: .تحويل @عضو مبلغ، ولا يمكنك التحويل إلى نفسك.');
      let response = '';
      await ctx.store.update((state) => {
        const from = state.users[ctx.author] ||= userDefault();
        const to = state.users[target] ||= userDefault();
        if ((from.coins || 0) < amount) { response = 'رصيدك لا يكفي.'; return; }
        from.coins -= amount;
        to.coins = (to.coins || 0) + amount;
        response = `تم تحويل ${amount} نقطة إلى @${target.split('@')[0]}.`;
      });
      await ctx.sock.sendMessage(ctx.chatId, { text: response, mentions: [target] }, { quoted: ctx.message });
    }
  },
  {
    name: 'المتجر', description: 'عرض المتجر الافتراضي',
    async execute(ctx) { await ctx.reply(`المتجر الافتراضي (العناصر لا تمنح صلاحيات خارج البوت):\n${Object.entries(catalog).map(([name, item]) => `• ${name}: ${item.price} نقطة — ${item.description}`).join('\n')}\nللشراء: .شراء اسم_العنصر`); }
  },
  {
    name: 'شراء', description: 'شراء عنصر افتراضي',
    async execute(ctx) {
      const itemName = ctx.args.join(' ').trim();
      const item = catalog[itemName];
      if (!item) return ctx.reply('العنصر غير موجود. اكتب .المتجر لعرض القائمة.');
      let response = '';
      await ctx.store.update((state) => {
        const user = state.users[ctx.author] ||= userDefault();
        user.inventory ||= [];
        if (user.inventory.includes(itemName)) { response = 'هذا العنصر موجود لديك مسبقًا.'; return; }
        if ((user.coins || 0) < item.price) { response = 'رصيدك لا يكفي لشراء هذا العنصر.'; return; }
        user.coins -= item.price;
        user.inventory.push(itemName);
        response = `تم شراء ${itemName}.`;
      });
      await ctx.reply(response);
    }
  },
  {
    name: 'الترتيب', description: 'ترتيب أصحاب النقاط المسجلين',
    async execute(ctx) {
      const users = await ctx.store.get((state) => Object.entries(state.users));
      const top = users.sort((a, b) => (b[1].coins || 0) - (a[1].coins || 0)).slice(0, 10);
      if (!top.length) return ctx.reply('لا توجد أرصدة مسجلة بعد.');
      await ctx.sock.sendMessage(ctx.chatId, { text: `ترتيب النقاط:\n${top.map(([jid, user], i) => `${i + 1}. @${jid.split('@')[0]} — ${user.coins || 0}`).join('\n')}`, mentions: top.map(([jid]) => jid) }, { quoted: ctx.message });
    }
  }
];
