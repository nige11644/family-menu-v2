import { demoStore } from './demo-store.js';
import { CloudStore, readSupabaseConfig, saveSupabaseConfig, testConnection } from './cloud-store.js';
import { CATEGORIES } from './seed.js';
import {
  esc, icon, toast, beep, haptic, openSheet, confirmSheet,
  fmtTime, fmtDate, timeAgo, isToday, statusMeta, debounce, go
} from './ui.js';

const appEl = document.getElementById('app');

const state = {
  store: demoStore,
  mode: 'demo',
  session: null,
  families: [],              // 当前用户属于的所有家庭 [{ familyId, familyName, joinCode, role, family: { id, name, joinCode } }]
  currentFamily: null,       // 当前选中的家庭 { id, name, joinCode }
  dishes: [],
  orders: [],
  avatarMap: new Map(),      // 家庭成员头像：userId -> avatar key
  cart: [],
  detailCache: new Map(),
  menuCategory: '全部',
  menuQuery: '',
  chefQuery: '',
  chefStatus: 'all',
  chefTab: 'active',
  reviewContext: null,       // 好评上下文（review_context RPC 返回）
  reviewDraft: null,         // 好评表单草稿（按 session 缓存）
  reviewEditing: false,      // 已送好评后是否正在修改
  dice: null,                // 摇骰子上下文（dice_context RPC 返回）
  diceLoaded: false,         // 是否已加载过骰子数据（SQL 未执行时保持 false，入口自动隐藏）
  diceRule: 'max_lose',      // 开局默认规则
  diceRevealId: '',          // 已播过揭晓动画的局 id，避免重复渲染时反复翻转
  diceTimer: null,           // 60 秒倒计时定时器
  diceRolling: false,        // 骰子请求进行中（防重复点击）
  members: [],               // 房间成员（room_members RPC 返回）
  membersLoaded: false,      // 成员数据是否可用（members.sql 未执行时为 false）
  presenceIds: new Set(),    // 当前在线成员 userId
  routeName: '',
  ready: false
};

/* ---------- 预设头像 ---------- */
const AVATARS = [
  { key: 'chef', emoji: '👩‍🍳', bg: '#f7e5db' },
  { key: 'bowl', emoji: '🍲', bg: '#e5efe7' },
  { key: 'dumpling', emoji: '🥟', bg: '#f5ead6' },
  { key: 'shrimp', emoji: '🍤', bg: '#fbe6d8' },
  { key: 'orange', emoji: '🍊', bg: '#faecd2' },
  { key: 'flower', emoji: '🌸', bg: '#fbe4e4' },
  { key: 'cat', emoji: '🐱', bg: '#f3e8d9' },
  { key: 'panda', emoji: '🐼', bg: '#e9eee9' }
];
const avatarPreset = (key) => AVATARS.find((a) => a.key === key) || null;

function avatarCircle(s, size = '') {
  const cls = `avatar${size ? ` ${size}` : ''}`;
  // 自定义头像存的是公开 URL（或演示模式下的 data URL）
  if (/^(https?:|data:image)/i.test(s?.avatar || '')) {
    return `<span class="${cls}"><img class="av-img" src="${esc(s.avatar)}" alt=""></span>`;
  }
  const p = avatarPreset(s?.avatar);
  if (p) return `<span class="${cls}" style="background:${p.bg}"><span class="av-emoji">${p.emoji}</span></span>`;
  return `<span class="${cls}">${esc((s?.nickname || '我').slice(0, 1))}</span>`;
}

// 把用户选的照片裁成正方形并压缩成 JPEG（纯 Canvas，不需要构建工具）
function squareJpeg(file, size = 240) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        canvas.toBlob((b) => {
          URL.revokeObjectURL(objUrl);
          b ? resolve(b) : reject(new Error('图片转换失败'));
        }, 'image/jpeg', 0.86);
      } catch (e) {
        URL.revokeObjectURL(objUrl);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('无法读取这张图片'));
    };
    img.src = objUrl;
  });
}

// 家人头像：按 userId 查当前家庭头像表，查不到就回落到昵称首字
function memberAvatar(userId, nickname, size = 'xs') {
  const av = (userId && state.avatarMap.get(userId)) || '';
  return avatarCircle({ avatar: av, nickname }, size);
}

/* ============ 启动 ============ */
boot();

async function boot() {
  const cfg = readSupabaseConfig();
  const savedMode = localStorage.getItem('fm_mode') || (cfg.url && cfg.key ? 'cloud' : 'demo');

  if (savedMode === 'cloud' && cfg.url && cfg.key) {
    try {
      const cloud = new CloudStore(cfg.url, cfg.key);
      await cloud.init();
      state.store = cloud;
      state.mode = 'cloud';
    } catch (err) {
      console.warn('[cloud]', err);
      toast(err.message, { duration: 4200 });
      state.store = demoStore;
      state.mode = 'demo';
    }
  }

  state.session = state.store.getSession();
  console.log('[boot] mode=', state.mode, 'session=', JSON.stringify(state.session));
  state.cart = loadCart();
  // 进入家宴先把「最后活跃」写一次，再拉成员列表，厨师端才能显示准确时间
  await state.store.touchMember?.().catch(() => {});
  await refreshData(true);
  state.ready = true;
  render();
  window.addEventListener('hashchange', render);
  state.store.subscribe(onRealtime);
  state.presenceIds = state.store.presenceIds?.() || new Set();
  startMemberHeartbeat();
  registerSW();
}

// 低频心跳：每 60 秒（仅前台）更新一次最后活跃时间，断网/关页面由 Presence 负责
let memberHeartbeat = null;
function startMemberHeartbeat() {
  if (!state.store.touchMember) return;
  const tick = () => {
    if (document.visibilityState === 'visible') state.store.touchMember().catch(() => {});
  };
  clearInterval(memberHeartbeat);
  memberHeartbeat = setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ============ 数据 ============ */
async function refreshData(silent = false) {
  try {
    // 更新 session（可能在别处被切换家庭后修改了 localStorage）
    state.session = state.store.getSession();

    // 更新家庭列表与当前家庭
    if (state.session && state.store.listFamilies) {
      state.families = await state.store.listFamilies();
      if (state.session.currentFamilyId) {
        const curFm = state.families.find((f) => f.familyId === state.session.currentFamilyId);
        state.currentFamily = curFm?.family || null;
        // 把"当前家庭里的角色"挂到 session 顶层（render() 靠它判断能不能进厨师页）
        state.session.role = curFm?.role ?? state.session.role ?? 0;
      } else if (state.families.length > 0) {
        state.currentFamily = state.families[0].family;
        state.session.role = state.families[0].role ?? state.session.role ?? 0;
        state.session.currentFamilyId = state.families[0].familyId;
      } else {
        state.currentFamily = null;
      }
    }

    const [dishes, orders, members] = await Promise.all([
      state.store.listDishes(),
      state.store.listOrders(),
      state.store.listFamilyAvatars ? state.store.listFamilyAvatars().catch(() => []) : Promise.resolve([])
    ]);
    state.dishes = dishes;
    state.orders = orders;
    state.avatarMap = new Map((members || []).map((m) => [m.userId, m.avatar || '']));
    state.detailCache.clear();

    // 好评上下文：review.sql 未执行时静默跳过，不影响点菜主流程
    if (state.store.reviewContext) {
      state.reviewContext = await state.store.reviewContext().catch(() => null);
    } else {
      state.reviewContext = null;
    }
  } catch (err) {
    if (!silent) toast(err.message || '加载失败', { duration: 4000 });
  }

  // 放在 try 之外：即使菜品/订单加载失败，骰子入口也要能正常判断
  await loadDice(true);
  // 厨师端才需要完整成员列表；家人端不额外增加请求
  if (state.session?.role === 1) await loadMembers(true);
}

/* 读取房间成员（members.sql 未执行时返回 null，成员页显示执行提示） */
async function loadMembers(silent = true) {
  if (!state.store.listRoomMembers || !state.session) {
    state.members = [];
    state.membersLoaded = false;
    return;
  }
  try {
    const rows = await state.store.listRoomMembers();
    state.membersLoaded = rows !== null;
    state.members = rows || [];
    state.presenceIds = state.store.presenceIds?.() || new Set();
  } catch (err) {
    state.membersLoaded = false;
    state.members = [];
    if (!silent) toast(err.message || '成员加载失败', { duration: 3000 });
  }
}

/* 读取摇骰子状态（dice.sql 未执行 / 演示模式时静默隐藏入口） */
async function loadDice(silent = true) {
  if (!state.store.diceContext || !state.session) {
    state.dice = null;
    state.diceLoaded = false;
    return;
  }
  try {
    const ctx = await state.store.diceContext();
    state.dice = ctx;
    state.diceLoaded = !!ctx;
  } catch (err) {
    state.dice = null;
    state.diceLoaded = false;
    if (!silent) toast(err.message || '摇骰子加载失败', { duration: 3000 });
  }
}

let refreshTimer = null;
let presenceTimer = null;
let membersTimer = null;
function onRealtime(event) {
  if (!state.ready || event.type === 'profile') return;

  // 在线状态（Presence）：只更新成员页，不重拉订单
  if (event.type === 'presence') {
    state.presenceIds = state.store.presenceIds?.() || new Set();
    if (currentPath() === '/chef/members') {
      clearTimeout(presenceTimer);
      presenceTimer = setTimeout(() => { if (currentPath() === '/chef/members') renderPreserveScroll(); }, 350);
    }
    return;
  }

  // 成员备注 / 缺席 / 归档变化
  if (event.type === 'members') {
    clearTimeout(membersTimer);
    membersTimer = setTimeout(async () => {
      await loadMembers(true);
      if (currentPath() === '/chef/members') renderPreserveScroll();
    }, 160);
    return;
  }

  // 厨师「催单」广播：只针对被点名的在线家人
  if (event.type === 'nudge') {
    if (state.session?.role !== 1 && Array.isArray(event.userIds) && event.userIds.includes(state.session?.userId)) {
      showNudgeBanner(event.from);
    }
    return;
  }

  // 骰子局变化：只刷新骰子状态，避免整页订单重新拉取
  if (event.type === 'dice') {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      await loadDice(true);
      renderPreserveScroll();
    }, 120);
    return;
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const prevIds = new Set(state.orders.map((o) => o.id));
    const prevReviewIds = new Set((state.reviewContext?.todayReviews || []).map((r) => r.id));
    await refreshData(true);
    const fresh = state.orders.find((o) => !prevIds.has(o.id) && o.status !== 'done');
    if (fresh && state.session?.role === 1 && fresh.userName !== state.session.nickname) {
      showNewOrderBanner(fresh);
      beep('new');
    }
    if (event.type === 'reviews' && state.session?.role === 1) {
      const freshReview = (state.reviewContext?.todayReviews || []).find((r) => !prevReviewIds.has(r.id) && !r.mine);
      if (freshReview) {
        showNewReviewBanner(freshReview);
        beep('new');
        haptic(15);
      }
    }
    if (!/^\/chef\/dish\//.test(currentPath())) renderPreserveScroll();
  }, 160);
}

function showNewOrderBanner(order) {
  document.querySelector('.new-order-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'new-order-banner';
  const dishes = order.items.map((i) => `${i.dishName}×${i.servings}`).join('、');
  el.innerHTML = `<span>${icon('bell', 20)}</span><div class="nb-text"><b>${esc(order.userName)}</b> 点了 ${esc(dishes)}</div><button>去看</button>`;
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', () => {
    state.chefTab = 'active';
    el.remove();
    go('/chef');
  });
  setTimeout(() => el.remove(), 5000);
}

function showNewReviewBanner(review) {
  document.querySelector('.new-review-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'new-order-banner new-review-banner';
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  el.innerHTML = `<span class="nr-flower">🌸</span><div class="nb-text"><b>${esc(review.nickname)}</b> 送来了 ${stars}<br>${esc(review.comment || '家人的好评')}</div><button>去看看</button>`;
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', () => {
    el.remove();
    go('/chef/summary');
  });
  setTimeout(() => el.remove(), 6000);
}

function showNudgeBanner(from) {
  document.querySelector('.nudge-banner')?.remove();
  const el = document.createElement('div');
  el.className = 'new-order-banner nudge-banner';
  el.innerHTML = `<span class="nr-flower">👨‍🍳</span><div class="nb-text"><b>${esc(from || '主厨')}</b> 喊你点菜啦～<br>今晚想吃什么？</div><button>去点菜</button>`;
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', () => {
    el.remove();
    go('/menu');
  });
  beep('soft');
  setTimeout(() => el.remove(), 8000);
}

/* ============ 路由 ============ */
function currentPath() {
  const p = location.hash.replace(/^#/, '');
  // 从微信/桌面图标直接打开根路径（无 hash）时按菜单页处理，
  // 否则 render() 会渲染菜单但 bindPage('/') 匹配不上 '/menu'，整页按钮都点不了
  return p && p !== '/' ? p : '/menu';
}

/* 视角：厨师可在「厨师端 / 家人端」之间来回切换；客人只有家人端 */
function viewMode() {
  if (state.session?.role !== 1) return 'family';
  return localStorage.getItem('fm_view_mode') === 'family' ? 'family' : 'chef';
}
function setViewMode(mode) {
  if (state.session?.role !== 1) return;
  if (mode === 'family') localStorage.setItem('fm_view_mode', 'family');
  else localStorage.removeItem('fm_view_mode');
}

function render() {
  if (!state.ready) return;
  const path = currentPath();

  if (!state.session && path !== '/join') {
    location.replace('#/join');
    return;
  }
  if (path === '/join' && state.session) {
    location.replace(viewMode() === 'chef' ? '#/chef' : '#/menu');
    return;
  }
  if (path.startsWith('/chef') && state.session && state.session.role !== 1) {
    toast('这里是厨房重地，先切换成厨师身份');
    location.replace('#/menu');
    return;
  }
  // 厨师切到家人视角后，厨师页面暂时不可见，避免两端界面混着用
  if (path.startsWith('/chef') && state.session?.role === 1 && viewMode() === 'family') {
    location.replace('#/menu');
    return;
  }

  const m = (re) => path.match(re);
  let html = '';

  if (path === '/join') {
    html = pageJoin();
  } else if (path === '/menu') {
    html = pageMenu();
  } else if (m(/^\/dish\/([^/]+)$/)) {
    html = pageDish(m(/^\/dish\/([^/]+)$/)[1]);
  } else if (m(/^\/recipe\/([^/]+)$/)) {
    html = pageRecipe(m(/^\/recipe\/([^/]+)$/)[1]);
  } else if (path === '/orders') {
    html = pageOrders();
  } else if (path === '/review') {
    html = pageReview();
  } else if (path === '/dice') {
    html = pageDice();
  } else if (path === '/chef') {
    state.routeName = 'chef';
    html = pageChefBoard();
  } else if (path === '/chef/summary') {
    html = pageChefSummary();
  } else if (path === '/chef/dishes') {
    html = pageChefDishes();
  } else if (path === '/chef/members') {
    html = pageChefMembers();
  } else if (m(/^\/chef\/dish\/([^/]+)\/recipe$/)) {
    html = pageRecipeEdit(m(/^\/chef\/dish\/([^/]+)\/recipe$/)[1]);
  } else if (m(/^\/chef\/dish\/([^/]+)$/)) {
    html = pageDishEdit(m(/^\/chef\/dish\/([^/]+)$/)[1]);
  } else if (path === '/settings') {
    html = pageSettings();
  } else {
    html = pageMenu();
  }

  appEl.innerHTML = html;
  window.scrollTo(0, 0);
  bindPage(path);
}

function renderPreserveScroll() {
  const y = window.scrollY;
  const path = currentPath();
  let html = '';
  if (path === '/menu') html = pageMenu();
  else if (path === '/orders') html = pageOrders();
  else if (path === '/review') html = pageReview();
  else if (path === '/dice') html = pageDice();
  else if (path === '/chef') html = pageChefBoard();
  else if (path === '/chef/summary') html = pageChefSummary();
  else if (path === '/chef/dishes') html = pageChefDishes();
  else if (path === '/chef/members') html = pageChefMembers();
  else if (path === '/settings') html = pageSettings();
  else if (/^\/chef\/dish\/[^/]+\/recipe$/.test(path)) html = pageRecipeEdit(path.split('/')[3]);
  else if (/^\/chef\/dish\/[^/]+$/.test(path)) html = pageDishEdit(path.split('/')[3]);
  else if (path === '/join') html = pageJoin();
  else return;
  appEl.innerHTML = html;
  window.scrollTo(0, y);
  bindPage(path, true);
}

function bindPage(path, isRefresh = false) {
  clearInterval(state.diceTimer);
  state.diceTimer = null;
  if (path === '/join') bindJoin();
  else if (path === '/menu') bindMenu();
  else if (path.startsWith('/dish/')) bindDish(path.split('/')[2]);
  else if (path.startsWith('/recipe/')) bindRecipe(path.split('/')[2]);
  else if (path === '/orders') bindOrders();
  else if (path === '/review') bindReview();
  else if (path === '/dice') bindDice();
  else if (path === '/chef') bindChefBoard();
  else if (path === '/chef/summary') bindRefresh();
  else if (path === '/chef/dishes') bindChefDishes();
  else if (path === '/chef/members') bindChefMembers();
  else if (/^\/chef\/dish\/[^/]+\/recipe$/.test(path)) bindRecipeEdit(path.split('/')[3]);
  else if (/^\/chef\/dish\/[^/]+$/.test(path)) bindDishEdit(path.split('/')[3]);
  else if (path === '/settings') bindSettings();
  document.querySelectorAll('[data-go-review]').forEach((b) => b.addEventListener('click', () => go('/review')));
  document.querySelectorAll('[data-go-dice]').forEach((b) => b.addEventListener('click', () => go('/dice')));
  bindNav();
}

/* ============ 通用片段 ============ */
function navBar(kind) {
  const items = kind === 'chef'
    ? [['/chef', '接单', 'bowl'], ['/chef/summary', '汇总', 'list'], ['/chef/dishes', '菜品', 'edit'], ['/chef/members', '成员', 'users'], ['/settings', '我的', 'settings']]
    : [['/menu', '菜单', 'bowl'], ['/orders', '点菜单', 'receipt'], ['/settings', '我的', 'settings']];
  const path = currentPath();
  return `<nav class="nav">${items.map(([href, label, ic]) => `
    <a href="#${href}" class="${path === href ? 'active' : ''}">${icon(ic, 21)}<span>${label}</span></a>
  `).join('')}</nav>`;
}

function bindNav() {
  // 导航靠 hash 链接，无需额外绑定
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function imgTag(src, cls = '', alt = '') {
  return `<img class="${cls}" src="${esc(src || 'assets/img/hero-table.jpg')}" alt="${esc(alt)}" loading="lazy" onerror="this.style.opacity='0'">`;
}

function pageTopbar({ back = false, title = '', right = '' }) {
  return `<header class="topbar">
    ${back ? `<button class="icon-btn" data-back aria-label="返回">${icon('back', 22)}</button>` : ''}
    <div class="title">${title}</div>
    ${right}
  </header>`;
}

function bindBack() {
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => history.length > 1 ? history.back() : go('/menu'));
  });
}

