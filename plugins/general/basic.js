'use strict';

const settings = require('../../config/settings');

function calculate(expression) {
  const input = expression.replace(/\s+/g, '');
  if (!input || input.length > 100 || !/^[0-9.+\-*/()%]+$/.test(input)) throw new Error('اكتب عملية حسابية بسيطة مثل 23*4 أو (12+3)/5.');
  let index = 0;
  function primary() {
    if (input[index] === '(') {
      index++;
      const value = sum();
      if (input[index++] !== ')') throw new Error('القوس غير مكتمل.');
      return value;
    }
    if (input[index] === '+' || input[index] === '-') {
      const sign = input[index++] === '-' ? -1 : 1;
      return sign * primary();
    }
    const match = input.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('العملية غير صالحة.');
    index += match[0].length;
    return Number(match[0]);
  }
  function product() {
    let value = primary();
    while (['*', '/', '%'].includes(input[index])) {
      const op = input[index++];
      const right = primary();
      if ((op === '/' || op === '%') && right === 0) throw new Error('لا يمكن القسمة على صفر.');
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (input[index] === '+' || input[index] === '-') {
      const op = input[index++];
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (index !== input.length || !Number.isFinite(result)) throw new Error('تعذر حساب التعبير.');
  return Number(result.toPrecision(12));
}

const commands = [
  {
    name: 'مساعدة', aliases: ['القائمة'], description: 'عرض الأوامر المتاحة',
    async execute(ctx) {
      await ctx.reply([
        'أوامر ARABIC-WA-BOT:',
        'عام: .مساعدة .القائمة .فحص .المدة .حاسبة .ترميز .فك_ترميز .معلومات_المجموعة .خدمات',
        'بحث: .ويكيبيديا موضوع .طقس مدينة .حزمة اسم .مستودع المالك/المستودع',
        'وسائط محلية: .ملصق .صوت .متحركة (تتطلب FFmpeg)',
        'مجموعة: .طرد .ترقية .تنزيل .تحذير .التحذيرات .مسح_التحذيرات .روابط تشغيل|إيقاف .سبام تشغيل|إيقاف .ترحيب تشغيل|إيقاف .رسالة_الترحيب نص .رسالة_الوداع نص .منشنالمشرفين .منشنالكل .قفل .فتح .رابط_المجموعة',
        'ألعاب: .ألعاب .عملة .نرد .خمن .لغز .جواب',
        'نقاط: .رصيدي .يومي .تحويل @عضو مبلغ .المتجر .شراء اسم .الترتيب',
        'ذكاء اصطناعي: .ذكاء نص (يتطلب مفتاح مزود محليًا في .env)',
        'المالك: .وضع_خاص .وضع_عام .إحصائيات (يتطلب OWNER_NUMBERS)',
        'الأوامر التي تعتمد على خدمات خارجية غير مهيأة لا تدّعي العمل.'
      ].join('\n'));
    }
  },
  {
    name: 'فحص', description: 'فحص استجابة البوت',
    async execute(ctx) {
      const sentAt = Number(ctx.message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000;
      await ctx.reply(`البوت يعمل. زمن الاستجابة التقريبي: ${Math.max(0, Date.now() - sentAt)} مللي ثانية.`);
    }
  },
  {
    name: 'المدة', description: 'عرض مدة تشغيل البوت',
    async execute(ctx) {
      const seconds = Math.floor(process.uptime());
      const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
      await ctx.reply(`مدة التشغيل: ${h} ساعة و${m} دقيقة و${s} ثانية.`);
    }
  },
  {
    name: 'حاسبة', description: 'حساب عملية رياضية آمنة',
    async execute(ctx) {
      try { await ctx.reply(`الناتج: ${calculate(ctx.args.join(' '))}`); }
      catch (error) { await ctx.reply(error.message); }
    }
  },
  {
    name: 'ترميز', description: 'تحويل نص إلى Base64',
    async execute(ctx) {
      const text = ctx.args.join(' ');
      if (!text) return ctx.reply(`استخدم: ${settings.PREFIX}ترميز النص`);
      await ctx.reply(Buffer.from(text, 'utf8').toString('base64'));
    }
  },
  {
    name: 'فك_ترميز', description: 'فك نص Base64',
    async execute(ctx) {
      const value = ctx.args.join(' ').trim();
      if (!value || value.length > 6000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return ctx.reply('أرسل نص Base64 صالحًا وقصيرًا.');
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (!decoded) return ctx.reply('لم أتمكن من فك النص.');
      await ctx.reply(decoded.slice(0, 3500));
    }
  },
  {
    name: 'معلومات_المجموعة', description: 'عرض معلومات المجموعة الحالية',
    async execute(ctx) {
      if (!ctx.isGroup) return ctx.reply('هذا الأمر يعمل داخل المجموعة فقط.');
      const meta = await ctx.sock.groupMetadata(ctx.chatId);
      await ctx.reply(`اسم المجموعة: ${meta.subject}\nعدد الأعضاء: ${meta.participants?.length || 0}\nمعرّف المجموعة: ${ctx.chatId}`);
    }
  },
  {
    name: 'خدمات', description: 'عرض جاهزية الخدمات الخارجية',
    async execute(ctx) {
      await ctx.reply([
        'حالة الخدمات الخارجية:',
        `الذكاء الاصطناعي: ${settings.AI_BASE_URL && settings.AI_API_KEY && settings.AI_MODEL ? 'مهيأ محليًا' : 'غير مهيأ؛ يحتاج AI_BASE_URL وAI_API_KEY وAI_MODEL في .env'}`,
        'الطقس وويكيبيديا وnpm وGitHub العام: تعتمد على الإنترنت وخدمات عامة وقد تتغير حدودها.',
        'التنزيلات وOCR وإنشاء الصور والترجمة الصوتية: غير مفعّلة؛ تحتاج اختيار مزود موثق واختبار واجهته.',
        'لا تضع الأسرار في المحادثة أو داخل ملفات الشيفرة.'
      ].join('\n'));
    }
  }
];

module.exports = commands;
