'use strict';

const settings = require('../../config/settings');

module.exports = {
  name: 'ذكاء', description: 'إرسال سؤال إلى مزود ذكاء اصطناعي مهيأ محليًا',
  async execute(ctx) {
    const prompt = ctx.args.join(' ').trim();
    if (!prompt) return ctx.reply('استخدم: .ذكاء ثم اكتب سؤالك. لا ترسل معلومات حساسة؛ سيصل النص إلى مزود الذكاء الاصطناعي الذي تختاره.');
    if (!settings.AI_BASE_URL || !settings.AI_API_KEY || !settings.AI_MODEL) {
      return ctx.reply('خدمة الذكاء الاصطناعي غير مهيأة. أضف AI_BASE_URL وAI_API_KEY وAI_MODEL محليًا إلى .env، ثم أعد تشغيل البوت. لا ترسل المفتاح هنا.');
    }
    if (prompt.length > 6000) return ctx.reply('السؤال طويل؛ الحد الأقصى 6000 حرف.');
    let endpoint;
    try {
      const base = new URL(settings.AI_BASE_URL);
      if (base.protocol !== 'https:') return ctx.reply('لأمان المفتاح، يجب أن يبدأ AI_BASE_URL بـ https://.');
      endpoint = new URL(`${base.toString().replace(/\/$/, '')}/chat/completions`);
    } catch {
      return ctx.reply('قيمة AI_BASE_URL غير صالحة؛ تحقق من كتابتها في .env.');
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${settings.AI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: settings.AI_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 700 }),
        signal: AbortSignal.timeout(settings.HTTP_TIMEOUT_MS)
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        console.warn('AI provider returned:', response.status, detail);
        return ctx.reply(`تعذر إكمال الطلب من مزود الذكاء الاصطناعي (HTTP ${response.status}). راجع إعدادات المزود وحصته.`);
      }
      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) return ctx.reply('لم يُرجع المزود نصًا؛ تحقق من اسم النموذج وتوافق الواجهة.');
      await ctx.reply(answer.trim().slice(0, 3500));
    } catch (error) {
      console.error('AI request failed:', error.message);
      await ctx.reply('فشل الاتصال بمزود الذكاء الاصطناعي. تحقق من الإنترنت وإعدادات الخدمة.');
    }
  }
};
