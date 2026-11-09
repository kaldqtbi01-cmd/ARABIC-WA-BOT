'use strict';

async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'ARABIC-WA-BOT/0.1 (user-requested lookup)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

module.exports = [
  {
    name: 'ويكيبيديا', description: 'بحث موجز في ويكيبيديا العربية',
    async execute(ctx) {
      const query = ctx.args.join(' ').trim();
      if (!query || query.length > 100) return ctx.reply('استخدم: .ويكيبيديا موضوع البحث. سيُرسل الاستعلام إلى ويكيبيديا.');
      const page = encodeURIComponent(query.replace(/\s+/g, '_'));
      try {
        const data = await getJson(`https://ar.wikipedia.org/api/rest_v1/page/summary/${page}`);
        const summary = data.extract;
        if (!summary) return ctx.reply('لم أجد ملخصًا لهذا الموضوع.');
        await ctx.reply(`${data.title}\n${summary.slice(0, 2500)}${data.content_urls?.desktop?.page ? `\n\nالمصدر: ${data.content_urls.desktop.page}` : ''}`);
      } catch (error) { await ctx.reply(`تعذر البحث في ويكيبيديا الآن (${error.message}).`); }
    }
  },
  {
    name: 'طقس', description: 'الطقس الحالي لمدينة عبر wttr.in',
    async execute(ctx) {
      const city = ctx.args.join(' ').trim();
      if (!city || city.length > 80) return ctx.reply('استخدم: .طقس اسم_المدينة. سيُرسل اسم المدينة إلى خدمة طقس خارجية.');
      try {
        const data = await getJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=ar`);
        const current = data.current_condition?.[0];
        if (!current) return ctx.reply('لم تصل بيانات الطقس لهذه المدينة.');
        const description = current.lang_ar?.[0]?.value || current.weatherDesc?.[0]?.value || 'غير متاح';
        await ctx.reply(`الطقس في ${city}: ${description}\nالحرارة: ${current.temp_C}°م\nالإحساس: ${current.FeelsLikeC}°م\nالرطوبة: ${current.humidity}%`);
      } catch (error) { await ctx.reply(`تعذر جلب الطقس الآن (${error.message}).`); }
    }
  },
  {
    name: 'حزمة', description: 'معلومات عن حزمة npm عامة',
    async execute(ctx) {
      const name = ctx.args.join(' ').trim();
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]{1,80}$/i.test(name)) return ctx.reply('استخدم اسم حزمة صالحًا.');
      try {
        const data = await getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
        const version = data['dist-tags']?.latest || 'غير معروف';
        await ctx.reply(`${data.name || name}\nالإصدار الأحدث: ${version}\n${(data.description || 'لا يوجد وصف').slice(0, 500)}\n${data.homepage || `https://www.npmjs.com/package/${encodeURIComponent(name)}`}`);
      } catch (error) { await ctx.reply(`تعذر العثور على الحزمة أو الوصول إلى السجل (${error.message}).`); }
    }
  },
  {
    name: 'مستودع', description: 'معلومات عن مستودع GitHub عام',
    async execute(ctx) {
      const repo = ctx.args.join('').trim();
      if (!/^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)) return ctx.reply('استخدم: .مستودع المالك/المستودع');
      try {
        const data = await getJson(`https://api.github.com/repos/${repo}`);
        await ctx.reply(`${data.full_name}\n${(data.description || 'لا يوجد وصف').slice(0, 500)}\nالنجوم: ${data.stargazers_count}\nاللغة: ${data.language || 'غير محددة'}\n${data.html_url}`);
      } catch (error) { await ctx.reply(`تعذر الوصول إلى المستودع (${error.message}). قد تكون حصة GitHub العامة قد انتهت.`); }
    }
  }
];
