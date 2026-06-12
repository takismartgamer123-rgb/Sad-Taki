// TAKI ULTIMATE V14.0 EMPEROR SMART QUOTA 👑
// 5 مفاتيح + Cache ذكي + 0 كوتا للشات

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

// تخزين مؤقت + Round Robin للمفاتيح
let cache = {
  videoId: null,
  videoIdTime: 0,
  stats: null,
  statsTime: 0,
  treasure: null,
  keyIndex: 0 // باه نبدلو المفاتيح
};

// نجيب المفتاح التالي كل مرة
function getNextKey(env) {
  const keys = [env.YT_KEY_1, env.YT_KEY_2, env.YT_KEY_3, env.YT_KEY_4, env.YT_KEY_5].filter(Boolean);
  if (keys.length === 0) return null;
  const key = keys[cache.keyIndex % keys.length];
  cache.keyIndex++;
  return key;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      // 1. /stats - بـ 5 مفاتيح + Cache 60 ثانية
      if (url.pathname === '/stats') {
        if (cache.stats && Date.now() - cache.statsTime < 60000) {
          return Response.json(cache.stats, { headers: CORS });
        }

        const keys = [env.YT_KEY_1, env.YT_KEY_2, env.YT_KEY_3, env.YT_KEY_4, env.YT_KEY_5].filter(Boolean);

        for (const key of keys) {
          try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${env.CHANNEL_ID}&key=${key}`;
            const res = await fetch(apiUrl);
            if (res.status === 403) continue; // مفتاح ميت
            const data = await res.json();
            if (!data.items?.length) continue;

            const stats = data.items[0].statistics;
            const result = {
              success: true,
              subs: parseInt(stats.subscriberCount).toLocaleString('ar-DZ'),
              views: parseInt(stats.viewCount).toLocaleString('ar-DZ'),
              videos: stats.videoCount,
              raw_subs: parseInt(stats.subscriberCount)
            };

            cache.stats = result;
            cache.statsTime = Date.now();
            return Response.json(result, { headers: CORS });
          } catch (e) { continue; }
        }
        return Response.json({ error: "كل المفاتيح خلصو الكوتا", success: false }, { status: 429, headers: CORS });
      }

      // 2. /chat - بلا كوتا نهائيا + يجيب videoId وحدو بمفتاح واحد
      if (url.pathname === '/chat') {
        let videoId = url.searchParams.get('v');

        if (!videoId) {
          if (cache.videoId && Date.now() - cache.videoIdTime < 120000) {
            videoId = cache.videoId;
          } else {
            // نستعمل مفتاح واحد برك كل 2 دقايق = 720 طلب/يوم = 72 نقطة برك
            const key = getNextKey(env);
            if (key) {
              const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${env.CHANNEL_ID}&eventType=live&type=video&key=${key}`;
              const searchRes = await fetch(searchUrl);
              const searchData = await searchRes.json();
              videoId = searchData.items[0]?.id?.videoId;
              if (videoId) {
                cache.videoId = videoId;
                cache.videoIdTime = Date.now();
              }
            }
          }
        }

        if (!videoId) return Response.json({ success: true, messages: [] }, { headers: CORS });

        // 3 مصادر خارجية = 0 كوتا يوتيوب للشات
        const sources = [
          `https://api.livechat.anxkun04.workers.dev/?v=${videoId}`,
          `https://yt-live-chat-producer.gioshipment.workers.dev/?v=${videoId}`,
          `https://ytchat-1.kirito67.workers.dev/?v=${videoId}`
        ];

        for (const source of sources) {
          try {
            const res = await fetch(source, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            if (data.messages?.length > 0) {
              return Response.json({ success: true, messages: data.messages }, { headers: CORS });
            }
          } catch (e) {}
        }
        return Response.json({ success: true, messages: [] }, { headers: CORS });
      }

      // 3. /addPoints - زيادة النقاط + لفل اوتوماتيك
      if (url.pathname === '/addPoints' && request.method === 'POST') {
        const { user, points } = await request.json();
        if (!user || points === undefined) throw new Error('user ولا points ناقصين');

        let userData = await env.POINTS_KV.get(user, 'json') || { points: 0, level: 1, title: 'مشاهد' };
        userData.points = (userData.points || 0) + points;
        userData.level = Math.floor(userData.points / 1000) + 1;

        await env.POINTS_KV.put(user, JSON.stringify(userData));
        return Response.json({ success: true, total: userData.points, level: userData.level }, { headers: CORS });
      }

      // 4. /getUser - للـ!نقاطي
      if (url.pathname === '/getUser') {
        const user = url.searchParams.get('user');
        const userData = await env.POINTS_KV.get(user, 'json') || { points: 0, level: 1, title: 'مشاهد' };
        return Response.json({
          success: true,
          user: user,
          points: userData.points || 0,
          level: userData.level || 1,
          title: userData.title || 'مشاهد'
        }, { headers: CORS });
      }

      // 5. /buy - للـ!شراء لقب
      if (url.pathname === '/buy') {
        const user = url.searchParams.get('user');
        const title = url.searchParams.get('title');
        const price = parseInt(url.searchParams.get('price'));

        let userData = await env.POINTS_KV.get(user, 'json') || { points: 0, level: 1, title: 'مشاهد' };
        if ((userData.points || 0) < price) {
          return Response.json({ success: false, error: 'نقاطك ما تكفيش' }, { headers: CORS });
        }

        userData.points -= price;
        userData.title = title;
        await env.POINTS_KV.put(user, JSON.stringify(userData));
        return Response.json({ success: true, title: title, remaining: userData.points }, { headers: CORS });
      }

      // 6. /gift - للـ!هدية
      if (url.pathname === '/gift') {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const amount = parseInt(url.searchParams.get('amount'));

        let fromData = await env.POINTS_KV.get(from, 'json') || { points: 0, level: 1, title: 'مشاهد' };
        if (fromData.lastGift && Date.now() - fromData.lastGift < 30000) {
          return Response.json({ success: false, error: 'استنى 30 ثانية بين الهدايا' }, { headers: CORS });
        }
        if ((fromData.points || 0) < amount) {
          return Response.json({ success: false, error: 'نقاطك ما تكفيش' }, { headers: CORS });
        }

        let toData = await env.POINTS_KV.get(to, 'json') || { points: 0, level: 1, title: 'مشاهد' };
        fromData.points -= amount;
        fromData.lastGift = Date.now();
        toData.points = (toData.points || 0) + amount;
        toData.level = Math.floor(toData.points / 1000) + 1;

        await env.POINTS_KV.put(from, JSON.stringify(fromData));
        await env.POINTS_KV.put(to, JSON.stringify(toData));
        return Response.json({ success: true }, { headers: CORS });
      }

      // 7. /treasure - للـ!كنز
      if (url.pathname === '/treasure') {
        const action = url.searchParams.get('action');
        if (action === 'new') {
          cache.treasure = Math.floor(Math.random() * 100) + 1;
          return Response.json({ success: true }, { headers: CORS });
        }
        if (action === 'guess') {
          const user = url.searchParams.get('user');
          const guess = parseInt(url.searchParams.get('guess'));
          if (!cache.treasure) cache.treasure = Math.floor(Math.random() * 100) + 1;

          if (guess === cache.treasure) {
            let userData = await env.POINTS_KV.get(user, 'json') || { points: 0, level: 1, title: 'مشاهد' };
            userData.points = (userData.points || 0) + 1000;
            userData.level = Math.floor(userData.points / 1000) + 1;
            await env.POINTS_KV.put(user, JSON.stringify(userData));
            cache.treasure = Math.floor(Math.random() * 100) + 1;
            return Response.json({ success: true, win: true, number: guess }, { headers: CORS });
          } else {
            const hint = guess > cache.treasure? 'أصغر' : 'أكبر';
            return Response.json({ success: true, win: false, hint: hint }, { headers: CORS });
          }
        }
      }

      // 8. /top3 - للـ!ترتيب
      if (url.pathname === '/top3') {
        const list = await env.POINTS_KV.list();
        let users = [];
        for (const key of list.keys) {
          const data = await env.POINTS_KV.get(key.name, 'json');
          if (data) users.push({ user: key.name, points: data.points || 0, title: data.title || 'مشاهد' });
        }
        users.sort((a, b) => b.points - a.points);
        return Response.json({ success: true, top: users.slice(0, 3) }, { headers: CORS });
      }

      return new Response('TAKI WORKER V14.0 SMART QUOTA 👑 ONLINE', { headers: CORS });

    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500, headers: CORS });
    }
  }
};
