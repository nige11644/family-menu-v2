const BASE = 'https://nige11644.github.io/family-menu-v2/';
const COVER = 'https://nige11644.github.io/family-menu-v2/assets/img/share-cover.jpg';

Page({
  data: { url: BASE },

  onLoad(options) {
    const code = String(options.code || '').toUpperCase().slice(0, 12);
    this.familyCode = code;
    this.familyName = '';
    if (code) this.setData({ url: `${BASE}?code=${encodeURIComponent(code)}` });
  },

  // 网页里点「邀请家人」时通过 wx.miniProgram.postMessage 传过来
  onMessage(e) {
    const list = (e.detail && e.detail.data) || [];
    const last = list[list.length - 1] || {};
    if (last.code) this.familyCode = String(last.code).toUpperCase();
    if (last.name) this.familyName = String(last.name);
  },

  onError(e) {
    console.warn('web-view 加载失败', e.detail);
  },

  onShareAppMessage() {
    const code = this.familyCode || '';
    const name = this.familyName || '家宴';
    return {
      title: code ? `来「${name}」点菜啦` : '家宴 · 家庭点菜',
      path: `/pages/index/index${code ? `?code=${code}` : ''}`,
      imageUrl: COVER
    };
  }
});