/* ============ C01 身份入口 ============ */
function pageJoin() {
  const cfg = readSupabaseConfig();
  const cloudReady = !!(cfg.url && cfg.key);
  const isCloud = state.mode === 'cloud';
  return `<div class="page no-nav">
    <div class="join-hero">
      ${imgTag('assets/img/hero-table.jpg', '', '家里的晚饭')}
      <div class="join-hero-text">
        <h1 class="brand">家宴</h1>
        <div class="brand-sub">今晚想吃什么，点好告诉厨房</div>
      </div>
    </div>
    <div class="join-panel">
      <div class="join-mode ${isCloud ? 'cloud' : ''}">
        <i></i>${isCloud ? '已连接 Supabase · 全家实时同步' : '体验模式 · 数据只保存在这台手机'}
      </div>
      <div class="join-title">先认识一下</div>
      <p class="join-desc">第一次打开填一次家庭码和昵称，以后直接进。</p>
      <form id="join-form" novalidate>
        <label class="field">
          <span class="label">你的昵称</span>
          <input class="input" name="nickname" id="join-name" placeholder="例如 妈妈" maxlength="12" autocomplete="off">
        </label>
        <label class="field">
          <span class="label">家庭码 <span class="hint">家庭群里发的 6 位码</span></span>
          <input class="input" name="code" id="join-code" placeholder="例如 HOME66" autocomplete="off" autocapitalize="characters" maxlength="12">
        </label>
        <div class="form-error" id="join-error"></div>
        <button class="btn" type="submit">进入家宴</button>
        <button class="btn ghost" type="button" id="join-register" style="margin-top:10px">一键开店 · 我是厨师</button>
        <p class="fineprint" style="margin-top:8px">没有家庭码？点「一键开店」直接给自己开一个厨房，进去后把家庭码发给家人。</p>
      </form>
      <div class="join-foot">
        <button class="link-btn" id="connect-cloud" style="margin-left:auto">${cloudReady ? '连接设置' : '连接 Supabase'}</button>
      </div>
      <p class="fineprint">${isCloud ? '点菜会实时出现在厨师手机上，厨师也能收到微信提醒（需配置推送）。' : '演示模式里已有妈妈、爸爸的点单，可以直接体验点菜和按菜汇总。'}</p>
    </div>
  </div>`;
}

function bindJoin() {
  // 角色选择已移除：用家庭码进来的都是点菜的家人，
  // 想当厨师走「一键开店 · 我是厨师」
  const role = 0;

  const showError = (msg) => {
    const el = document.getElementById('join-error');
    el.textContent = msg;
    el.classList.add('show');
  };

  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('join-code').value.trim();
    const nickname = document.getElementById('join-name').value.trim();
    if (!nickname) return showError('先填个昵称，厨师才知道是谁点的');
    if (!code) return showError('家庭码不能为空，演示模式可填 HOME66');

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '正在进门…';
    try {
      const session = await state.store.joinFamily({ code, nickname, role });
      state.session = session;
      localStorage.setItem('fm_mode', state.mode);
      state.cart = loadCart();
      state.cartNote = '';
      await refreshData(true);
      toast(`欢迎回家，${state.session.nickname}`, { type: 'success' });
      go(viewMode() === 'chef' ? '/chef' : '/menu');
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = '进入家宴';
    }
  });

  document.getElementById('join-register')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '正在开厨房…';
    try {
      const nickname = document.getElementById('join-name').value.trim() || '主厨';
      const familyName = `${nickname}家`;
      await state.store.createFamily({ name: familyName, nickname });
      state.session = state.store.getSession();
      state.cart = loadCart();
      state.cartNote = '';
      await refreshData(true);
      if (state.session) state.session.role = 1;
      localStorage.setItem('fm_mode', state.mode);
      haptic(12);
      toast(`已开好「${familyName}」，你是厨师`, { type: 'success', duration: 2500 });
      go('/chef');
    } catch (err) {
      showError(err.message || '创建家庭失败');
      btn.disabled = false;
      btn.textContent = '一键开店 · 我是厨师';
    }
  });

  document.getElementById('connect-cloud').addEventListener('click', openCloudConfig);
}

/* ============ C02 菜单首页 ============ */
function visibleDishes(cat) {
  const q = state.menuQuery.trim();
  // 搜索时跨所有分类找菜，不被当前分类标签限制
  const c = q ? '全部' : (cat === undefined ? state.menuCategory : cat);
  let list = state.dishes.filter((d) => d.status !== 'off');
  if (c !== '全部') list = list.filter((d) => d.category === c);
  if (q) {
    list = list.filter((d) => `${d.name}${d.intro}${d.category}`.toLowerCase().includes(q.toLowerCase()));
  }
  return list;
}

function cartQtyOf(dishId) {
  return state.cart.reduce((s, c) => s + (c.dishId === dishId ? c.servings : 0), 0);
}

function dishGridHtml(cat) {
  const list = visibleDishes(cat);
  if (!list.length) {
    return `<div class="empty">
      <div class="em-mark">${icon('search', 26)}</div>
      <h4>没有找到这道菜</h4>
      <p>换个关键词，或者让厨师上新一道</p>
    </div>`;
  }
  return `<div class="dish-grid">${list.map((d, i) => {
    const qty = cartQtyOf(d.id);
    const soldOut = d.status === 'sold_out';
    return `
    <a class="dish-card" href="#/dish/${encodeURIComponent(d.id)}" style="animation-delay:${Math.min(i, 8) * 35}ms">
      <div class="thumb">
        ${imgTag(d.mainImage)}
        ${soldOut ? '<div class="veil">今天售罄</div><span class="badge">售罄</span>' : ''}
        ${qty ? `<span class="in-cart">已点 ${qty} 份</span>` : ''}
        ${!soldOut ? `<button class="quick-add" data-quick-add="${esc(d.id)}" aria-label="加一份 ${esc(d.name)}">${icon('plus', 17)}</button>` : ''}
      </div>
      <h3>${esc(d.name)}</h3>
      <div class="meta">
        <span>${icon('clock', 12)}</span><span>${d.cookMinutes || 0} 分钟</span>
      </div>
    </a>`; }).join('')}</div>`;
}

/* 菜单主体：搜索时是单一筛选网格；平时是分类横滑页（每类一整页） */
function menuBodyHtml() {
  if (state.menuQuery.trim()) return dishGridHtml();
  const categories = ['全部', ...CATEGORIES];
  const activeIdx = Math.max(0, categories.indexOf(state.menuCategory));
  return `<div class="swipe-dots" id="menu-dots">${categories.map((c, i) => `<span class="dot${i === activeIdx ? ' active' : ''}"></span>`).join('')}</div>
  <div class="menu-swipe" id="menu-swipe">
    <div class="menu-swipe-track" id="menu-swipe-track">
      ${categories.map((c) => `<div class="menu-swipe-page">${dishGridHtml(c)}</div>`).join('')}
    </div>
  </div>`;
}

function cartBarHtml() {
  if (!state.cart.length) return '';
  const total = state.cart.reduce((s, i) => s + i.servings, 0);
  return `<div class="cart-bar">
    <div>
      <div class="c-count">已点 ${state.cart.length} 道菜</div>
      <div class="c-main">一共 <b>${total}</b> 份</div>
    </div>
    <a class="btn" href="#/orders">去提交</a>
  </div>`;
}

