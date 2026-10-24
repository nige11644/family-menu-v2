/**
 * 微信 JS-SDK 分享配置（只在微信内置浏览器里生效）
 *
 * 启用步骤：
 *   1. 把下方 WX_APP_ID 换成公众号 AppID
 *   2. 部署 Supabase Edge Function `wx-signature`（见 supabase/functions/wx-signature/index.ts）
 *      并配置环境变量 WX_APPID / WX_SECRET
 *   3. 公众号后台「设置与开发 → 公众号设置 → 功能设置」把「JS 接口安全域名」设为
 *      nige11644.github.io，并按提示把 MP_verify_xxx.txt 放到站点根目录
 *
 * 未配置时全部静默跳过，邀请弹层仍然可以用「复制邀请文案」。
 */
import { readSupabaseConfig } from './cloud-store.js';

const WX_APP_ID = ''; // ← 公众号 AppID（公开信息，可写在这里）

let ready = false;
let loading = null;

export function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent || '');
}

export function wxShareReady() {
  return ready;
}

export function shareCoverUrl() {
  return new URL('assets/img/share-cover.jpg', location.origin + location.pathname).href;
}

function loadSdk() {
  if (window.wx) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('assets/js/vendor/jweixin.js', location.origin + location.pathname).href;
    s.onload = resolve;
    s.onerror = () => reject(new Error('微信 JS-SDK 加载失败'));
    document.head.appendChild(s);
  });
}

/** 拉签名并完成 wx.config；返回是否可用 */
export function initWxShare() {
  if (!isWeChat() || !WX_APP_ID) return Promise.resolve(false);
  if (ready) return Promise.resolve(true);
  if (loading) return loading;

  loading = (async () => {
    const { url, key } = readSupabaseConfig();
    if (!url) return false;

    await loadSdk();

    // 签名用的 URL 必须与当前页面一致，且不含 #hash
    const pageUrl = location.href.split('#')[0];
    const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/wx-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {})
      },
      body: JSON.stringify({ url: pageUrl })
    });
    if (!res.ok) throw new Error(`微信签名服务不可用（${res.status}）`);
    const cfg = await res.json();
    if (!cfg.signature) throw new Error(cfg.error || '微信签名失败');

    await new Promise((resolve, reject) => {
      window.wx.config({
        debug: false,
        appId: cfg.appId || WX_APP_ID,
        timestamp: cfg.timestamp,
        nonceStr: cfg.nonceStr,
        signature: cfg.signature,
        jsApiList: [
          'updateAppMessageShareData',
          'updateTimelineShareData',
          'onMenuShareAppMessage',
          'onMenuShareTimeline'
        ]
      });
      window.wx.ready(resolve);
      window.wx.error(reject);
    });

    ready = true;
    return true;
  })().catch((err) => {
    console.warn('[wx-share]', err);
    loading = null;
    return false;
  });

  return loading;
}

/** 设置「发送给朋友 / 分享到朋友圈」的卡片内容 */
export function setWxShare({ title, desc, link, img }) {
  if (!ready) return false;
  const payload = { title, desc, link, imgUrl: img || shareCoverUrl() };
  try {
    window.wx.updateAppMessageShareData?.(payload);
    window.wx.updateTimelineShareData?.({ title, link: payload.link, imgUrl: payload.imgUrl });
    // 老版本微信（<6.7.2）仍需旧接口
    window.wx.onMenuShareAppMessage?.(payload);
    window.wx.onMenuShareTimeline?.({ title, link: payload.link, imgUrl: payload.imgUrl });
    return true;
  } catch (err) {
    console.warn('[wx-share]', err);
    return false;
  }
}
