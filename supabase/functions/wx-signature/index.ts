/**
 * 微信 JS-SDK 签名服务（Supabase Edge Function）
 *
 * 部署：
 *   1. Supabase Dashboard → Edge Functions → 新建函数 wx-signature，粘贴本文件
 *      （建议关闭 "Verify JWT"，本函数不校验登录态）
 *   2. Project Settings → Edge Functions → Secrets 里加：
 *        WX_APPID  = 公众号 AppID
 *        WX_SECRET = 公众号 AppSecret（只放服务端，绝不要写进前端）
 *   3. 前端 assets/js/wx-share.js 的 WX_APP_ID 填同一个 AppID
 *
 * 请求：POST { "url": "https://nige11644.github.io/family-menu-v2/?code=ABC123" }
 * 返回：{ appId, timestamp, nonceStr, signature }
 */

const WX_APPID = Deno.env.get('WX_APPID') ?? '';
const WX_SECRET = Deno.env.get('WX_SECRET') ?? '';

const ALLOW_ORIGINS = [
  'https://nige11644.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173'
];

let tokenCache = { value: '', expireAt: 0 };
let ticketCache = { value: '', expireAt: 0 };

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expireAt) return tokenCache.value;

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
  const data = await fetch(url).then((r) => r.json());
  if (!data.access_token) throw new Error(`获取 access_token 失败：${data.errcode} ${data.errmsg}`);

  tokenCache = { value: data.access_token, expireAt: Date.now() + (Number(data.expires_in || 7200) - 300) * 1000 };
  return data.access_token;
}

async function getJsapiTicket(force = false) {
  if (!force && ticketCache.value && Date.now() < ticketCache.expireAt) return ticketCache.value;

  const token = await getAccessToken();
  const data = await fetch(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`).then((r) => r.json());
  if (!data.ticket) throw new Error(`获取 jsapi_ticket 失败：${data.errcode} ${data.errmsg}`);

  ticketCache = { value: data.ticket, expireAt: Date.now() + (Number(data.expires_in || 7200) - 300) * 1000 };
  return data.ticket;
}

function nonceStr(len = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

async function sha1Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sign(ticket: string, timestamp: number, nonce: string, url: string) {
  return sha1Hex(`jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${timestamp}&url=${url}`);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: '只支持 POST' }, 405, origin);

  if (!WX_APPID || !WX_SECRET) {
    return json({ error: '服务端未配置 WX_APPID / WX_SECRET' }, 500, origin);
  }

  let url = '';
  try {
    url = String((await req.json())?.url ?? '');
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400, origin);
  }
  if (!/^https?:\/\//.test(url)) return json({ error: '缺少合法的 url' }, 400, origin);

  try {
    return json(await buildSignature(url), 200, origin);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    // access_token / ticket 过期或失效：清缓存重试一次
    if (/40001|40014|42001/.test(msg)) {
      tokenCache = { value: '', expireAt: 0 };
      ticketCache = { value: '', expireAt: 0 };
      try {
        return json(await buildSignature(url), 200, origin);
      } catch (err2) {
        return json({ error: String((err2 as Error)?.message ?? err2) }, 502, origin);
      }
    }
    return json({ error: msg }, 502, origin);
  }
});

async function buildSignature(url: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = nonceStr();
  const ticket = await getJsapiTicket();
  const signature = await sign(ticket, timestamp, nonce, url);
  return { appId: WX_APPID, timestamp, nonceStr: nonce, signature };
}