function pageMenu() {
  const s = state.session;
  const famName = state.currentFamily?.name || '未选择家庭';
  const categories = ['全部', ...CATEGORIES];
  return `<div class="page">
    ${pageTopbar({
      title: `<span style="font-weight:700;letter-spacing:.12em;color:var(--accent)">家宴</span> <span class="sub">${esc(famName)}</span>`,
      right: `<button class="icon-btn" data-go-settings aria-label="设置">${icon('settings', 21)}</button>`
    })}
    <div class="menu-head">
      <div class="menu-hey">${avatarCircle(s, 'sm')}<span>${greeting()}，${esc(s.nickname)}</span></div>
      <h1 class="menu-title">今天想吃什么？</h1>
      <button class="menu-fam" data-fam-pick>
        <span class="dot"></span>
        <span>正在给 <b>${esc(famName)}</b> 点菜</span>
        ${state.families.length > 1 ? `<span class="caret">${icon('chevron', 13)}</span>` : ''}
      </button>
    </div>
    ${reviewEntryHtml()}
    ${diceEntryHtml()}
    <div class="search ${state.menuQuery ? 'filled' : ''}" id="menu-search-wrap">
      <span class="s-icon">${icon('search', 18)}</span>
      <input class="input" id="menu-search" placeholder="搜菜名，比如 番茄" value="${esc(state.menuQuery)}" autocomplete="off">
      <button class="s-clear" id="menu-clear" aria-label="清空">${icon('close', 17)}</button>
    </div>
    <div class="chips" id="menu-chips">
      ${categories.map((c) => `<button class="chip ${state.menuCategory === c ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div id="menu-body">${menuBodyHtml()}</div>
    ${cartBarHtml()}
    ${navBar('family')}
  </div>`;
}

function bindMenu() {
  bindBack();
  document.querySelector('[data-go-settings]')?.addEventListener('click', () => go('/settings'));

  // 家人端切换家庭（只有属于多个家庭时才可点）
  document.querySelector('.menu-fam')?.addEventListener('click', () => {
    if (state.families.length > 1) openFamilyPicker({ allowCreate: false });
  });

  bindQuickAdd();
  bindMenuSwipe();

  // 分类标签：平时滑动翻页，搜索时只筛选静态网格
  document.querySelectorAll('#menu-chips .chip').forEach((b) => {
    b.addEventListener('click', () => {
      if (state.menuQuery.trim()) {
        state.menuCategory = b.dataset.cat;
        syncMenuChips();
        renderMenuBody();
      } else {
        menuSwipeGoTo(b.dataset.cat);
      }
    });
  });

  const input = document.getElementById('menu-search');
  input?.addEventListener('input', debounce(() => {
    state.menuQuery = input.value;
    document.getElementById('menu-search-wrap').classList.toggle('filled', !!input.value);
    renderMenuBody();
  }, 160));
  document.getElementById('menu-clear')?.addEventListener('click', () => {
    state.menuQuery = '';
    input.value = '';
    document.getElementById('menu-search-wrap').classList.remove('filled');
    renderMenuBody();
    input.focus();
  });
}

function syncMenuChips() {
  document.querySelectorAll('#menu-chips .chip').forEach((x) => {
    const on = x.dataset.cat === state.menuCategory;
    x.classList.toggle('active', on);
    // 让选中标签滚进可视区（block:nearest 避免页面纵向滚动）
    if (on) x.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

/* 菜单卡片快捷加菜：+1 份（无备注），不跳详情 */
function bindQuickAdd() {
  document.querySelectorAll('[data-quick-add]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dish = findDish(b.dataset.quickAdd);
      if (!dish) return;
      addToCart(dish, 1, '');
      haptic(8);
      beep('soft');
      toast(`已加 1 份 ${dish.name}`, { type: 'success', duration: 1400 });
      renderPreserveScroll();
    });
  });
}

/* 搜索/分类变化时重绘菜单主体，并按需重新挂滑动 */
function renderMenuBody() {
  const body = document.getElementById('menu-body');
  if (!body) return;
  body.innerHTML = menuBodyHtml();
  bindQuickAdd();
  bindMenuSwipe();
}

/* ============ 菜单分类横滑（触摸滑动 + PC 鼠标兼容） ============ */
const MENU_SWIPE_THRESHOLD = 40;   // 翻页阈值：拖动超过 40px 才翻页
const MENU_SWIPE_DAMPING = 0.35;   // 边界阻尼系数
const menuSwipe = {
  el: null, track: null, dots: null,
  width: 0, dragging: false, startX: 0, startY: 0, deltaX: 0, dir: null, lastDrag: 0
};

function menuSwipeCats() { return ['全部', ...CATEGORIES]; }

function menuSwipeIndex() {
  return Math.max(0, menuSwipeCats().indexOf(state.menuCategory));
}

/* 翻到指定分类；animate:false 用于初始化/搜索返回时无动画归位 */
function menuSwipeGoTo(cat, opts = {}) {
  const { track, dots, el } = menuSwipe;
  if (!track) return;
  const categories = menuSwipeCats();
  const i = Math.max(0, categories.indexOf(cat));
  state.menuCategory = categories[i];
  if (opts.animate === false) track.classList.add('dragging');
  track.style.transform = `translateX(${-i * menuSwipe.width}px)`;
  if (opts.animate === false) { void track.offsetWidth; track.classList.remove('dragging'); }
  // 各页高度不同：容器高度同步到当前页
  const page = track.children[i];
  if (el && page) el.style.height = page.offsetHeight + 'px';
  // 分页圆点选中态
  if (dots) [...dots.children].forEach((d, j) => d.classList.toggle('active', j === i));
  syncMenuChips();
}

function menuSwipePoint(e) {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}

function menuSwipeStart(e) {
  if (menuSwipe.dragging || !menuSwipe.track) return;
  menuSwipe.dragging = true;
  menuSwipe.dir = null;
  menuSwipe.deltaX = 0;
  const p = menuSwipePoint(e);
  menuSwipe.startX = p.x;
  menuSwipe.startY = p.y;
  menuSwipe.lastDrag = 0;
  menuSwipe.track.classList.add('dragging'); // 跟手：拖动中关过渡动画
}

function menuSwipeMove(e) {
  if (!menuSwipe.dragging || !menuSwipe.track) return;
  const p = menuSwipePoint(e);
  const dx = p.x - menuSwipe.startX;
  const dy = p.y - menuSwipe.startY;
  // 方向锁：横向位移更大才接管，纵向则放行页面滚动
  if (menuSwipe.dir === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    menuSwipe.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
  }
  if (menuSwipe.dir !== 'h') return;
  e.preventDefault(); // 阻止纵向滚动穿透（需 passive:false）
  menuSwipe.deltaX = dx;
  const i = menuSwipeIndex();
  const total = menuSwipeCats().length;
  let offset = dx;
  // 边界阻尼：第一页往右拉 / 最后一页往左拉，拉得动但翻不动
  if ((i === 0 && dx > 0) || (i === total - 1 && dx < 0)) offset = dx * MENU_SWIPE_DAMPING;
  menuSwipe.track.style.transform = `translateX(${-i * menuSwipe.width + offset}px)`;
}

function menuSwipeEnd() {
  if (!menuSwipe.dragging) return;
  menuSwipe.dragging = false;
  if (!menuSwipe.track) return;
  menuSwipe.track.classList.remove('dragging');
  const categories = menuSwipeCats();
  const i = menuSwipeIndex();
  if (menuSwipe.dir === 'h') {
    if (menuSwipe.deltaX < -MENU_SWIPE_THRESHOLD && i < categories.length - 1) {
      menuSwipeGoTo(categories[i + 1]);       // 左滑超阈值 → 下一分类
    } else if (menuSwipe.deltaX > MENU_SWIPE_THRESHOLD && i > 0) {
      menuSwipeGoTo(categories[i - 1]);       // 右滑超阈值 → 上一分类
    } else {
      menuSwipeGoTo(categories[i]);           // 未超阈值/边界 → 弹回
    }
  } else {
    menuSwipeGoTo(categories[i], { animate: false });
  }
  // 记录本次拖动距离，供 click 拦截器判断（在下一次 onStart 清零）
  menuSwipe.lastDrag = Math.abs(menuSwipe.deltaX);
  menuSwipe.deltaX = 0;
  menuSwipe.dir = null;
}

function bindMenuSwipe() {
  const wrap = document.getElementById('menu-swipe');
  const track = document.getElementById('menu-swipe-track');
  if (!wrap || !track) { menuSwipe.el = null; menuSwipe.track = null; return; }
  menuSwipe.el = wrap;
  menuSwipe.track = track;
  menuSwipe.dots = document.getElementById('menu-dots');
  menuSwipe.width = wrap.clientWidth;
  // 无动画归位到当前分类 + 同步高度/圆点/标签
  menuSwipeGoTo(state.menuCategory, { animate: false });

  wrap.addEventListener('touchstart', menuSwipeStart, { passive: true });
  wrap.addEventListener('touchmove', menuSwipeMove, { passive: false });
  wrap.addEventListener('touchend', menuSwipeEnd);
  wrap.addEventListener('touchcancel', menuSwipeEnd);

  // PC 鼠标拖拽兼容
  wrap.addEventListener('mousedown', (e) => {
    e.preventDefault();
    menuSwipeStart(e);
    const move = (ev) => menuSwipeMove(ev);
    const up = () => {
      menuSwipeEnd();
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // 翻页/拖动手势后抑制误点菜品卡片（>8px 即视为滑动）
  wrap.addEventListener('click', (e) => {
    if (menuSwipe.lastDrag > 8) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// 横竖屏切换/窗口缩放：重新量宽并无动画归位
window.addEventListener('resize', () => {
  if (!menuSwipe.el || !menuSwipe.el.isConnected) return;
  menuSwipe.width = menuSwipe.el.clientWidth;
  menuSwipeGoTo(state.menuCategory, { animate: false });
});

/* ============ 菜品详情 ============ */
function findDish(id) {
  return state.dishes.find((d) => d.id === id);
}

async function ensureDish(id) {
  if (state.detailCache.has(id)) return state.detailCache.get(id);
  if (!id) return null;
  const full = await state.store.getDish(id);
  if (full) state.detailCache.set(id, full);
  return full;
}

function skeletonDetail() {
  return `<div class="page no-nav">
    ${pageTopbar({ back: true, title: '' })}
    <div style="padding:0 18px"><div class="skeleton" style="aspect-ratio:4/3"></div>
    <div class="skeleton" style="height:30px;width:60%;margin-top:20px"></div>
    <div class="skeleton" style="height:16px;width:90%;margin-top:14px"></div></div>
  </div>`;
}

function pageDish(id) {
  const cached = state.detailCache.get(id);
  const dish = cached || findDish(id);
  if (!dish) {
    ensureDish(id).then((d) => { if (d) renderPreserveScroll(); });
    return skeletonDetail();
  }
  const soldOut = dish.status === 'sold_out';
  const mainIngredients = (dish.ingredients || []).slice(0, 4);
  return `<div class="page no-nav" style="padding-bottom:calc(96px + var(--safe-b))">
    <div class="detail-hero">
      ${imgTag(dish.mainImage, '', dish.name)}
      <div class="float-row">
        <button class="icon-btn on-image" data-back aria-label="返回">${icon('back', 22)}</button>
        <button class="icon-btn on-image" data-go-settings aria-label="设置">${icon('settings', 21)}</button>
      </div>
    </div>
    <div class="detail-body">
      <div class="detail-kicker"><span class="bar"></span>${esc(dish.category)}${soldOut ? ' · 今天售罄' : ''}</div>
      <h1 class="detail-title">${esc(dish.name)}</h1>
      <p class="detail-intro">${esc(dish.intro || '家里的味道，简单好吃。')}</p>
      <div class="facts">
        <div class="fact"><b>${dish.prepMinutes || 0}′</b><span>备料</span></div>
        <div class="fact"><b>${dish.cookMinutes || 0}′</b><span>烹饪</span></div>
        <div class="fact"><b>${esc(dish.difficulty || '易')}</b><span>难度</span></div>
        <div class="fact"><b>${dish.servings} 人</b><span>建议份量</span></div>
      </div>
      <div class="section-title">用到的食材
        <button data-full-recipe>完整做法 ${icon('chevron', 13)}</button>
      </div>
      <div>
        ${mainIngredients.length
          ? mainIngredients.map((x) => `<div class="ing-row"><span class="n">${esc(x.name)}${x.role === 'sub' ? '<span class="tag">辅料</span>' : ''}</span><span class="q">${esc(String(x.amount))}${esc(x.unit)}</span></div>`).join('')
          : '<p style="font-size:13px;color:var(--muted);padding:8px 0">这道菜还没有录入食材</p>'}
      </div>
      <div class="alert-line">${icon('users', 16)}<span>过敏原：<b>${esc(dish.allergens || '无')}</b>　·　建议 <b>${dish.servings}</b> 人份，人多可以点两份</span></div>
      <div style="height:26px"></div>
    </div>
    <div class="actionbar">
      <button class="btn ghost" data-full-recipe>看做法</button>
      <button class="btn wide" data-add-dish ${soldOut ? 'disabled' : ''}>${soldOut ? '今天售罄' : '点这个菜'}</button>
    </div>
  </div>`;
}

function bindDish(id) {
  bindBack();
  document.querySelector('[data-go-settings]')?.addEventListener('click', () => go('/settings'));
  document.querySelectorAll('[data-full-recipe]').forEach((b) => b.addEventListener('click', () => go(`/recipe/${id}`)));
  document.querySelector('[data-add-dish]')?.addEventListener('click', () => openAddSheet(id));
}

/* ============ C03 加入点菜单（底部面板） ============ */
async function openAddSheet(id) {
  const dish = await ensureDish(id);
  if (!dish) return;
  if (dish.status === 'sold_out') return toast('这道菜今天售罄了');

  let qty = 1;
  const picked = new Set();
  const quick = ['少辣', '不要香菜', '少油', '多放葱'];

  const { sheet, close } = openSheet({
    className: 'add-sheet',
    title: '点这个菜',
    body: `
      <div class="dish-line">
        ${imgTag(dish.mainImage)}
        <div>
          <div class="al-name">${esc(dish.name)}</div>
          <div class="al-meta">${esc(dish.category)} · 建议 ${dish.servings} 人份</div>
        </div>
      </div>
      <div class="qty-row">
        <span class="qr-label">要几份</span>
        <div class="stepper">
          <button data-minus aria-label="减少">${icon('minus', 16)}</button>
          <span class="val" data-qty>1</span>
          <button data-plus aria-label="增加">${icon('plus', 16)}</button>
        </div>
      </div>
      <div class="field" style="margin-top:10px">
        <span class="label">口味备注 <span class="hint">选填，厨师能看到</span></span>
        <textarea class="input" data-note placeholder="比如：少辣、不要香菜" maxlength="60"></textarea>
      </div>
      <div class="quick-notes">${quick.map((q) => `<button data-quick="${q}">${q}</button>`).join('')}</div>
    `,
    footer: `<button class="btn" data-confirm>加入点菜单</button>`
  });

  const qtyEl = sheet.querySelector('[data-qty]');
  const noteEl = sheet.querySelector('[data-note]');
  sheet.querySelector('[data-minus]').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; });
  sheet.querySelector('[data-plus]').addEventListener('click', () => { qty = Math.min(20, qty + 1); qtyEl.textContent = qty; });
  sheet.querySelectorAll('[data-quick]').forEach((b) => {
    b.addEventListener('click', () => {
      const q = b.dataset.quick;
      if (picked.has(q)) { picked.delete(q); b.classList.remove('on'); }
      else { picked.add(q); b.classList.add('on'); }
    });
  });
  sheet.querySelector('[data-confirm]').addEventListener('click', () => {
    const extra = noteEl.value.trim();
    const note = [...picked, extra].filter(Boolean).join('；').slice(0, 60);
    addToCart(dish, qty, note);
    close();
    haptic(10);
    beep('soft');
    toast(`已加入点菜单：${dish.name}×${qty}`, { type: 'success' });
  });
}

function addToCart(dish, servings, note) {
  const line = state.cart.find((c) => c.dishId === dish.id && c.note === note);
  if (line) line.servings = Math.min(20, line.servings + servings);
  else state.cart.push({ dishId: dish.id, name: dish.name, image: dish.mainImage, servings, note });
  saveCart();
}

/* ============ C04 做法详情 ============ */
function recipeBodyHtml(dish) {
  const main = (dish.ingredients || []).filter((x) => x.role !== 'sub');
  const sub = (dish.ingredients || []).filter((x) => x.role === 'sub');
  return `
    ${main.length ? `<div class="section-title">主料</div>${main.map(ingRow).join('')}` : ''}
    ${sub.length ? `<div class="section-title">辅料</div>${sub.map(ingRow).join('')}` : ''}
    ${(dish.seasonings || []).length ? `<div class="section-title">调料</div>${dish.seasonings.map((x) => `
      <div class="ing-row"><span class="n">${esc(x.name)}${x.brandNote ? `<span class="note">${esc(x.brandNote)}</span>` : ''}</span><span class="q">${esc(x.amountText)}</span></div>
    `).join('')}` : ''}
    <div class="section-title">步骤 <span>${(dish.steps || []).length} 步</span></div>
    <div class="steps">${(dish.steps || []).map((st, i) => `
      <div class="step">
        <div class="step-no">${i + 1}</div>
        <div class="step-body">
          <p>${esc(st.description)}</p>
          <div class="step-meta">
            ${st.heatTip ? `<span class="heat">${esc(st.heatTip)}</span>` : ''}
            ${st.needTimer && st.durationMinutes ? `<button class="timer-btn" data-timer="${st.durationMinutes}">${icon('timer', 13)}<span>${st.durationMinutes} 分钟</span></button>` : ''}
          </div>
        </div>
      </div>`).join('')}
    </div>`;
}

function ingRow(x) {
  return `<div class="ing-row"><span class="n">${esc(x.name)}${x.note ? `<span class="note">${esc(x.note)}</span>` : ''}</span><span class="q">${esc(String(x.amount))}${esc(x.unit)}</span></div>`;
}

function pageRecipe(id) {
  const dish = state.detailCache.get(id) || findDish(id);
  if (!dish) {
    ensureDish(id).then((d) => { if (d) renderPreserveScroll(); });
    return skeletonDetail();
  }
  return `<div class="page no-nav" style="padding-bottom:calc(96px + var(--safe-b))">
    ${pageTopbar({ back: true, title: `${dish.name} · 做法` })}
    <div style="padding:0 22px">
      <div class="detail-kicker"><span class="bar"></span>${esc(dish.category)} · ${esc(dish.difficulty)}</div>
      <h1 class="detail-title" style="font-size:24px">${esc(dish.name)}</h1>
      <div class="alert-line" style="margin-top:0">${icon('clock', 16)}<span>备料 ${dish.prepMinutes} 分钟，烹饪约 ${dish.cookMinutes} 分钟${dish.allergens !== '无' ? `　·　${esc(dish.allergens)}` : ''}</span></div>
      ${recipeBodyHtml(dish)}
      <div style="height:22px"></div>
    </div>
    <div class="actionbar">
      <button class="btn ghost" data-back-bottom>返回</button>
      <button class="btn wide" data-add-dish ${dish.status === 'sold_out' ? 'disabled' : ''}>${dish.status === 'sold_out' ? '今天售罄' : '点这个菜'}</button>
    </div>
  </div>`;
}

function bindRecipe(id) {
  bindBack();
  document.querySelector('[data-back-bottom]')?.addEventListener('click', () => history.length > 1 ? history.back() : go('/menu'));
  document.querySelector('[data-add-dish]')?.addEventListener('click', () => openAddSheet(id));
  bindTimers();
}

function bindTimers() {
  document.querySelectorAll('[data-timer]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    let remain = Number(btn.dataset.timer) * 60;
    let timer = null;
    const label = btn.querySelector('span');
    const paint = () => {
      const m = Math.floor(remain / 60);
      const s = remain % 60;
      label.textContent = `${m}:${String(s).padStart(2, '0')}`;
    };
    btn.addEventListener('click', () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        btn.classList.remove('running');
        remain = Number(btn.dataset.timer) * 60;
        paint();
        label.textContent = `${btn.dataset.timer} 分钟`;
        return;
      }
      btn.classList.add('running');
      paint();
      timer = setInterval(() => {
        if (!btn.isConnected) { clearInterval(timer); return; }
        remain -= 1;
        paint();
        if (remain <= 0) {
          clearInterval(timer);
          timer = null;
          btn.classList.remove('running');
          btn.classList.add('done');
          label.textContent = '时间到了';
          beep('new');
          haptic(30);
        }
      }, 1000);
    });
  });
}

/* ============ C05 我的点菜 ============ */
function cartItemHtml(line, idx) {
  return `<div class="cart-item" data-line="${idx}">
    ${imgTag(line.image)}
    <div class="ci-body">
      <div class="ci-top">
        <span class="ci-name">${esc(line.name)}</span>
        <button class="ci-del" data-del="${idx}" aria-label="删除">${icon('trash', 17)}</button>
      </div>
      ${line.note ? `<div class="ci-note">备注：${esc(line.note)}</div>` : ''}
      <div class="ci-row">
        <div class="stepper">
          <button data-dec="${idx}" aria-label="减少" ${line.servings <= 1 ? 'disabled' : ''}>${icon('minus', 15)}</button>
          <span class="val">${line.servings}</span>
          <button data-inc="${idx}" aria-label="增加">${icon('plus', 15)}</button>
        </div>
        <span style="font-size:12px;color:var(--muted)">一份一碟</span>
      </div>
    </div>
  </div>`;
}

function submittedHtml() {
  if (!state.orders.length) {
    return `<div class="empty">
      <div class="em-mark">${icon('receipt', 26)}</div>
      <h4>还没有提交过点菜</h4>
      <p>去菜单挑几道，点右下角提交给厨师</p>
    </div>`;
  }
  return state.orders.map((o) => {
    const meta = statusMeta(o.status);
    const cancelled = o.status === 'cancelled';
    return `<div class="order-card ${cancelled ? 'cancelled' : ''}">
      <div class="oc-head">
        <span class="oc-time">${fmtTime(o.createdAt)} 提交 ${o.userName ? `<span class="oc-user">· ${memberAvatar(o.userId, o.userName)}${esc(o.userName)}</span>` : ''}</span>
        <span class="status ${meta.cls}"><i></i>${meta.label}</span>
      </div>
      <div class="oc-items">
        ${o.items.map((it) => {
          const m = statusMeta(it.status);
          return `<div class="oc-item">
            <span class="oi-name">${esc(it.dishName)}${it.note ? `<span class="oi-note">备注：${esc(it.note)}</span>` : ''}</span>
            <span class="oi-qty">×${it.servings}</span>
            <span class="status ${m.cls}"><i></i>${m.label}</span>
          </div>`;
        }).join('')}
      </div>
      ${o.note ? `<div class="group-note" style="margin:0 0 10px">整单备注：${esc(o.note)}</div>` : ''}
      ${o.status === 'pending' && typeof state.store.cancelOrder === 'function' ? `<div class="oc-foot">
        <span class="oc-tip">厨师还没接单，可以撤回</span>
        <button class="btn ghost tiny" data-cancel-order="${esc(o.id)}">撤回这单</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function pageOrders() {
  const total = state.cart.reduce((s, i) => s + i.servings, 0);
  const famName = state.currentFamily?.name || '未选择家庭';
  if (!state.currentFamily) {
    return `<div class="page">
      ${pageTopbar({ title: '我的点菜' })}
      <div class="empty">
        <div class="em-mark">${icon('users', 26)}</div>
        <h4>还没有加入家庭</h4>
        <p>用家庭码加入，或先创建一个家庭</p>
      </div>
      <div class="submit-wrap">
        <button class="btn" data-join-fam>加入家庭</button>
      </div>
      ${navBar('family')}
    </div>`;
  }
  return `<div class="page">
    ${pageTopbar({ title: '我的点菜' })}
    <div class="orders-head">
      <h1 class="orders-title">${state.cart.length ? '还没提交的菜' : '点菜单'}</h1>
      <p class="orders-sub">${esc(famName)} · 提交后厨师会收到提醒，状态会实时更新</p>
    </div>
    ${reviewEntryHtml()}
    ${state.cart.length ? `
      <div class="cart-list">${state.cart.map(cartItemHtml).join('')}</div>
      <div class="order-note">
        <label class="field" style="margin-bottom:0">
          <span class="label">整单备注 <span class="hint">选填</span></span>
          <textarea class="input" id="order-note" placeholder="比如：六点半开饭，米饭晚点上" maxlength="120">${esc(state.cartNote || '')}</textarea>
        </label>
      </div>
      <div class="submit-wrap">
        <button class="btn" id="submit-order">提交给厨师 · 共 ${total} 份</button>
        <p class="submit-hint">提交后还能在下面看到每道菜的状态</p>
      </div>
    ` : ''}
    ${state.orders.length && state.cart.length ? '<div class="section-title" style="padding:0 20px;margin-bottom:10px">已提交</div>' : ''}
    <div class="submitted">${submittedHtml()}</div>
    ${navBar('family')}
  </div>`;
}

function bindOrders() {
  document.querySelector('[data-join-fam]')?.addEventListener('click', () => openJoinFamilySheet());
  document.querySelectorAll('[data-cancel-order]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '撤回这单',
      message: '撤回后厨师就看不到这单了，确定吗？',
      confirmText: '撤回',
      danger: true
    });
    if (!ok) return;
    try {
      await state.store.cancelOrder(b.dataset.cancelOrder);
      haptic(10);
      toast('已撤回', { type: 'success' });
      await refreshData(true);
      renderPreserveScroll();
    } catch (err) {
      toast(err.message || '撤回失败', { duration: 3600 });
      await refreshData(true);
      renderPreserveScroll();
    }
  }));
  document.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.inc);
    state.cart[i].servings = Math.min(20, state.cart[i].servings + 1);
    saveCart(); renderPreserveScroll();
  }));
  document.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.dec);
    state.cart[i].servings = Math.max(1, state.cart[i].servings - 1);
    saveCart(); renderPreserveScroll();
  }));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.del);
    const ok = await confirmSheet({ title: '移出点菜单', message: `确定不要「${state.cart[i].name}」了吗？`, confirmText: '移出', danger: true });
    if (ok) { state.cart.splice(i, 1); saveCart(); renderPreserveScroll(); }
  }));

  const note = document.getElementById('order-note');
  note?.addEventListener('input', () => { state.cartNote = note.value; });

  document.getElementById('submit-order')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '正在通知厨师…';
    try {
      await state.store.createOrder(state.cart, state.cartNote || '');
      state.cart = [];
      state.cartNote = '';
      saveCart();
      haptic(15);
      toast('已提交，厨师马上就能看到', { type: 'success' });
      await refreshData(true);
      render();
    } catch (err) {
      toast(err.message || '提交失败', { duration: 4000 });
      btn.disabled = false;
      btn.textContent = '重新提交';
    }
  });
}

/* ============ 好评 ============ */
const REVIEW_TAGS = ['太丰盛了', '味道绝了', '辛苦啦', '分量刚好', '下次还办'];

function ratingLabel(n) {
  return ['还没打分', '不太满意', '一般般', '还不错', '很好吃', '太绝了'][n] || '';
}

function starsText(n) {
  return '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
}

function reviewCardHtml(r, { compact = false } = {}) {
  const tags = (r.tags || []).map((t) => `<span class="rtag-mini">${esc(t)}</span>`).join('');
  return `<article class="review-card ${r.mine ? 'mine' : ''}">
    <div class="rc-head">
      ${memberAvatar(r.isAnonymous ? '' : r.userId, r.nickname)}
      <b>${esc(r.nickname)}${r.mine ? '<i>我</i>' : ''}</b>
      <span class="rc-stars">${starsText(r.rating)}</span>
      <span class="rc-time">${r.createdAt ? fmtTime(r.createdAt) : ''}</span>
    </div>
    ${tags ? `<div class="rc-tags">${tags}</div>` : ''}
    ${r.comment ? `<p class="rc-comment">${compact ? esc(r.comment) : `“${esc(r.comment)}”`}</p>` : ''}
  </article>`;
}

function reviewRankHtml(list, emptyText) {
  if (!list || !list.length) return `<p class="rr-empty">${emptyText}</p>`;
  return `<div class="review-rank">${list.map((x, i) => `
    <div class="rr-row">
      <span class="rr-no ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span>
      ${x.dishImage ? imgTag(x.dishImage, 'rr-thumb') : '<span class="rr-thumb ph">🍲</span>'}
      <span class="rr-name">${esc(x.dishName)}</span>
      <span class="rr-num">${x.likeCount || 0} 好评</span>
    </div>`).join('')}</div>`;
}

/* 菜单 / 点菜单页的好评入口（关席后才出现） */
function reviewEntryHtml() {
  const rc = state.reviewContext;
  if (state.session?.role === 1) return '';
  if (!rc?.isOpen || rc.myReview) return '';
  return `<button class="review-entry" data-go-review>
    <span class="re-flower">🌸</span>
    <span class="re-text"><b>这顿饭怎么样？</b><small>给厨师送个好评，只要一分钟</small></span>
    <span class="re-cta">去评价 ${icon('chevron', 15)}</span>
  </button>`;
}

/* ============ 摇骰子定洗碗人 ============ */
const DICE_RULES = [
  { key: 'max_lose', label: '最大的洗碗', emoji: '👆', hint: '点数最大的人今晚洗碗' },
  { key: 'min_lose', label: '最小的洗碗', emoji: '👇', hint: '点数最小的人今晚洗碗' }
];
const diceRuleOf = (key) => DICE_RULES.find((r) => r.key === key) || DICE_RULES[0];

// 3×3 点数网格：纯 CSS 画点，避免加载图片
const DICE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dicePips(value) {
  const on = DICE_PIPS[value] || [];
  return Array.from({ length: 9 }, (_, i) => `<i class="${on.includes(i) ? 'on' : ''}"></i>`).join('');
}
function diceFace(value, cls = '') {
  return `<span class="dice-face${cls ? ` ${cls}` : ''}">${dicePips(value)}</span>`;
}

function diceEntryHtml() {
  if (!state.diceLoaded) return '';
  const d = state.dice;
  const g = d?.game;
  let title = '谁洗碗？摇一摇';
  let sub = '全家摇一把，输的人今晚洗碗';
  let cta = '去开局';
  let art = '🎲';
  if (g?.status === 'joining') {
    sub = `${d.participantCount} 人已加入，等人齐了开始`;
    cta = g.myParticipant ? '去开始' : '去加入';
  } else if (g?.status === 'rolling') {
    art = '🎯';
    sub = g.myRolled
      ? `已摇 ${d.rolledCount}/${d.participantCount}，等其他人`
      : `还差 ${Math.max(0, d.participantCount - d.rolledCount)} 人，去摇一把`;
    cta = g.myRolled ? '去看看' : (g.myParticipant ? '去摇一摇' : '去围观');
  } else if (g?.status === 'revealed') {
    const loser = (d.rolls || []).find((r) => r.userId === g.loserId);
    title = '洗碗人已定';
    sub = `今晚 ${loser?.nickname || '有人'} 洗碗 · ${g.loserValue ?? ''} 点`;
    cta = '看结果';
    art = '🧼';
  }
  return `<button class="dice-entry" data-go-dice>
    <span class="de-dice">${art}</span>
    <span class="de-text"><b>${title}</b><small>${esc(sub)}</small></span>
    <span class="de-cta">${cta} ${icon('chevron', 15)}</span>
  </button>`;
}

function pageDice() {
  const d = state.dice;
  const g = d?.game;
  let body;
  if (!state.diceLoaded) {
    body = `<div class="dice-missing">
      <div class="dm-emoji">🎲</div>
      <p>摇骰子还没启用：请先在 Supabase SQL Editor 执行 <code>supabase/dice.sql</code>。</p>
    </div>`;
  } else if (!g) body = diceStartHtml();
  else if (g.status === 'joining') body = diceJoiningHtml(d, g);
  else if (g.status === 'rolling') body = diceRollingHtml(d, g);
  else body = diceResultHtml(d, g);

  return `<div class="page">
    ${pageTopbar({ back: true, title: '谁洗碗？摇一摇' })}
    <div class="dice-wrap">${body}</div>
    ${navBar('family')}
  </div>`;
}

function diceStartHtml() {
  return `<div class="dice-hero">
      <div class="dh-emoji">🎲</div>
      <h1>谁洗碗？摇一摇</h1>
      <p>全家一起摇，输的人今晚负责洗碗</p>
    </div>
    <div class="dice-rules">
      ${DICE_RULES.map((r) => `<button class="dice-rule ${state.diceRule === r.key ? 'active' : ''}" data-dice-rule="${r.key}">
        <span class="dr-emoji">${r.emoji}</span>
        <span class="dr-text"><b>${r.label}</b><small>${r.hint}</small></span>
        ${state.diceRule === r.key ? '<span class="dr-check">✓</span>' : ''}
      </button>`).join('')}
    </div>
    <button class="btn" data-dice-create ${state.diceRolling ? 'disabled' : ''}>开一局</button>
    <p class="fineprint">开局后把手机传给大家，家人点「我也来」加入，人齐了由开局者点「开始摇」。</p>`;
}

function diceJoiningHtml(d, g) {
  const rule = diceRuleOf(g.rule);
  const canStart = g.isCreator && d.participantCount >= 2;
  return `<div class="dice-head">
      <div class="dh-rule">${rule.emoji} ${rule.label}</div>
      <div class="dh-title">人齐了吗？</div>
      <div class="dh-sub">${d.participantCount} 人已加入，至少 2 人才能开始</div>
    </div>
    <div class="dice-players">
      ${d.participants.map((p) => `<div class="dice-player ${p.isMe ? 'me' : ''}">
        ${avatarCircle(p, 'sm')}
        <div class="dp-name">${esc(p.nickname || '家人')}${p.isMe ? '<small>我</small>' : ''}</div>
        ${g.createdBy === p.userId ? '<span class="dp-tag">开局</span>' : ''}
      </div>`).join('')}
    </div>
    <div class="dice-actions">
      ${g.myParticipant
        ? (g.isCreator ? '' : '<button class="btn ghost" data-dice-leave>退出这局</button>')
        : `<button class="btn" data-dice-join ${state.diceRolling ? 'disabled' : ''}>我也来</button>`}
      ${g.isCreator ? `<button class="btn" data-dice-start ${canStart && !state.diceRolling ? '' : 'disabled'}>开始摇</button>` : ''}
    </div>
    <p class="fineprint">${g.isCreator ? '家人还没到齐？等他们点「我也来」，中途开始后就不能再加人了。' : '等开局者点「开始摇」，之后每人只能摇一次。'}</p>`;
}

function diceRollingHtml(d, g) {
  const rule = diceRuleOf(g.rule);
  const me = d.participants.find((p) => p.isMe);
  const left = Math.max(0, d.participantCount - d.rolledCount);
  return `<div class="dice-head">
      <div class="dh-rule">${rule.emoji} ${rule.label}${g.round > 1 ? ` · 加时第 ${g.round} 轮` : ''}</div>
      <div class="dh-title">${left > 0 ? `摇一摇！还差 ${left} 人` : '都摇好了，等人揭晓'}</div>
      <div class="dh-sub">${d.rolledCount}/${d.participantCount} 人已摇 · 揭晓前谁都看不到点数</div>
      <div class="dice-count" data-dice-count></div>
    </div>
    ${me ? `<div class="my-dice">
      <span class="dice-face big ${g.myRolled ? 'locked' : ''}" id="my-dice-face">${g.myRolled ? '<span class="df-lock">🎲</span>' : dicePips('')}</span>
      ${g.myRolled
        ? '<div class="mdb-hint">已摇好，等其他人</div>'
        : `<button class="btn" data-dice-roll ${state.diceRolling ? 'disabled' : ''}>摇骰子</button>`}
    </div>` : '<p class="fineprint" style="text-align:center">你在局外，等他们摇完看结果吧。</p>'}
    <div class="dice-players">
      ${d.participants.map((p) => `<div class="dice-player ${p.isMe ? 'me' : ''} ${p.rolled ? 'rolled' : ''}">
        ${avatarCircle(p, 'sm')}
        <div class="dp-name">${esc(p.nickname || '家人')}${p.isMe ? '<small>我</small>' : ''}</div>
        <span class="dp-state">${p.rolled ? '🎲 已摇' : '○ 未摇'}</span>
      </div>`).join('')}
    </div>
    ${g.isCreator ? `<button class="btn ghost" data-dice-force ${left > 0 && !diceCountExpired(g) ? 'disabled' : ''}>强制揭晓（未摇者弃权）</button>` : ''}
    <p class="fineprint">${g.isCreator ? '60 秒还没摇完，可以强制揭晓；没摇的人这一轮算弃权。' : '等大家摇完，或者开局者强制揭晓。'}</p>`;
}

function diceCountExpired(g) {
  const t = g?.startedAt ? new Date(g.startedAt).getTime() : 0;
  return !!t && Date.now() - t > 60_000;
}

function diceResultHtml(d, g) {
  const rule = diceRuleOf(g.rule);
  const rolls = d.rolls || [];
  const loser = rolls.find((r) => r.userId === g.loserId);
  const animate = state.diceRevealId !== g.id;
  if (animate) state.diceRevealId = g.id;
  return `<div class="dice-result ${animate ? 'anim' : ''}">
    <div class="dr-title">揭晓！</div>
    <div class="dr-sub">${rule.emoji} ${rule.label}${g.round > 1 ? ` · 加时第 ${g.round} 轮` : ''}</div>
    <div class="dice-row">
      ${rolls.map((r, i) => `<div class="dice-cell ${r.userId === g.loserId ? 'loser' : ''}" style="--i:${i}">
        ${diceFace(r.value)}
        <div class="dc-name">${esc(r.nickname || '家人')}</div>
        <div class="dc-val">${r.value} 点</div>
      </div>`).join('')}
    </div>
    <div class="dice-loser-card">
      <div class="dlc-label">今晚洗碗</div>
      <div class="dlc-name">${esc(loser?.nickname || '…')} 🧼</div>
      <div class="dlc-sub">${rule.label === '最大的洗碗' ? '最大' : '最小'}的 ${g.loserValue ?? ''} 点</div>
    </div>
    <div class="dice-actions">
      <button class="btn" data-dice-again ${state.diceRolling ? 'disabled' : ''}>再来一局</button>
      <a class="btn ghost" href="#/menu">回菜单</a>
    </div>
    <p class="fineprint">愿赌服输，洗完了让家人给你点个好评。</p>
  </div>`;
}

/* 统一包一层：防重复点击 + 成功后重读骰子状态并刷新页面 */
async function diceAction(fn, successMsg) {
  if (state.diceRolling) return;
  state.diceRolling = true;
  try {
    await fn();
    await loadDice(true);
    if (successMsg) toast(successMsg, { type: 'success', duration: 1600 });
  } catch (err) {
    toast(err.message || '操作没成功，再试一次', { duration: 3200 });
  } finally {
    state.diceRolling = false;
    renderPreserveScroll();
  }
}

// 摇骰子：先本地翻滚 1.2s，再提交服务端点数（点数由数据库 random() 生成）
async function doMyRoll() {
  if (state.diceRolling) return;
  const g = state.dice?.game;
  if (!g) return;
  state.diceRolling = true;
  const face = document.getElementById('my-dice-face');
  const flicker = face ? setInterval(() => {
    face.innerHTML = dicePips(1 + Math.floor(Math.random() * 6));
  }, 80) : null;
  face?.classList.add('rolling');
  haptic(10);
  beep('soft');
  await new Promise((r) => setTimeout(r, 1200));
  clearInterval(flicker);
  try {
    await state.store.rollDice(g.id);
    haptic(20);
    await loadDice(true);
  } catch (err) {
    toast(err.message || '摇骰子没成功，再摇一次', { duration: 3000 });
  } finally {
    state.diceRolling = false;
    renderPreserveScroll();
  }
}

function startDiceCountdown() {
  const el = document.querySelector('[data-dice-count]');
  if (!el) return;
  const started = state.dice?.game?.startedAt;
  if (!started) { el.textContent = ''; return; }
  const deadline = new Date(started).getTime() + 60_000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el.textContent = left > 0 ? `60 秒倒计时 · 还剩 ${left}s` : '已经超时，可以强制揭晓了';
    el.classList.toggle('expired', left <= 0);
    if (left <= 0) document.querySelectorAll('[data-dice-force]').forEach((b) => b.removeAttribute('disabled'));
  };
  tick();
  state.diceTimer = setInterval(tick, 1000);
}

function bindDice() {
  bindBack();
  const g = state.dice?.game;

  document.querySelectorAll('[data-dice-rule]').forEach((b) => {
    b.addEventListener('click', () => {
      state.diceRule = b.dataset.diceRule;
      renderPreserveScroll();
    });
  });

  document.querySelector('[data-dice-create]')?.addEventListener('click', () => {
    state.diceRevealId = '';
    diceAction(() => state.store.createDiceGame(state.diceRule), '开局了，叫家人来加入');
  });

  document.querySelector('[data-dice-join]')?.addEventListener('click', () => {
    diceAction(() => state.store.joinDiceGame(g?.id), '已加入这局');
  });

  document.querySelector('[data-dice-leave]')?.addEventListener('click', () => {
    diceAction(() => state.store.leaveDiceGame(g?.id), '已退出');
  });

  document.querySelector('[data-dice-start]')?.addEventListener('click', () => {
    diceAction(() => state.store.startDiceGame(g?.id), '开始摇！');
  });

  document.querySelector('[data-dice-force]')?.addEventListener('click', () => {
    diceAction(async () => { await state.store.revealDice(g?.id); }, '已揭晓');
  });

  document.querySelector('[data-dice-again]')?.addEventListener('click', () => {
    state.diceRevealId = '';
    diceAction(() => state.store.createDiceGame(g?.rule || state.diceRule), '新的一局，来摇吧');
  });

  document.querySelector('[data-dice-roll]')?.addEventListener('click', doMyRoll);

  if (g?.status === 'rolling') startDiceCountdown();
}


function reviewDraft() {
  const rc = state.reviewContext;
  const key = `${state.currentFamily?.id || ''}:${rc?.sessionId || 'none'}`;
  if (!state.reviewDraft || state.reviewDraft.key !== key) {
    const mr = rc?.myReview || {};
    const fb = {};
    (rc?.myFeedback || []).forEach((f) => {
      fb[f.dishName] = { liked: !!f.liked, wantNext: !!f.wantNext };
    });
    state.reviewDraft = {
      key,
      rating: mr.rating || 0,
      tags: mr.tags || [],
      comment: mr.comment || '',
      anonymous: !!mr.isAnonymous,
      feedback: fb
    };
  }
  return state.reviewDraft;
}

function pageReview() {
  const rc = state.reviewContext;
  const editing = state.reviewEditing;
  const head = pageTopbar({ back: true, title: rc?.myReview && !editing ? '好评已送出' : '这顿饭怎么样？' });

  if (!rc) {
    return `<div class="page no-nav">
      ${head}
      <div class="empty">
        <div class="em-mark">${icon('users', 26)}</div>
        <h4>好评功能还没准备好</h4>
        <p>${state.mode === 'cloud' ? '请先在 Supabase SQL Editor 执行 supabase/review.sql' : '体验模式不支持好评，连接 Supabase 后可用'}</p>
      </div>
    </div>`;
  }

  if (rc.myReview && !editing) {
    return `<div class="page no-nav">
      ${head}
      ${reviewResultHtml(rc)}
    </div>`;
  }

  if (!rc.isOpen) {
    return `<div class="page no-nav">
      ${head}
      <div class="empty">
        <div class="em-mark">${icon('clock', 26)}</div>
        <h4>厨师还在忙</h4>
        <p>关席之后就能给这顿饭送好评啦<br>（当天第一单满 2 小时也会自动开放）</p>
      </div>
    </div>`;
  }

  return `<div class="page no-nav">
    ${head}
    ${reviewFormHtml(rc)}
  </div>`;
}

function reviewFormHtml(rc) {
  const d = reviewDraft();
  const dishes = rc.todayDishes || [];
  return `<div class="review-wrap">
    <div class="review-hero">
      <div class="rh-flower">🌸</div>
      <h1>这顿饭怎么样？</h1>
      <p>${esc(state.currentFamily?.name || '家宴')} · 今天 ${dishes.length} 道菜</p>
    </div>

    <div class="star-picker" id="review-stars">
      ${[1, 2, 3, 4, 5].map((n) => `<button class="rstar ${d.rating >= n ? 'on' : ''}" data-star="${n}" aria-label="${n} 星">${d.rating >= n ? '★' : '☆'}</button>`).join('')}
    </div>
    <p class="star-label">${ratingLabel(d.rating)}</p>

    <div class="review-tag-row" id="review-tags">
      ${REVIEW_TAGS.map((t) => `<button class="rtag ${d.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>

    <label class="field review-comment-field">
      <span class="label">夸夸厨师 <span class="hint">选填 · 最多 50 字</span></span>
      <textarea class="input" id="review-comment" maxlength="50" placeholder="比如：红烧肉太香了，辛苦啦！">${esc(d.comment)}</textarea>
      <span class="char-count" id="review-char">${d.comment.length}/50</span>
    </label>

    <label class="anon-row">
      <input type="checkbox" class="anon-check" id="review-anon" ${d.anonymous ? 'checked' : ''}>
      <span class="ar-text"><b>匿名送出</b><small>厨师看到的是「匿名家人」</small></span>
    </label>

    ${dishes.length ? `
      <div class="section-title" style="padding:0 0 10px">给每道菜一句好评</div>
      <div class="fb-list">
        ${dishes.map((x, i) => {
          const f = d.feedback[x.dishName] || {};
          return `<div class="fb-row">
            ${imgTag(x.dishImage, 'fb-thumb')}
            <div class="fb-main">
              <div class="fb-name">${esc(x.dishName)}</div>
              <div class="fb-sub">今天 ${x.servings} 份</div>
            </div>
            <div class="fb-actions">
              <button class="fb-btn ${f.liked ? 'on' : ''}" data-fb-like="${i}">❤ 好评</button>
              <button class="fb-btn ${f.wantNext ? 'on' : ''}" data-fb-next="${i}">☑ 下次还点</button>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

    <div class="submit-wrap" style="padding:22px 0 8px">
      <button class="btn" id="submit-review" ${d.rating ? '' : 'disabled'}>送出好评 🌸</button>
      <p class="submit-hint">送出后厨师会收到通知，之后也能回来修改</p>
    </div>
  </div>`;
}

function reviewResultHtml(rc) {
  const mr = rc.myReview || {};
  const reviews = rc.todayReviews || [];
  const tags = (mr.tags || []).map((t) => `<span class="rtag-mini">${esc(t)}</span>`).join('');
  return `<div class="review-wrap">
    <div class="review-hero done">
      <div class="rh-flower">🌸</div>
      <h1>好评已送到厨师手机上</h1>
      <p>谢谢你，让这顿饭被记住</p>
    </div>

    <div class="my-review">
      <div class="mr-stars">${starsText(mr.rating)}</div>
      ${tags ? `<div class="rc-tags">${tags}</div>` : ''}
      ${mr.comment ? `<p class="rc-comment">“${esc(mr.comment)}”</p>` : ''}
      ${mr.isAnonymous ? '<span class="mr-anon">匿名送出</span>' : ''}
    </div>

    <div class="section-title" style="padding:22px 0 10px">本桌 TOP3</div>
    ${reviewRankHtml(rc.sessionTop, '这桌还没人给单道菜点赞')}

    <div class="section-title" style="padding:22px 0 10px">家庭好评榜</div>
    ${reviewRankHtml(rc.familyTop, '家里还没有累计的好评')}

    <div class="section-title" style="padding:22px 0 10px">今天大家的好评 <span class="st-count">${reviews.length}</span></div>
    ${reviews.length ? reviews.map((r) => reviewCardHtml(r)).join('') : '<p class="rr-empty">你是第一个送好评的人</p>'}

    <div class="review-foot">
      <button class="btn ghost" id="edit-review">改一下我的好评</button>
      <button class="btn" data-go-menu>回菜单</button>
    </div>
  </div>`;
}

function bindReview() {
  bindBack();
  document.getElementById('edit-review')?.addEventListener('click', () => {
    state.reviewEditing = true;
    state.reviewDraft = null;
    renderPreserveScroll();
  });
  document.querySelectorAll('[data-go-menu]').forEach((b) => b.addEventListener('click', () => go('/menu')));

  const rc = state.reviewContext;
  const d = reviewDraft();
  if (!rc || !d || rc.myReview && !state.reviewEditing) return;

  document.querySelectorAll('#review-stars [data-star]').forEach((b) => b.addEventListener('click', () => {
    d.rating = Number(b.dataset.star);
    haptic(6);
    renderPreserveScroll();
  }));

  document.querySelectorAll('#review-tags .rtag').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tag;
    const i = d.tags.indexOf(t);
    if (i >= 0) d.tags.splice(i, 1);
    else d.tags.push(t);
    renderPreserveScroll();
  }));

  const comment = document.getElementById('review-comment');
  const counter = document.getElementById('review-char');
  comment?.addEventListener('input', () => {
    d.comment = comment.value.slice(0, 50);
    if (counter) counter.textContent = `${d.comment.length}/50`;
  });

  document.getElementById('review-anon')?.addEventListener('change', (e) => {
    d.anonymous = e.currentTarget.checked;
  });

  document.querySelectorAll('[data-fb-like]').forEach((b) => b.addEventListener('click', () => {
    const dish = (rc.todayDishes || [])[Number(b.dataset.fbLike)];
    if (!dish) return;
    const f = d.feedback[dish.dishName] || { liked: false, wantNext: false };
    f.liked = !f.liked;
    d.feedback[dish.dishName] = f;
    haptic(6);
    renderPreserveScroll();
  }));

  document.querySelectorAll('[data-fb-next]').forEach((b) => b.addEventListener('click', () => {
    const dish = (rc.todayDishes || [])[Number(b.dataset.fbNext)];
    if (!dish) return;
    const f = d.feedback[dish.dishName] || { liked: false, wantNext: false };
    f.wantNext = !f.wantNext;
    d.feedback[dish.dishName] = f;
    haptic(6);
    renderPreserveScroll();
  }));

  document.getElementById('submit-review')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!d.rating) return toast('先点星星打个分吧');
    const feedback = (rc.todayDishes || []).map((x) => {
      const f = d.feedback[x.dishName] || {};
      return {
        dishId: x.dishId || null,
        dishName: x.dishName,
        dishImage: x.dishImage || '',
        liked: !!f.liked,
        wantNext: !!f.wantNext
      };
    }).filter((f) => f.liked || f.wantNext);

    btn.disabled = true;
    btn.textContent = '正在送出…';
    try {
      await state.store.submitReview({
        rating: d.rating,
        tags: d.tags,
        comment: d.comment,
        isAnonymous: d.anonymous,
        feedback
      });
      haptic(15);
      beep('soft');
      toast('好评已送到厨师手机上 🌸', { type: 'success', duration: 2400 });
      state.reviewEditing = false;
      state.reviewDraft = null;
      await refreshData(true);
      render();
    } catch (err) {
      toast(err.message || '送出失败', { duration: 4000 });
      btn.disabled = false;
      btn.textContent = '送出好评 🌸';
    }
  });
}

