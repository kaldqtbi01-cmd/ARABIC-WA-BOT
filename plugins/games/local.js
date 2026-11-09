'use strict';

const { randomInt } = require('node:crypto');

const riddles = [
  { q: 'ما الشيء الذي كلما أخذت منه كبر؟', a: 'الحفرة' },
  { q: 'له أسنان ولا يعض، ما هو؟', a: 'المشط' },
  { q: 'يمشي بلا قدمين ويبكي بلا عينين، ما هو؟', a: 'السحاب' },
  { q: 'ما الشيء الذي يكتب ولا يقرأ؟', a: 'القلم' }
];

module.exports = [
  { name: 'ألعاب', description: 'قائمة الألعاب المحلية', async execute(ctx) { await ctx.reply('الألعاب المتاحة: .عملة .نرد .خمن .لغز ثم .جواب إجابتك.'); } },
  { name: 'عملة', description: 'قلب عملة عشوائيًا', async execute(ctx) { await ctx.reply(`النتيجة: ${randomInt(0, 2) ? 'وجه' : 'كتابة'}.`); } },
  { name: 'نرد', description: 'رمي نرد من 1 إلى 6', async execute(ctx) { await ctx.reply(`نتيجة النرد: ${randomInt(1, 7)}.`); } },
  {
    name: 'خمن', description: 'لعبة تخمين رقم من 1 إلى 10',
    async execute(ctx) {
      const id = `${ctx.chatId}:${ctx.author}`;
      const guess = Number(ctx.args[0]);
      if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
        await ctx.store.update((state) => { state.games[id] = { number: randomInt(1, 11), expires: Date.now() + 10 * 60 * 1000 }; });
        return ctx.reply('اخترت رقمًا من 1 إلى 10. أرسل .خمن رقمك خلال 10 دقائق.');
      }
      let outcome = 'لا توجد لعبة نشطة؛ اكتب .خمن لبدء واحدة.';
      await ctx.store.update((state) => {
        const game = state.games[id];
        if (!game || game.expires < Date.now()) { delete state.games[id]; return; }
        if (guess === game.number) { outcome = 'صحيح! أحسنت، فزت.'; delete state.games[id]; }
        else outcome = guess < game.number ? 'أكبر قليلًا. حاول مرة أخرى.' : 'أصغر قليلًا. حاول مرة أخرى.';
      });
      await ctx.reply(outcome);
    }
  },
  {
    name: 'لغز', description: 'عرض لغز عشوائي',
    async execute(ctx) {
      const riddle = riddles[randomInt(0, riddles.length)];
      await ctx.store.update((state) => { state.games[`${ctx.chatId}:${ctx.author}:riddle`] = { answer: riddle.a, expires: Date.now() + 5 * 60 * 1000 }; });
      await ctx.reply(`لغز: ${riddle.q}\nأرسل .جواب ثم إجابتك.`);
    }
  },
  {
    name: 'جواب', description: 'إرسال إجابة اللغز',
    async execute(ctx) {
      const key = `${ctx.chatId}:${ctx.author}:riddle`;
      const answer = ctx.args.join(' ').trim().toLocaleLowerCase('ar');
      let result = 'لا يوجد لغز نشط؛ اكتب .لغز.';
      await ctx.store.update((state) => {
        const game = state.games[key];
        if (!game || game.expires < Date.now()) { delete state.games[key]; return; }
        if (answer && answer === game.answer.toLocaleLowerCase('ar')) { result = 'إجابة صحيحة!'; delete state.games[key]; }
        else result = 'ليست الإجابة الصحيحة، حاول مرة أخرى.';
      });
      await ctx.reply(result);
    }
  }
];