/* ============ K01 接单看板 ============ */
function activeGroups() {
  const groups = new Map();
  state.orders.forEach((o) => {
    if (o.status === 'cancelled') return;
    o.items.forEach((it) => {
      if (it.status === 'done' || it.status === 'cancelled') return;
      if (!groups.has(it.dishId)) {
        groups.set(it.dishId, {
          dishId: it.dishId, name: it.dishName, image: it.dishImage,
          servings: 0, users: [], notes: [], createdAt: o.createdAt, status: it.status
        });
      }
      const g = groups.get(it.dishId);
      g.servings += it.servings;
      g.users.push({ name: o.userName, servings: it.servings, userId: o.userId });
      if (it.note) g.notes.push(`${o.userName}：${it.note}`);
      if (it.status === 'cooking') g.status = 'cooking';
      if (new Date(o.createdAt) < new Date(g.createdAt)) g.createdAt = o.createdAt;
    });
  });
  return [...groups.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function doneGroups() {
  const groups = new Map();
  state.orders.forEach((o) => {
    o.items.forEach((it) => {
      if (it.status !== 'done') return;
      if (!groups.has(it.dishId)) groups.set(it.dishId, { dishId: it.dishId, name: it.dishName, image: it.dishImage, servings: 0, users: [] });
      const g = groups.get(it.dishId);
      g.servings += it.servings;
      g.users.push({ name: o.userName, servings: it.servings, userId: o.userId });
    });
  });
  return [...groups.values()];
}

function groupCardHtml(g, done) {
  const sources = {};
  g.users.forEach((u) => {
    const key = u.userId || u.name;
    if (!sources[key]) sources[key] = { name: u.name, userId: u.userId, servings: 0 };
    sources[key].servings += u.servings;
  });
  const srcText = Object.values(sources)
    .map((u) => `<span class="src-user">${memberAvatar(u.userId, u.name)}${esc(u.name)} ${u.servings} 份</span>`)
    .join('<span class="src-sep">·</span>');
  const isCooking = g.status === 'cooking';
  return `<article class="group ${done ? 'done' : ''}" data-dish="${esc(g.dishId)}">
    <div class="group-head">
      ${imgTag(g.image, 'group-thumb')}
      <div class="group-main">
        <div class="group-name">${esc(g.name)}</div>
        <div class="group-src">${srcText}</div>
      </div>
      <div class="group-qty">×${g.servings}<small>份</small></div>
    </div>
    ${g.notes?.length ? `<div class="group-note">${g.notes.map((n) => `<b>${esc(n)}</b>`).join('<br>')}</div>` : ''}
    ${done ? '' : `<div class="group-actions">
      <button class="btn ghost small" data-view-recipe>${icon('list', 15)} 看做法</button>
      ${isCooking
        ? `<button class="btn green small" data-finish>${icon('check', 15)} 做好啦</button>`
        : `<button class="btn small" data-accept>${icon('flame', 15)} 接单开始做</button>`}
    </div>`}
  </article>`;
}

function mealStateHtml() {
  if (!state.store.closeMealSession || !state.reviewContext) return '';
  const rc = state.reviewContext;
  const closed = rc?.sessionStatus === 'closed';
  const count = rc?.todayReviewCount || 0;
  if (closed) {
    return `<div class="meal-bar closed">
      <span class="mb-text">🌸 今天已关席，家人可以送好评了${count ? ` · 已收到 ${count} 条` : ''}</span>
      <button class="btn tiny ghost" data-reopen-meal>重新开席</button>
    </div>`;
  }
  return `<div class="meal-bar">
    <span class="mb-text">还在上菜？上齐后关席，家人就能送好评</span>
    <button class="btn tiny" data-close-meal>上菜完毕</button>
  </div>`;
}

function pageChefBoard() {
  const active = activeGroups();
  const done = doneGroups();
  const pendingCount = active.reduce((s, g) => s + g.servings, 0);
  const curFam = state.currentFamily;
  const famSwitch = state.families.length > 1;

  return `<div class="page">
    ${pageTopbar({
      title: `<span style="font-weight:600">接单台</span> <span class="sub">${esc(state.session?.nickname || '主厨')}掌勺</span>`,
      right: `<button class="icon-btn" data-refresh aria-label="刷新">${icon('refresh', 20)}</button>`
    })}
    <div class="chef-head">
      <div class="ch-left">
        <div class="chef-date">${fmtDate(new Date().toISOString())}</div>
        ${curFam ? `<button class="fam-picker" data-fam-pick>
          <span class="fam-name">${esc(curFam.name)}</span>
          ${famSwitch ? `<span class="fam-caret">${icon('chevron', 14)}</span>` : ''}
        </button>` : '<div class="fam-picker fam-empty">未选择家庭</div>'}
        <h1 class="chef-title">${active.length} 道菜等你 · <span class="n">${pendingCount}</span> 份</h1>
        <div class="live-dot"><i></i>${state.mode === 'cloud' ? '实时连接中' : '演示模式'}</div>
      </div>
    </div>
    ${mealStateHtml()}
    <div class="chef-switch">
      <div class="seg" id="chef-tabs">
        <button data-tab="active" class="${state.chefTab === 'active' ? 'active' : ''}">待做 ${active.length}</button>
        <button data-tab="done" class="${state.chefTab === 'done' ? 'active' : ''}">已完成 ${done.length}</button>
      </div>
    </div>
    <div id="chef-list">
      ${state.chefTab === 'active'
        ? (active.length ? active.map((g) => groupCardHtml(g, false)).join('')
          : `<div class="empty"><div class="em-mark">${icon('check', 26)}</div><h4>${curFam ? curFam.name + ' 暂时没有待做的菜' : '还没选家庭'}</h4><p>${curFam ? '家人点了菜会实时出现在这里' : '先加入或创建一个家庭'}</p></div>`)
        : (done.length ? done.map((g) => groupCardHtml(g, true)).join('')
          : `<div class="empty"><div class="em-mark">${icon('bowl', 26)}</div><h4>${curFam ? curFam.name + ' 今天还没做好的菜' : '还没选家庭'}</h4><p>做完一道就点「做好啦」</p></div>`)}
    </div>
    ${navBar('chef')}
  </div>`;
}

function bindChefBoard() {
  document.querySelector('[data-refresh]')?.addEventListener('click', async () => {
    await refreshData();
    renderPreserveScroll();
    toast('已刷新', { duration: 1200 });
  });
  document.querySelectorAll('#chef-tabs button').forEach((b) => b.addEventListener('click', () => {
    state.chefTab = b.dataset.tab;
    renderPreserveScroll();
  }));

  // 家庭切换器
  document.querySelector('[data-fam-pick]')?.addEventListener('click', openFamilyPicker);

  // 关席 / 重新开席（好评开关）
  document.querySelector('[data-close-meal]')?.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '上菜完毕，关席',
      message: '关席后家人就能给这顿饭送好评，也会收到你的好评推送。',
      confirmText: '关席'
    });
    if (!ok) return;
    try {
      await state.store.closeMealSession();
      haptic(12);
      toast('已关席，家人可以送好评了 🌸', { type: 'success', duration: 2000 });
      await refreshData(true);
      renderPreserveScroll();
    } catch (err) { toast(err.message || '关席失败', { duration: 4000 }); }
  });
  document.querySelector('[data-reopen-meal]')?.addEventListener('click', async () => {
    try {
      await state.store.reopenMealSession();
      toast('已重新开席，好评暂时关闭', { duration: 1800 });
      await refreshData(true);
      renderPreserveScroll();
    } catch (err) { toast(err.message || '操作失败', { duration: 4000 }); }
  });

  document.querySelectorAll('.group').forEach((card) => {
    const dishId = card.dataset.dish;
    card.querySelector('[data-view-recipe]')?.addEventListener('click', () => openRecipeSheet(dishId));
    card.querySelector('[data-accept]')?.addEventListener('click', () => changeDishStatus(dishId, 'cooking'));
    card.querySelector('[data-finish]')?.addEventListener('click', () => changeDishStatus(dishId, 'done'));
  });
}

/* ============ 厨师端 · 房间成员 ============ */
// 本餐点菜统计：按 userId 聚合今天的有效明细
function roomOrderStats() {
  const map = new Map();
  state.orders.forEach((o) => {
    if (!o.userId || o.status === 'cancelled' || !isToday(o.createdAt)) return;
    o.items.forEach((i) => {
      if (i.status === 'cancelled') return;
      const cur = map.get(o.userId) || { count: 0, servings: 0, items: [] };
      cur.count += 1;
      cur.servings += i.servings;
      cur.items.push(i);
      map.set(o.userId, cur);
    });
  });
  return map;
}

const memberName = (m) => m.alias || m.nickname;

function memberCardHtml(m, online, stats) {
  const isMe = m.userId === state.session?.userId;
  const count = stats?.count || 0;
  const name = memberName(m);
  return `<button class="mem-card ${online ? 'online' : 'offline'} ${m.isAbsent ? 'absent' : ''}" data-member="${esc(m.userId)}">
    <div class="mem-card-top">
      ${avatarCircle({ avatar: m.avatar, nickname: m.nickname }, 'sm')}
      <div class="mem-id">
        <div class="mem-name">${esc(name)}${m.role === 1 ? '<span class="mem-badge chef">厨师</span>' : ''}${isMe ? '<span class="mem-badge me">我</span>' : ''}</div>
        <div class="mem-role">${m.alias ? `原名 ${esc(m.nickname)}` : (m.role === 1 ? '掌勺人' : '家人')}${m.isAbsent ? ' · 已缺席' : ''}</div>
      </div>
      <span class="mem-dot" data-online="${online ? 1 : 0}"></span>
    </div>
    <div class="mem-card-foot">
      <span class="mem-dish ${count ? '' : 'none'}">${count ? `已点 ${count} 道` : '还没点'}</span>
      <span class="mem-time">${m.lastSeenAt ? timeAgo(m.lastSeenAt) : '—'}</span>
    </div>
  </button>`;
}

function pageChefMembers() {
  const members = state.members || [];
  const online = state.presenceIds || new Set();
  const stats = roomOrderStats();
  const active = members.filter((m) => m.status !== 'archived');
  const history = members.filter((m) => m.status === 'archived');
  const present = active.filter((m) => online.has(m.userId));
  const ordered = active.filter((m) => (stats.get(m.userId)?.count || 0) > 0);
  const notOrdered = active.filter((m) => m.role !== 1 && !m.isAbsent && !(stats.get(m.userId)?.count));
  const notOrderedOnline = notOrdered.filter((m) => online.has(m.userId));
  const totalDishes = [...stats.values()].reduce((n, x) => n + x.count, 0);
  const avg = ordered.length ? (totalDishes / ordered.length).toFixed(1) : '0';
  const top = active
    .map((m) => ({ name: memberName(m), count: stats.get(m.userId)?.count || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const nameCount = new Map();
  active.forEach((m) => nameCount.set(memberName(m), (nameCount.get(memberName(m)) || 0) + 1));
  const hasDup = [...nameCount.values()].some((n) => n > 1);
  const rows = active.slice().sort((a, b) => {
    const d = (online.has(b.userId) ? 1 : 0) - (online.has(a.userId) ? 1 : 0);
    if (d) return d;
    return new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0);
  });

  const body = !state.membersLoaded
    ? `<div class="empty mem-empty">
        <div class="em-mark">${icon('users', 26)}</div>
        <h4>成员数据还没就绪</h4>
        <p>在 Supabase SQL Editor 执行 <b>supabase/members.sql</b>，刷新后就能看到全部家人。</p>
      </div>`
    : `<div class="mem-overview">
        <div class="mem-stats">
          <div class="ms-item"><b>${present.length}</b><span>在场</span></div>
          <div class="ms-item"><b>${ordered.length}</b><span>已点菜</span></div>
          <div class="ms-item"><b>${history.length}</b><span>历史成员</span></div>
        </div>
        <div class="mem-total">本餐 ${ordered.length} 人参与 · 共点 ${totalDishes} 道 · 人均 ${avg} 道</div>
        ${top ? `<div class="mem-topline">最积极：<b>${esc(top.name)}</b>（${top.count} 道）</div>` : ''}
        ${notOrdered.length ? `<div class="mem-waiting">还没点：${notOrdered.map((m) => esc(memberName(m))).join('、')}</div>` : ''}
        ${hasDup ? `<div class="mem-dup">有重名成员，点卡片改个备注就能区分</div>` : ''}
        ${notOrderedOnline.length ? `<button class="btn mem-nudge-btn" id="mem-nudge">🔔 催一下还没点的 ${notOrderedOnline.length} 人</button>` : ''}
      </div>
      <div class="mem-section-title">在场成员 <span>${active.length}</span></div>
      ${rows.length
        ? `<div class="mem-grid">${rows.map((m) => memberCardHtml(m, online.has(m.userId), stats.get(m.userId))).join('')}</div>`
        : `<div class="empty"><div class="em-mark">${icon('users', 26)}</div><h4>这个家庭还没有成员</h4><p>把家庭码发给家人，进来就会出现在这里</p></div>`}
      ${history.length ? `<details class="mem-history">
        <summary>📚 历史成员（${history.length}）</summary>
        ${history.map((m) => `<div class="mem-hist-row">
          ${avatarCircle({ avatar: m.avatar, nickname: m.nickname }, 'sm')}
          <div class="mh-main">
            <div class="mh-name">${esc(memberName(m))}</div>
            <div class="mh-sub">${m.lastSeenAt ? `${timeAgo(m.lastSeenAt)}活跃` : '很久没来'}</div>
          </div>
          <button class="btn ghost mh-restore" data-restore="${esc(m.userId)}">恢复到在场</button>
        </div>`).join('')}
      </details>` : ''}`;

  return `<div class="page">
    ${pageTopbar({
      title: '房间成员',
      right: `<button class="icon-btn" data-refresh-members aria-label="刷新">${icon('refresh', 20)}</button>`
    })}
    ${body}
    ${navBar('chef')}
  </div>`;
}

function openAliasSheet(m) {
  const { close } = openSheet({
    title: '改备注',
    sub: `只对厨师可见，原名 ${m.nickname}`,
    body: `<label class="field"><span class="label">备注名</span>
      <input class="input" id="member-alias" maxlength="12" value="${esc(m.alias || '')}" placeholder="例如：二姨">
    </label>`,
    footer: `<button class="btn ghost" data-sheet-close>取消</button><button class="btn" id="save-alias">保存</button>`
  });
  document.getElementById('save-alias')?.addEventListener('click', async () => {
    const v = document.getElementById('member-alias')?.value.trim() || '';
    try {
      await state.store.setMemberAlias(m.userId, v);
      close();
      await loadMembers(true);
      renderPreserveScroll();
      toast('备注已更新', { type: 'success', duration: 1500 });
    } catch (err) { toast(err.message || '改备注失败', { duration: 3000 }); }
  });
}

function openMemberSheet(m) {
  if (!m) return;
  const stats = roomOrderStats().get(m.userId);
  const items = stats?.items || [];
  const online = state.presenceIds.has(m.userId);
  const isMe = m.userId === state.session?.userId;
  const name = memberName(m);
  const { sheet, close } = openSheet({
    title: name,
    sub: `${m.role === 1 ? '厨师' : '家人'} · ${online ? '在线' : '离线'}${m.isAbsent ? ' · 已缺席' : ''}`,
    body: `<div class="mem-sheet-user">
        ${avatarCircle({ avatar: m.avatar, nickname: m.nickname }, 'sm')}
        <div><div class="msu-name">${esc(m.nickname)}</div><div class="msu-sub">${m.alias ? `备注：${esc(m.alias)}` : '本餐点菜明细'}</div></div>
      </div>
      <div class="mem-order-box">
        <div class="mob-title">本餐点菜</div>
        ${items.length
          ? `<ul class="mob-list">${items.map((i) => `<li><span>${esc(i.dishName)}</span><b>×${i.servings}</b></li>`).join('')}</ul>`
          : `<p class="mob-none">还没点菜${online ? '，可以催一下' : '（现在不在线）'}</p>`}
      </div>
      <div class="mem-actions">
        <button class="mem-act" data-act="alias">✏ 改备注${m.alias ? `（${esc(m.alias)}）` : ''}</button>
        ${m.role === 1 ? '' : `<button class="mem-act" data-act="absent">${m.isAbsent ? '✅ 恢复出席' : '🚫 标记缺席'}</button>`}
        ${isMe ? '' : `<button class="mem-act danger" data-act="archive">📦 归档到历史</button>`}
        ${isMe || m.role === 1 ? '' : `<button class="mem-act danger" data-act="remove">🚪 移除成员</button>`}
      </div>`,
    footer: `<button class="btn ghost" data-sheet-close>关闭</button>`
  });

  sheet.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    const act = btn.dataset.act;
    if (act === 'alias') {
      close();
      openAliasSheet(m);
      return;
    }
    if (act === 'archive') {
      close();
      const ok = await confirmSheet({
        title: '归档成员',
        message: `把 ${name} 放进历史成员？点菜记录会完整保留，之后还能恢复。`,
        confirmText: '归档'
      });
      if (!ok) return;
    }
    if (act === 'remove') {
      close();
      const ok = await confirmSheet({
        title: '移除成员',
        message: `把 ${name} 从家庭里移除？对方需要家庭码重新加入才能继续点菜，已提交的点菜记录会保留。`,
        confirmText: '移除'
      });
      if (!ok) return;
    }
    try {
      if (act === 'absent') await state.store.setMemberAbsent(m.userId, !m.isAbsent);
      if (act === 'archive') await state.store.setMemberStatus(m.userId, 'archived');
      if (act === 'remove') await state.store.removeMember(m.userId);
      close();
      await loadMembers(true);
      renderPreserveScroll();
      const done = act === 'absent'
        ? (m.isAbsent ? '已恢复出席' : '已标记缺席')
        : (act === 'remove' ? '已移除成员' : '已归档');
      toast(done, { type: 'success', duration: 1500 });
    } catch (err) { toast(err.message || '操作失败', { duration: 3000 }); }
  }));
}

function bindChefMembers() {
  document.querySelector('[data-refresh-members]')?.addEventListener('click', async () => {
    await loadMembers(false);
    renderPreserveScroll();
    toast('已刷新', { duration: 1200 });
  });

  document.querySelectorAll('[data-member]').forEach((card) => {
    card.addEventListener('click', () => {
      openMemberSheet((state.members || []).find((m) => m.userId === card.dataset.member));
    });
  });

  document.getElementById('mem-nudge')?.addEventListener('click', async () => {
    const stats = roomOrderStats();
    const targets = (state.members || []).filter((m) => m.status !== 'archived'
      && m.role !== 1
      && !m.isAbsent
      && state.presenceIds.has(m.userId)
      && !(stats.get(m.userId)?.count));
    if (!targets.length) return toast('现在没有在线的待点菜家人');
    const n = await state.store.nudgeMembers?.(targets.map((m) => m.userId)) || 0;
    toast(n ? `已提醒 ${n} 位在线的家人 👋` : '提醒没发出去，稍后再试', {
      type: n ? 'success' : undefined,
      duration: 2200
    });
  });

  document.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await state.store.setMemberStatus(b.dataset.restore, 'active');
      await loadMembers(true);
      renderPreserveScroll();
      toast('已恢复到在场', { type: 'success', duration: 1500 });
    } catch (err) { toast(err.message || '操作失败', { duration: 3000 }); }
  }));
}

/* 家庭切换弹层 */
function openFamilyPicker({ allowCreate = true, allowJoin = true } = {}) {
  const curId = state.session?.currentFamilyId;
  const list = state.families;
  const body = `
    <ul class="fam-list">
      ${list.map((f) => {
        const isCur = f.familyId === curId;
        const roleLabel = f.role === 1 ? '厨师' : '家人';
        return `<li class="fam-item ${isCur ? 'active' : ''}" data-fam="${esc(f.familyId)}">
          <div class="fam-itm-left">
            <div class="fam-itm-name">${esc(f.family?.name || f.familyName || '未知家庭')}</div>
            <div class="fam-itm-sub">家庭码 ${esc(f.joinCode || '')} · ${roleLabel}</div>
          </div>
          <div class="fam-itm-check">${isCur ? icon('check', 20) : ''}</div>
        </li>`;
      }).join('')}
      ${allowCreate && list.length < 5 ? `<li class="fam-item fam-create" data-fam-new>${icon('plus', 18)} 创建新家庭</li>` : ''}
      ${allowJoin ? `<li class="fam-item fam-join" data-fam-join>${icon('key', 18)} 加入其他家庭</li>` : ''}
    </ul>
  `;
  const { sheet } = openSheet({
    title: '切换家庭',
    sub: `你是 ${state.session?.nickname || '主厨'} · 共 ${list.length} 个家庭`,
    body
  });
  sheet.querySelectorAll('[data-fam]').forEach((li) => li.addEventListener('click', async () => {
    const fid = li.dataset.fam;
    if (fid === curId) { sheet.parentElement.querySelector('.sheet-backdrop')?.click(); return; }
    try {
      await state.store.switchFamily(fid);
      localStorage.removeItem('fm_view_mode');   // 换家庭后回到该家庭的默认视角
      state.cart = loadCart();          // 每个家庭各自一份点菜单
      state.cartNote = '';
      await refreshData(true);
      haptic(10);
      beep('soft');
      toast(`已切换到 ${state.currentFamily?.name || '新家庭'}`, { type: 'success', duration: 1600 });
      sheet.parentElement.querySelector('.sheet-backdrop')?.click();
      renderPreserveScroll();
    } catch (err) { toast(err.message, { duration: 4000 }); }
  }));
  sheet.querySelector('[data-fam-new]')?.addEventListener('click', () => {
    sheet.parentElement.querySelector('.sheet-backdrop')?.click();
    openCreateFamilySheet();
  });
  sheet.querySelector('[data-fam-join]')?.addEventListener('click', () => {
    sheet.parentElement.querySelector('.sheet-backdrop')?.click();
    openJoinFamilySheet();
  });
}

/* 创建家庭弹层（厨师用） */
function openCreateFamilySheet() {
  const { sheet } = openSheet({
    title: '创建家庭',
    sub: '创建后自动成为该家庭的厨师',
    body: `
      <div class="form-row"><label>家庭名</label><input id="cf-name" maxlength="16" placeholder="如 张阿姨家"></div>
      <p class="hint">创建后会生成一个家庭码，发给家人用码加入即可点菜。</p>
    `,
    footer: `<button class="btn ghost" data-cancel>取消</button><button class="btn" data-ok>创建</button>`
  });
  sheet.querySelector('[data-cancel]')?.addEventListener('click', () => sheet.parentElement.querySelector('.sheet-backdrop')?.click());
  sheet.querySelector('[data-ok]')?.addEventListener('click', async () => {
    const name = sheet.querySelector('#cf-name').value.trim();
    if (!name) return toast('填个家庭名');
    sheet.querySelector('[data-ok]').disabled = true;
    try {
      await state.store.createFamily({ name, nickname: state.session?.nickname });
      localStorage.removeItem('fm_view_mode');
      state.cart = loadCart();
      state.cartNote = '';
      await refreshData(true);
      haptic(10);
      toast('创建成功，已切换到新家庭', { type: 'success', duration: 1800 });
      sheet.parentElement.querySelector('.sheet-backdrop')?.click();
      renderPreserveScroll();
    } catch (err) { toast(err.message || '创建失败', { duration: 4000 }); sheet.querySelector('[data-ok]').disabled = false; }
  });
}

/* 加入家庭弹层 */
function openJoinFamilySheet() {
  // 身份选择只对厨师开放：客人用家庭码加入，一律是家人，不能借加入变成厨师
  const isChef = state.session?.role === 1;
  const { sheet } = openSheet({
    title: '加入家庭',
    sub: '用家庭码加入',
    body: `
      <div class="form-row"><label>家庭码</label><input id="jf-code" maxlength="12" placeholder="如 HOME77" style="text-transform:uppercase"></div>
      <div class="form-row"><label>你的昵称</label><input id="jf-nick" maxlength="12" placeholder="如 张阿姨"></div>
      ${isChef ? `<div class="form-row form-row-inline">
        <label class="radio"><input type="radio" name="jf-role" value="0" checked><span>我是家人</span></label>
        <label class="radio"><input type="radio" name="jf-role" value="1"><span>我是厨师</span></label>
      </div>` : ''}
    `,
    footer: `<button class="btn ghost" data-cancel>取消</button><button class="btn" data-ok>加入</button>`
  });
  sheet.querySelector('[data-cancel]')?.addEventListener('click', () => sheet.parentElement.querySelector('.sheet-backdrop')?.click());
  sheet.querySelector('[data-ok]')?.addEventListener('click', async () => {
    const code = sheet.querySelector('#jf-code').value.trim().toUpperCase();
    const nick = sheet.querySelector('#jf-nick').value.trim();
    const role = isChef ? Number(sheet.querySelector('input[name="jf-role"]:checked')?.value || 0) : 0;
    if (!code) return toast('填家庭码');
    if (!nick) return toast('填昵称');
    sheet.querySelector('[data-ok]').disabled = true;
    try {
      await state.store.joinFamily({ code, nickname: nick, role });
      localStorage.removeItem('fm_view_mode');
      state.cart = loadCart();
      state.cartNote = '';
      await refreshData(true);
      haptic(10);
      toast('加入成功', { type: 'success', duration: 1600 });
      sheet.parentElement.querySelector('.sheet-backdrop')?.click();
      renderPreserveScroll();
    } catch (err) { toast(err.message || '加入失败', { duration: 4000 }); sheet.querySelector('[data-ok]').disabled = false; }
  });
}

async function changeDishStatus(dishId, status) {
  try {
    // 多家庭兼容：先尝试 bulkUpdateDish（按当前家庭批量改）
    if (state.store.bulkUpdateDish) {
      await state.store.bulkUpdateDish(dishId, status);
    } else if (state.store.updateDishStatus) {
      await state.store.updateDishStatus(dishId, status);
    }
    haptic(12);
    toast(status === 'done' ? '做好了，家人那边会看到' : '接单成功，开火吧', { type: 'success', duration: 1600 });
    await refreshData(true);
    renderPreserveScroll();
  } catch (err) {
    toast(err.message || '操作失败', { duration: 4000 });
  }
}

/* 厨师端做法弹层（不跳页） */
async function openRecipeSheet(dishId) {
  const dish = await ensureDish(dishId);
  if (!dish) return toast('这道菜还没有做法');
  const activeItem = activeGroups().find((g) => g.dishId === dishId);
  const { sheet } = openSheet({
    title: dish.name,
    sub: `${dish.category} · ${dish.prepMinutes}′ 备料 / ${dish.cookMinutes}′ 烹饪 · ${dish.allergens}`,
    body: `<div style="padding-bottom:8px">${recipeBodyHtml(dish)}</div>`,
    footer: activeItem
      ? `<button class="btn ghost" data-close-foot>先看着</button>
         <button class="btn ${activeItem.status === 'cooking' ? 'green' : ''}" data-status-foot>${activeItem.status === 'cooking' ? '做好啦' : '接单开始做'}</button>`
      : `<button class="btn ghost" data-close-foot>关闭</button>`
  });
  sheet.querySelector('[data-close-foot]')?.addEventListener('click', () => sheet.parentElement.querySelector('.sheet-backdrop')?.click());
  sheet.querySelector('[data-status-foot]')?.addEventListener('click', async (e) => {
    const next = activeItem.status === 'cooking' ? 'done' : 'cooking';
    e.currentTarget.disabled = true;
    await changeDishStatus(dishId, next);
    sheet.parentElement.querySelector('.sheet-backdrop')?.click();
  });
  bindTimers();
}

/* ============ K03 今日汇总 ============ */
function chefReviewHtml() {
  const rc = state.reviewContext;
  if (!rc) return '';
  const reviews = rc.todayReviews || [];
  const avg = Number(rc.todayRatingAvg || 0);
  const top = rc.familyTop || [];
  return `
    <div class="section-title" style="padding:0 20px;margin-top:22px">今天的好评 <span class="st-count">${reviews.length}</span></div>
    <div class="chef-review">
      <div class="cr-head">
        <div class="cr-avg">${reviews.length ? avg.toFixed(1) : '—'}<small> 分</small></div>
        <div class="cr-meta">${reviews.length ? `${reviews.length} 位家人送了好评` : '关席后家人就能送好评'}</div>
      </div>
      ${reviews.length ? reviews.map((r) => reviewCardHtml(r)).join('') : '<p class="rr-empty">还没收到好评 🌸</p>'}
    </div>
    ${top.length ? `
      <div class="section-title" style="padding:0 20px;margin-top:22px">好评最多的菜</div>
      <div style="padding:0 20px">${reviewRankHtml(top, '')}</div>
    ` : ''}
  `;
}

function pageChefSummary() {
  const todayOrders = state.orders.filter((o) => isToday(o.createdAt) && o.status !== 'cancelled');
  const dishes = new Map();
  let servings = 0;
  todayOrders.forEach((o) => o.items.forEach((it) => {
    servings += it.servings;
    const row = dishes.get(it.dishId) || { name: it.dishName, servings: 0 };
    row.servings += it.servings;
    dishes.set(it.dishId, row);
  }));
  const ranking = [...dishes.values()].sort((a, b) => b.servings - a.servings);
  const max = ranking[0]?.servings || 1;
  return `<div class="page">
    ${pageTopbar({ title: '今日汇总', right: `<button class="icon-btn" data-refresh aria-label="刷新">${icon('refresh', 20)}</button>` })}
    <div style="padding:10px 20px 18px">
      <div class="chef-date">${fmtDate(new Date().toISOString())}</div>
      <h1 class="chef-title">今天做了 <span class="n">${todayOrders.length}</span> 单</h1>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${todayOrders.length}</b><span>点菜单</span></div>
      <div class="stat"><b>${dishes.size}</b><span>菜的种数</span></div>
      <div class="stat"><b>${servings}</b><span>总份数</span></div>
    </div>
    ${chefReviewHtml()}
    <div class="section-title" style="padding:0 20px">最常点的菜</div>
    <div class="rank-list">
      ${ranking.length ? ranking.map((r, i) => `
        <div class="rank">
          <span class="r-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="r-name">${esc(r.name)}</span>
          <span class="r-bar"><i style="width:${Math.max(8, (r.servings / max) * 100)}%"></i></span>
          <span class="r-num">${r.servings} 份</span>
        </div>`).join('')
        : '<p style="padding:10px 0;font-size:13px;color:var(--muted)">今天还没有人点菜</p>'}
    </div>
    <div class="section-title" style="padding:0 20px;margin-top:22px">今天的点菜单</div>
    <div class="submitted" style="padding:0 18px">
      ${todayOrders.length ? todayOrders.map((o) => `
        <div class="order-card">
          <div class="oc-head">
            <span class="oc-time oc-user">${fmtTime(o.createdAt)} · ${memberAvatar(o.userId, o.userName)}${esc(o.userName)}</span>
            <span class="status ${statusMeta(o.status).cls}"><i></i>${statusMeta(o.status).label}</span>
          </div>
          <div class="oc-items">${o.items.map((it) => `
            <div class="oc-item"><span class="oi-name">${esc(it.dishName)}</span><span class="oi-qty">×${it.servings}</span></div>
          `).join('')}</div>
        </div>`).join('')
        : ''}
    </div>
    ${navBar('chef')}
  </div>`;
}

function bindRefresh() {
  document.querySelector('[data-refresh]')?.addEventListener('click', async () => {
    await refreshData();
    renderPreserveScroll();
    toast('已刷新', { duration: 1200 });
  });
}

/* ============ K04 菜品列表 ============ */
function chefDishList() {
  let list = state.dishes.slice().sort((a, b) => a.sortNo - b.sortNo);
  if (state.chefStatus !== 'all') list = list.filter((d) => d.status === state.chefStatus);
  const q = state.chefQuery.trim().toLowerCase();
  if (q) list = list.filter((d) => `${d.name}${d.category}`.toLowerCase().includes(q));
  return list;
}

function chefRowsHtml() {
  const list = chefDishList();
  if (!list.length) {
    return `<div class="empty"><div class="em-mark">${icon('bowl', 26)}</div><h4>还没有菜品</h4><p>点右下角加号，录入第一道菜</p></div>`;
  }
  return list.map((d) => {
    const st = d.status === 'on' ? '在售' : d.status === 'sold_out' ? '售罄' : '停做';
    const cls = d.status === 'on' ? 'done' : 'off';
    return `<button class="dish-row" data-edit="${encodeURIComponent(d.id)}">
      ${imgTag(d.mainImage)}
      <div class="dr-body">
        <div class="dr-name">${esc(d.name)} <span class="status ${cls}">${st}</span></div>
        <div class="dr-meta">${esc(d.category)} · ${d.cookMinutes} 分钟 · ${d.servings} 人份</div>
      </div>
      <span class="chev">${icon('chevron', 18)}</span>
    </button>`;
  }).join('');
}

function pageChefDishes() {
  const filters = [['all', '全部'], ['on', '在售'], ['sold_out', '售罄'], ['off', '停做']];
  return `<div class="page">
    ${pageTopbar({ title: '菜品管理', right: `<button class="icon-btn" data-new-dish aria-label="新建">${icon('plus', 22)}</button>` })}
    <div class="list-tools">
      <div class="search" id="chef-search-wrap" style="width:100%">
        <span class="s-icon">${icon('search', 18)}</span>
        <input class="input" id="chef-search" placeholder="搜菜名" value="${esc(state.chefQuery)}" autocomplete="off">
      </div>
    </div>
    <div class="chips" id="chef-status-chips">
      ${filters.map(([k, label]) => `<button class="chip ${state.chefStatus === k ? 'active' : ''}" data-status="${k}">${label}</button>`).join('')}
    </div>
    <div id="chef-dish-rows">${chefRowsHtml()}</div>
    <button class="fab-add" data-new-dish aria-label="新建菜品">${icon('plus', 26)}</button>
    ${navBar('chef')}
  </div>`;
}

function bindChefDishes() {
  bindBack();
  document.querySelectorAll('[data-new-dish]').forEach((b) => b.addEventListener('click', () => go('/chef/dish/new')));
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => go(`/chef/dish/${b.dataset.edit}`)));
  document.querySelectorAll('#chef-status-chips .chip').forEach((b) => b.addEventListener('click', () => {
    state.chefStatus = b.dataset.status;
    renderPreserveScroll();
  }));
  document.getElementById('chef-search')?.addEventListener('input', debounce((e) => {
    state.chefQuery = e.target.value;
    document.getElementById('chef-dish-rows').innerHTML = chefRowsHtml();
    bindDishRows();
  }, 180));
  bindDishRows();
}

function bindDishRows() {
  document.querySelectorAll('[data-edit]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => go(`/chef/dish/${b.dataset.edit}`));
  });
}

/* ============ K05 菜品编辑 ============ */
function pageDishEdit(id) {
  const isNew = id === 'new';
  const dish = isNew ? null : (state.detailCache.get(id) || findDish(id));
  if (!isNew && !dish) {
    ensureDish(id).then(() => renderPreserveScroll());
  }
  const d = dish || {
    name: '', category: '热菜', intro: '', prepMinutes: 10, cookMinutes: 15,
    difficulty: '易', servings: 2, allergens: '无', mainImage: '', status: 'on'
  };
  return `<div class="page no-nav">
    ${pageTopbar({ back: true, title: isNew ? '新建菜品' : '编辑菜品' })}
    <form id="dish-form" class="form-wrap" novalidate>
      <label class="field">
        <span class="label">菜名 <span class="hint">必填</span></span>
        <input class="input" name="name" value="${esc(d.name)}" maxlength="20" placeholder="例如 宫保鸡丁">
      </label>
      <div class="form-grid">
        <label class="field">
          <span class="label">分类</span>
          <select class="input" name="category">
            ${CATEGORIES.map((c) => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="label">难度</span>
          <select class="input" name="difficulty">
            ${['易', '中', '难'].map((c) => `<option ${d.difficulty === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field">
        <span class="label">一句话简介 <span class="hint">60 字以内</span></span>
        <input class="input" name="intro" value="${esc(d.intro)}" maxlength="60" placeholder="比如 花生米酥香，鸡丁滑嫩">
      </label>
      <div class="form-grid">
        <label class="field">
          <span class="label">备料（分钟）</span>
          <input class="input" name="prepMinutes" type="number" min="0" max="600" value="${d.prepMinutes}">
        </label>
        <label class="field">
          <span class="label">烹饪（分钟）</span>
          <input class="input" name="cookMinutes" type="number" min="0" max="600" value="${d.cookMinutes}">
        </label>
      </div>
      <div class="form-grid">
        <label class="field">
          <span class="label">建议份量（人份）</span>
          <input class="input" name="servings" type="number" min="1" max="20" value="${d.servings}">
        </label>
        <label class="field">
          <span class="label">过敏原 <span class="hint">无则填「无」</span></span>
          <input class="input" name="allergens" value="${esc(d.allergens)}" maxlength="30">
        </label>
      </div>
      <div class="field">
        <span class="label">菜品配图 <span class="hint">可填网络地址，或从相册选</span></span>
        <div style="display:flex;gap:10px;align-items:center">
          <div style="width:76px;height:57px;border-radius:10px;overflow:hidden;background:var(--paper-2);flex:0 0 auto" id="image-preview">
            ${d.mainImage ? imgTag(d.mainImage) : `<div style="height:100%;display:grid;place-items:center;color:var(--muted)">${icon('image', 20)}</div>`}
          </div>
          <div style="flex:1;min-width:0">
            <input class="input small" name="mainImage" id="main-image" value="${esc(d.mainImage)}" placeholder="图片地址">
            <label class="btn ghost small" style="margin-top:8px;width:fit-content;display:inline-flex">
              从相册选择<input type="file" id="image-file" accept="image/*" style="display:none">
            </label>
          </div>
        </div>
      </div>
      <label class="field">
        <span class="label">售卖状态</span>
        <select class="input" name="status">
          <option value="on" ${d.status === 'on' ? 'selected' : ''}>在售</option>
          <option value="sold_out" ${d.status === 'sold_out' ? 'selected' : ''}>售罄（点菜端置灰）</option>
          <option value="off" ${d.status === 'off' ? 'selected' : ''}>停做（不展示）</option>
        </select>
      </label>
      <div class="form-error" id="dish-error"></div>
      <button class="btn" type="submit">${isNew ? '创建并录入做法' : '保存基础信息'}</button>
      <p class="fineprint" style="text-align:center">保存后可以继续编辑食材与步骤</p>
    </form>
    <div class="form-actions">
      ${isNew ? '' : `<button class="btn ghost" id="edit-recipe">编辑做法</button>`}
      ${isNew ? '' : `<button class="btn plain" id="delete-dish" style="color:var(--accent)">删除这道菜</button>`}
    </div>
  </div>`;
}

function bindDishEdit(id) {
  bindBack();
  const dish = state.detailCache.get(id);
  const isNew = id === 'new';
  const form = document.getElementById('dish-form');
  const errEl = document.getElementById('dish-error');
  const imageInput = document.getElementById('main-image');
  const preview = document.getElementById('image-preview');

  imageInput?.addEventListener('input', () => { preview.innerHTML = imgTag(imageInput.value); });

  document.getElementById('image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (state.mode === 'cloud' && state.store.uploadDishImage) {
      try {
        toast('正在上传图片…', { duration: 1500 });
        const url = await state.store.uploadDishImage(file);
        imageInput.value = url;
        preview.innerHTML = imgTag(url);
        toast('图片已上传', { type: 'success' });
      } catch (err) {
        toast(err.message || '上传失败，可粘贴图片链接', { duration: 4000 });
      }
    } else {
      if (file.size > 1.4 * 1024 * 1024) return toast('演示模式图片请小于 1.4MB');
      const reader = new FileReader();
      reader.onload = () => {
        imageInput.value = reader.result;
        preview.innerHTML = imgTag(reader.result);
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('edit-recipe')?.addEventListener('click', () => go(`/chef/dish/${id}/recipe`));

  document.getElementById('delete-dish')?.addEventListener('click', async () => {
    const d = state.detailCache.get(id) || findDish(id);
    const ok = await confirmSheet({
      title: '删除这道菜',
      message: `「${d?.name || '这道菜'}」删除后家人就点不了了，历史点单里的记录会保留。`,
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    try {
      await state.store.deleteDish(id);
      state.detailCache.delete(id);
      await refreshData(true);
      toast('已删除', { type: 'success' });
      go('/chef/dishes');
    } catch (err) {
      toast(err.message || '删除失败', { duration: 4000 });
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const fail = (msg) => {
      errEl.textContent = msg;
      errEl.classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    if (!data.name.trim()) return fail('菜名不能为空');
    if (data.name.trim().length > 20) return fail('菜名请控制在 20 字以内');
    if (!data.allergens.trim()) return fail('过敏原必须填写，没有就写「无」');
    if (Number(data.cookMinutes) < 0 || Number(data.prepMinutes) < 0) return fail('时长不能为负数');
    if (Number(data.servings) < 1) return fail('建议份量至少 1 人份');
    errEl.classList.remove('show');

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      const payload = {
        id: isNew ? undefined : id,
        name: data.name.trim(),
        category: data.category,
        intro: data.intro.trim(),
        prepMinutes: Number(data.prepMinutes) || 0,
        cookMinutes: Number(data.cookMinutes) || 0,
        difficulty: data.difficulty,
        servings: Number(data.servings) || 1,
        allergens: data.allergens.trim(),
        mainImage: data.mainImage.trim(),
        status: data.status,
        hasRecipe: dish?.hasRecipe ?? false
      };
      const newId = await state.store.saveDish(payload);
      await refreshData(true);
      toast(isNew ? '菜品已创建，接着录做法' : '已保存', { type: 'success' });
      go(`/chef/dish/${newId}/recipe`);
    } catch (err) {
      errEl.textContent = err.message || '保存失败';
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = '保存基础信息';
    }
  });
}

/* ============ K06 做法编辑 ============ */
function pageRecipeEdit(id) {
  const dish = state.detailCache.get(id);
  if (!dish) {
    ensureDish(id).then(() => renderPreserveScroll());
    return skeletonDetail();
  }
  return `<div class="page no-nav">
    ${pageTopbar({ back: true, title: `${dish.name} · 做法` })}
    <form id="recipe-form" class="form-wrap" novalidate>
      <p class="fineprint" style="margin:0 0 16px">用量必须带单位，不能写「适量」；步骤 4~10 步，写清动作和判断标准。</p>

      <div class="section-title" style="margin-top:8px">食材 <button type="button" type="button" data-add-ing>+ 添加</button></div>
      <div id="ing-list">${(dish.ingredients || []).map(ingEditRow).join('')}</div>

      <div class="section-title">调料 <button type="button" data-add-season>+ 添加</button></div>
      <div id="season-list">${(dish.seasonings || []).map(seasonEditRow).join('')}</div>

      <div class="section-title">步骤 <button type="button" data-add-step>+ 添加</button></div>
      <div id="step-list">${(dish.steps || []).map(stepEditRow).join('')}</div>

      <div class="form-error" id="recipe-error"></div>
      <button class="btn" type="submit">保存做法</button>
      <div style="height:28px"></div>
    </form>
  </div>`;
}

function ingEditRow(x = { name: '', amount: '', unit: 'g', role: 'main', note: '' }) {
  return `<div class="edit-row" data-ing>
    <div class="grow">
      <div class="row-2">
        <input class="input small" data-f="name" placeholder="食材名" value="${esc(x.name)}">
        <input class="input small" data-f="amount" type="number" min="0" step="0.1" placeholder="用量" value="${x.amount === 0 ? '' : esc(x.amount)}">
      </div>
      <div class="row-2" style="margin-top:8px">
        <input class="input small" data-f="unit" placeholder="单位（g/ml/个）" value="${esc(x.unit)}">
        <select class="input small" data-f="role">
          <option value="main" ${x.role === 'main' ? 'selected' : ''}>主料</option>
          <option value="sub" ${x.role === 'sub' ? 'selected' : ''}>辅料</option>
        </select>
      </div>
      <input class="input small" data-f="note" placeholder="处理备注，如 切块" value="${esc(x.note)}" style="margin-top:8px">
    </div>
    <div class="mini-actions"><button type="button" class="mini-btn danger" data-del-row aria-label="删除">${icon('trash', 16)}</button></div>
  </div>`;
}

function seasonEditRow(x = { name: '', amountText: '', brandNote: '' }) {
  return `<div class="edit-row" data-season>
    <div class="grow">
      <div class="row-2">
        <input class="input small" data-f="name" placeholder="调料名" value="${esc(x.name)}">
        <input class="input small" data-f="amountText" placeholder="如 15ml" value="${esc(x.amountText)}">
      </div>
      <input class="input small" data-f="brandNote" placeholder="备注（选填）" value="${esc(x.brandNote)}" style="margin-top:8px">
    </div>
    <div class="mini-actions"><button type="button" class="mini-btn danger" data-del-row aria-label="删除">${icon('trash', 16)}</button></div>
  </div>`;
}

function stepEditRow(x = { description: '', durationMinutes: 0, needTimer: false, heatTip: '' }) {
  return `<div class="edit-row" data-step style="align-items:flex-start">
    <div class="grow">
      <textarea class="input small" data-f="description" placeholder="步骤说明，20~80 字" style="min-height:64px">${esc(x.description)}</textarea>
      <div class="row-2" style="margin-top:8px">
        <input class="input small" data-f="durationMinutes" type="number" min="0" placeholder="耗时(分)" value="${x.durationMinutes || ''}">
        <input class="input small" data-f="heatTip" placeholder="火候，如 大火" value="${esc(x.heatTip)}">
      </div>
      <label style="display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12.5px;color:var(--ink-2)">
        <input type="checkbox" data-f="needTimer" ${x.needTimer ? 'checked' : ''}> 需要计时
      </label>
    </div>
    <div class="mini-actions">
      <button type="button" class="mini-btn" data-up aria-label="上移">${icon('arrowUp', 15)}</button>
      <button type="button" class="mini-btn" data-down aria-label="下移">${icon('arrowDown', 15)}</button>
      <button type="button" class="mini-btn danger" data-del-row aria-label="删除">${icon('trash', 16)}</button>
    </div>
  </div>`;
}

function bindRecipeEdit(id) {
  bindBack();
  const form = document.getElementById('recipe-form');
  const errEl = document.getElementById('recipe-error');

  const bindRow = (root) => {
    root.querySelectorAll('[data-del-row]').forEach((b) => {
      b.onclick = () => b.closest('.edit-row').remove();
    });
    root.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('.edit-row');
        if (row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
      };
    });
    root.querySelectorAll('[data-down]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('.edit-row');
        if (row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
      };
    });
  };

  form.querySelectorAll('.edit-row').forEach(bindRow);

  document.querySelector('[data-add-ing]').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = ingEditRow();
    const row = div.firstElementChild;
    document.getElementById('ing-list').appendChild(row);
    bindRow(row);
    row.querySelector('[data-f=name]').focus();
  });
  document.querySelector('[data-add-season]').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = seasonEditRow();
    const row = div.firstElementChild;
    document.getElementById('season-list').appendChild(row);
    bindRow(row);
    row.querySelector('[data-f=name]').focus();
  });
  document.querySelector('[data-add-step]').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = stepEditRow();
    const row = div.firstElementChild;
    document.getElementById('step-list').appendChild(row);
    bindRow(row);
    row.querySelector('[data-f=description]').focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const readRows = (sel) => [...document.querySelectorAll(sel)].map((row) => {
      const get = (f) => row.querySelector(`[data-f="${f}"]`)?.value ?? '';
      return { row, get };
    });
    const ingRows = readRows('#ing-list [data-ing]');
    const seasonRows = readRows('#season-list [data-season]');
    const stepRows = readRows('#step-list [data-step]');

    const fail = (msg, row) => {
      errEl.textContent = msg;
      errEl.classList.add('show');
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.querySelector('input,textarea')?.classList.add('invalid');
      return false;
    };

    const ingredients = [];
    for (const { row, get } of ingRows) {
      const name = get('name').trim();
      const amount = Number(get('amount'));
      const unit = get('unit').trim();
      const note = get('note').trim();
      const role = get('role');
      if (!name && !unit && !amount) { row.remove(); continue; }
      if (!name) return fail('有食材没填名称', row);
      if (!amount || amount <= 0) return fail(`「${name}」的用量要填数字`, row);
      if (!unit) return fail(`「${name}」要填单位，比如 g、个、勺`, row);
      if (/适量/.test(unit) || /适量/.test(String(amount))) return fail('用量必须具体，不能写「适量」', row);
      ingredients.push({ name, amount, unit, role, note });
    }
    if (!ingredients.length) return fail('至少录一样食材');

    const seasonings = [];
    for (const { row, get } of seasonRows) {
      const name = get('name').trim();
      const amountText = get('amountText').trim();
      if (!name && !amountText) { row.remove(); continue; }
      if (!name) return fail('有调料没填名称', row);
      if (!amountText) return fail(`「${name}」要填用量，比如 15ml`, row);
      if (/适量/.test(amountText)) return fail('调料用量也要具体，不能写「适量」', row);
      seasonings.push({ name, amountText, brandNote: get('brandNote').trim() });
    }

    const steps = [];
    for (const { row, get } of stepRows) {
      const description = get('description').trim();
      if (!description) { row.remove(); continue; }
      if (description.length < 6) return fail('步骤写得太简略，至少 6 个字', row);
      if (description.length > 120) return fail('单步说明请控制在 120 字以内', row);
      const durationMinutes = Number(get('durationMinutes')) || 0;
      const needTimer = row.querySelector('[data-f="needTimer"]').checked;
      if (needTimer && !durationMinutes) return fail('勾了计时就要填耗时分钟数', row);
      steps.push({ description, durationMinutes, needTimer, heatTip: get('heatTip').trim() });
    }
    if (!steps.length) return fail('至少录一个步骤');
    if (steps.length > 12) return fail('步骤最多 12 步，太长了厨师记不住');

    errEl.classList.remove('show');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
      await state.store.saveRecipe(id, { ingredients, seasonings, steps });
      await refreshData(true);
      toast('做法已保存', { type: 'success' });
      go('/chef/dishes');
    } catch (err) {
      errEl.textContent = err.message || '保存失败';
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = '保存做法';
    }
  });
}

/* ============ 设置 ============ */
function pageSettings() {
  const s = state.session;
  const isChef = s.role === 1;
  const chefView = viewMode() === 'chef';
  // 自定义头像是 URL，不能只看预设表，否则上传成功也仍显示昵称首字
  const photo = /^(https?:|data:image)/i.test(s.avatar || '');
  const av = photo ? null : avatarPreset(s.avatar);
  const soundOn = localStorage.getItem('fm_sound') !== 'off';
  const famName = state.currentFamily?.name || '未选择家庭';
  const joinCode = state.currentFamily?.joinCode || '';
  return `<div class="page">
    ${pageTopbar({ title: '我的' })}
    <div class="profile-block">
      <button class="avatar avatar-btn" id="edit-avatar" aria-label="更换头像" style="${av ? `background:${av.bg}` : ''}">
        ${photo ? `<img class="av-img" src="${esc(s.avatar)}" alt="">` : av ? `<span class="av-emoji">${av.emoji}</span>` : esc((s.nickname || '我').slice(0, 1))}
        <span class="av-badge">${icon('edit', 11)}</span>
      </button>
      <div>
        <div class="pb-name">${esc(s.nickname)}</div>
        <div class="pb-meta">${isChef ? (chefView ? '厨师' : '家人视角') : '家人'} · ${esc(famName)} · ${state.mode === 'cloud' ? '云同步' : '体验模式'}</div>
      </div>
    </div>
    <div class="setting-group">
      <button class="setting-row" id="edit-name">
        <span class="sr-label">昵称</span><span class="sr-value">${esc(s.nickname)}</span>${icon('chevron', 16, 'chev')}
      </button>
      ${isChef ? `<button class="setting-row" id="switch-view">
        <span class="sr-label">切换视角</span><span class="sr-value">${chefView ? '当前：厨师端' : '当前：家人端'}</span>${icon('chevron', 16, 'chev')}
      </button>` : ''}
      <button class="setting-row" id="switch-family">
        <span class="sr-label">当前家庭</span><span class="sr-value">${esc(famName)}</span>${icon('chevron', 16, 'chev')}
      </button>
      <button class="setting-row" id="copy-code">
        <span class="sr-label">家庭码</span><span class="sr-value">${esc(joinCode || '—')}</span>${icon('chevron', 16, 'chev')}
      </button>
    </div>
    <div class="setting-group">
      <button class="setting-row" id="sound-toggle">
        <span class="sr-label">新单提示音</span><span class="sr-value">${soundOn ? '开' : '关'}</span>
      </button>
      <button class="setting-row" id="notify-toggle">
        <span class="sr-label">系统通知</span><span class="sr-value">${'Notification' in window && Notification.permission === 'granted' ? '已允许' : '未开启'}</span>
      </button>
      ${isChef ? `<button class="setting-row" id="push-key">
        <span class="sr-label">厨师微信推送</span><span class="sr-value">${s.pushKey ? '已填写' : '未填写'}</span>${icon('chevron', 16, 'chev')}
      </button>` : ''}
      <button class="setting-row" id="cloud-config">
        <span class="sr-label">数据存储</span><span class="sr-value">${state.mode === 'cloud' ? 'Supabase 云同步' : '仅本机（体验）'}</span>${icon('chevron', 16, 'chev')}
      </button>
    </div>
    <div class="setting-group">
      <button class="setting-row" id="logout">
        <span class="sr-label" style="color:var(--accent)">退出当前身份</span>
      </button>
    </div>
    <p class="fineprint" style="padding:0 20px 30px">家宴 · 自用版本。不上架应用商店，不对外提供服务。数据默认保存在你自己的 Supabase 项目里。</p>
    ${navBar(chefView ? 'chef' : 'family')}
  </div>`;
}

function openAvatarSheet() {
  const cur = state.session?.avatar || '';
  const isPhoto = /^(https?:|data:image)/i.test(cur);
  openSheet({
    title: '换个头像',
    sub: '挑一个预设，或上传自己的照片',
    body: `<div class="avatar-grid">${AVATARS.map((a) => `
      <button class="avatar-opt ${a.key === cur ? 'active' : ''}" data-avatar="${a.key}" aria-label="头像 ${a.key}">
        <span class="avatar-opt-pic" style="background:${a.bg}">${a.emoji}</span>
      </button>`).join('')}</div>
      <button class="avatar-upload-btn" id="avatar-pick">${isPhoto ? '重新上传照片' : '上传照片'}</button>
      <input type="file" accept="image/*" id="avatar-file" hidden>`,
    footer: `<button class="btn ghost" id="avatar-reset">恢复默认（昵称首字）</button>`
  });
  const save = async (key) => {
    try {
      await state.store.updateProfile({ avatar: key });
      state.session = state.store.getSession();
      toast(key ? '头像已换好' : '已恢复默认头像', { type: 'success' });
      document.querySelector('.sheet-backdrop')?.click();
      renderPreserveScroll();
    } catch (err) { toast(err.message); }
  };
  document.querySelectorAll('[data-avatar]').forEach((b) => {
    b.addEventListener('click', () => save(b.dataset.avatar));
  });
  document.getElementById('avatar-reset')?.addEventListener('click', () => save(''));
  const file = document.getElementById('avatar-file');
  document.getElementById('avatar-pick')?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      if (!state.store.uploadAvatar) throw new Error('当前模式不支持上传头像');
      toast('正在处理照片…');
      const blob = await squareJpeg(f, 240);
      await state.store.uploadAvatar(blob);
      state.session = state.store.getSession();
      if (state.session?.userId) state.avatarMap.set(state.session.userId, state.session.avatar || '');
      toast('头像已换好', { type: 'success' });
      document.querySelector('.sheet-backdrop')?.click();
      renderPreserveScroll();
    } catch (err) { toast(err.message || '图片处理失败'); }
  });
}

function bindSettings() {
  bindBack();
  document.getElementById('edit-avatar')?.addEventListener('click', openAvatarSheet);
  document.getElementById('edit-name')?.addEventListener('click', () => {
    openSheet({
      title: '改个昵称',
      body: `<label class="field"><span class="label">昵称</span><input class="input" id="new-name" maxlength="12" value="${esc(state.session.nickname)}"></label>`,
      footer: `<button class="btn" id="save-name">保存</button>`
    });
    document.getElementById('save-name').addEventListener('click', async () => {
      const v = document.getElementById('new-name').value.trim();
      if (!v) return toast('昵称不能为空');
      try {
        await state.store.updateProfile({ nickname: v });
        state.session = state.store.getSession();
        toast('已更新', { type: 'success' });
        document.querySelector('.sheet-backdrop')?.click();
        renderPreserveScroll();
      } catch (err) { toast(err.message); }
    });
  });

  document.getElementById('switch-view')?.addEventListener('click', async () => {
    const next = viewMode() === 'chef' ? 'family' : 'chef';
    const ok = await confirmSheet({
      title: next === 'family' ? '切换到家人端' : '切换回厨师端',
      message: next === 'family'
        ? '家人端就是家人点菜看到的界面，可以随时切回厨师端。'
        : '回到厨师端，继续接单、汇总和管理菜品。',
      confirmText: '切换'
    });
    if (!ok) return;
    setViewMode(next);
    await refreshData(true);
    toast(next === 'family' ? '已切到家人端' : '已切回厨师端', { type: 'success' });
    go(next === 'family' ? '/menu' : '/chef');
  });

  document.getElementById('switch-family')?.addEventListener('click', () => {
    openFamilyPicker({ allowCreate: true, allowJoin: true });
  });

  document.getElementById('copy-code')?.addEventListener('click', async () => {
    const code = state.currentFamily?.joinCode || '';
    if (!code) { openJoinFamilySheet(); return; }
    try {
      await navigator.clipboard.writeText(code);
      toast('家庭码已复制', { type: 'success' });
    } catch (_) {
      toast(`家庭码：${code}`);
    }
  });

  document.getElementById('sound-toggle')?.addEventListener('click', () => {
    const on = localStorage.getItem('fm_sound') !== 'off';
    localStorage.setItem('fm_sound', on ? 'off' : 'on');
    if (!on) beep('soft');
    renderPreserveScroll();
  });

  document.getElementById('notify-toggle')?.addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('这台手机不支持系统通知');
    if (Notification.permission === 'granted') return toast('系统通知已开启');
    const res = await Notification.requestPermission();
    toast(res === 'granted' ? '已开启系统通知' : '没有授权，仍会有页面提示音');
    renderPreserveScroll();
  });

  document.getElementById('push-key')?.addEventListener('click', () => {
    openSheet({
      title: '厨师微信推送',
      sub: '填 Server 酱的 SendKey，家人一下单就推到微信',
      body: `<label class="field"><span class="label">SendKey</span>
        <input class="input" id="new-push-key" placeholder="SCT... 或 sctp..." value="${esc(state.session.pushKey || '')}"></label>
        <p class="fineprint">SendKey 在 sct.ftqq.com 微信扫码后免费获取（以 SCT 或 sctp 开头）。保存后还需要在 Supabase SQL Editor 执行一次 supabase/notify.sql，推送才会生效。</p>`,
      footer: `<button class="btn" id="save-push-key">保存</button>`
    });
    document.getElementById('save-push-key').addEventListener('click', async () => {
      try {
        const key = document.getElementById('new-push-key').value.trim();
        if (key && !/^sct/i.test(key)) return toast('SendKey 应以 SCT 或 sctp 开头');
        await state.store.setPushKey(key);
        state.session.pushKey = key;
        toast('已保存', { type: 'success' });
        document.querySelector('.sheet-backdrop')?.click();
        renderPreserveScroll();
      } catch (err) { toast(err.message); }
    });
  });

  document.getElementById('cloud-config')?.addEventListener('click', openCloudConfig);

  document.getElementById('logout')?.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '退出当前身份',
      message: '退出后需要重新填家庭码和昵称，点菜单里未提交的菜会保留。',
      confirmText: '退出',
      danger: true
    });
    if (!ok) return;
    await state.store.logout();
    localStorage.removeItem('fm_view_mode');
    state.session = null;
    state.cart = [];
    saveCart();
    location.hash = '/join';
    render();
  });
}

/* ============ Supabase 连接配置 ============ */
function openCloudConfig() {
  const cfg = readSupabaseConfig();
  const { close } = openSheet({
    title: '连接 Supabase',
    sub: '填项目的 URL 与 anon key，全家共用一张点菜单',
    body: `
      <label class="field"><span class="label">Project URL</span>
        <input class="input" id="sb-url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url)}"></label>
      <label class="field"><span class="label">anon public key</span>
        <input class="input" id="sb-key" placeholder="eyJhbGciOi..." value="${esc(cfg.key)}"></label>
      <div class="form-error" id="sb-error"></div>
      <p class="fineprint">第一次使用：在 Supabase SQL Editor 执行项目里的 supabase/schema.sql，再在 Authentication 打开 Anonymous sign-ins。详细步骤见 部署说明.md。</p>`,
    footer: `<button class="btn ghost" id="sb-test">测试连接</button><button class="btn" id="sb-save">保存并启用</button>`
  });

  const errEl = document.getElementById('sb-error');
  const readVals = () => ({
    url: document.getElementById('sb-url').value.trim().replace(/\/$/, ''),
    key: document.getElementById('sb-key').value.trim()
  });

  document.getElementById('sb-test').addEventListener('click', async (e) => {
    const { url, key } = readVals();
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = '测试中…';
    try {
      if (!url || !key) throw new Error('URL 和 key 都要填');
      await testConnection(url, key);
      errEl.classList.remove('show');
      toast('连接成功，表结构正常', { type: 'success' });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    } finally {
      e.currentTarget.disabled = false;
      e.currentTarget.textContent = '测试连接';
    }
  });

  document.getElementById('sb-save').addEventListener('click', async (e) => {
    const { url, key } = readVals();
    if (!url || !key) {
      errEl.textContent = 'URL 和 key 都要填';
      errEl.classList.add('show');
      return;
    }
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = '连接中…';
    try {
      const cloud = new CloudStore(url, key);
      await cloud.init();
      saveSupabaseConfig(url, key);
      localStorage.setItem('fm_mode', 'cloud');
      state.store = cloud;
      state.mode = 'cloud';
      state.session = cloud.getSession();
      close();
      await refreshData(true);
      toast('已启用云同步', { type: 'success' });
      if (state.session) go(viewMode() === 'chef' ? '/chef' : '/menu');
      else go('/join');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      e.currentTarget.disabled = false;
      e.currentTarget.textContent = '保存并启用';
    }
  });
}

/* ============ 本地点菜单（按家庭隔离） ============ */
function cartKey() {
  const fam = state.session?.currentFamilyId || 'guest';
  return `fm_cart_${state.mode}_${fam}`;
}

function loadCart() {
  try {
    const raw = localStorage.getItem(cartKey());
    if (raw) return JSON.parse(raw);
    // 兼容旧版本：把未区分家庭的点菜单迁到当前家庭
    const legacy = localStorage.getItem(`fm_cart_${state.mode}`);
    if (legacy) {
      localStorage.removeItem(`fm_cart_${state.mode}`);
      return JSON.parse(legacy);
    }
    return [];
  } catch (_) { return []; }
}

function saveCart() {
  localStorage.setItem(cartKey(), JSON.stringify(state.cart));
}
