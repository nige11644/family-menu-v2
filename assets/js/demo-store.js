/** 演示模式 v2：多家庭（厨师可服务多家），数据存本机 + BroadcastChannel 同步 */
import { seedDishes } from './seed.js';

const KEY = 'fm_demo_data_v2';
const SESSION_KEY = 'fm_demo_session_v2';
const CHANNEL = 'fm_demo_sync_v2';

const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }

  // ==== 预置 3 个家庭 + 订单 ====
  const F1 = { id: 'fam-home77', name: '张阿姨家', joinCode: 'HOME77' };
  const F2 = { id: 'fam-home88', name: '王叔叔家', joinCode: 'HOME88' };
  const F3 = { id: 'fam-home99', name: '小李家',   joinCode: 'HOME99' };

  const dishes = seedDishes.map((d) => ({
    ...clone(d),
    hasRecipe: true,
    images: [],
    createdAt: nowIso()
  }));

  const db = {
    families: [F1, F2, F3],
    dishes,
    orders: [
      // —— 张阿姨家 / 张阿姨 ——
      {
        id: uid('o'), familyId: F1.id, userName: '张阿姨',
        note: '', status: 'pending',
        createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
        items: [
          { id: uid('oi'), familyId: F1.id, dishId: dishes[0].id, dishName: dishes[0].name, dishImage: dishes[0].mainImage, servings: 1, note: '', status: 'pending' },
          { id: uid('oi'), familyId: F1.id, dishId: dishes[1].id, dishName: dishes[1].name, dishImage: dishes[1].mainImage, servings: 1, note: '', status: 'pending' },
          { id: uid('oi'), familyId: F1.id, dishId: dishes[4].id, dishName: dishes[4].name, dishImage: dishes[4].mainImage, servings: 2, note: '', status: 'pending' },
        ]
      },
      // —— 张阿姨家 / 小明 ——
      {
        id: uid('o'), familyId: F1.id, userName: '小明',
        note: '今晚想吃点热乎的', status: 'cooking',
        createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
        items: [
          { id: uid('oi'), familyId: F1.id, dishId: dishes[0].id, dishName: dishes[0].name, dishImage: dishes[0].mainImage, servings: 2, note: '少辣', status: 'cooking' },
          { id: uid('oi'), familyId: F1.id, dishId: dishes[4].id, dishName: dishes[4].name, dishImage: dishes[4].mainImage, servings: 3, note: '', status: 'pending' },
        ]
      },
      // —— 王叔叔家 / 王叔叔 ——
      {
        id: uid('o'), familyId: F2.id, userName: '王叔叔',
        note: '', status: 'pending',
        createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
        items: [
          { id: uid('oi'), familyId: F2.id, dishId: dishes[2].id, dishName: dishes[2].name, dishImage: dishes[2].mainImage, servings: 2, note: '多炖一会儿', status: 'pending' },
          { id: uid('oi'), familyId: F2.id, dishId: dishes[1].id, dishName: dishes[1].name, dishImage: dishes[1].mainImage, servings: 1, note: '', status: 'pending' },
          { id: uid('oi'), familyId: F2.id, dishId: dishes[5].id, dishName: dishes[5].name, dishImage: dishes[5].mainImage, servings: 1, note: '', status: 'pending' },
        ]
      },
    ]
  };
  save(db);
  return db;
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) { /* ignore */ }
}

function toSession(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
}

class DemoStore {
  constructor() {
    this.mode = 'demo';
    this._data = null;
    this._listeners = new Set();
    this._bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    if (this._bc) this._bc.onmessage = (e) => this._emit(e.data?.type || 'orders', e.data);
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { this._data = null; this._emit('orders', { remote: true }); }
      if (e.key === SESSION_KEY) { this._emit('session', { remote: true }); }
    });
  }

  _db() { if (!this._data) this._data = load(); return this._data; }
  _emit(type, extra = {}) { this._data = null; this._listeners.forEach((fn) => { try { fn({ type, ...extra }); } catch (_) {} }); }
  _publish(type) { this._emit(type); if (this._bc) this._bc.postMessage({ type }); }

  // ---- session ----
  getSession() {
    const s = toSession(localStorage.getItem(SESSION_KEY));
    return s;
  }
  getCurrentFamilyId() {
    return this.getSession()?.currentFamilyId || null;
  }
  getCurrentFamily() {
    const db = this._db();
    const s = this.getSession();
    if (!s?.currentFamilyId) return null;
    return db.families.find((f) => f.id === s.currentFamilyId) || null;
  }
  listFamilies() {
    const s = this.getSession();
    if (!s) return [];
    const db = this._db();
    return s.families.map((fm) => ({
      ...fm,
      family: db.families.find((f) => f.id === fm.familyId) || null
    })).filter((x) => x.family);
  }

  // ---- 加入 / 创建 / 切换家庭 ----
  async createFamily({ name, nickname }) {
    const db = this._db();
    const family = {
      id: uid('fam'),
      name: (name || '我家').trim().slice(0, 16),
      joinCode: genCode()
    };
    db.families.push(family);
    save(db);

    const s = this.getSession() || {
      userId: 'me-demo',
      nickname: (nickname || '主厨').trim().slice(0, 12),
      families: [],
      currentFamilyId: family.id,
      mode: 'demo'
    };
    // 如果这个家庭还没在 session 里
    if (!s.families.find((fm) => fm.familyId === family.id)) {
      s.families.push({ familyId: family.id, familyName: family.name, joinCode: family.joinCode, role: 1 });
    }
    s.currentFamilyId = family.id;
    s.nickname = s.nickname || nickname;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    this._publish('session');
    return { familyId: family.id, familyName: family.name, joinCode: family.joinCode };
  }

  async joinFamily({ code, nickname, role }) {
    const db = this._db();
    const joinedCode = (code || '').trim().toUpperCase();
    let family = db.families.find((f) => f.joinCode.toUpperCase() === joinedCode);
    if (!family) {
      // 自动创建（给演示一个兜底）
      family = { id: uid('fam'), name: '新家庭', joinCode: joinedCode || genCode() };
      db.families.push(family);
      save(db);
    }

    const session = this.getSession() || {
      userId: 'me-demo',
      nickname: (nickname || '家人').trim().slice(0, 12),
      families: [],
      currentFamilyId: family.id,
      mode: 'demo'
    };
    session.nickname = (nickname || session.nickname || '家人').trim().slice(0, 12);
    if (!session.families.find((fm) => fm.familyId === family.id)) {
      session.families.push({
        familyId: family.id,
        familyName: family.name,
        joinCode: family.joinCode,
        role: Number(role) === 1 ? 1 : 0
      });
    } else {
      // 更新角色
      const fm = session.families.find((x) => x.familyId === family.id);
      fm.role = Number(role) === 1 ? 1 : 0;
    }
    session.currentFamilyId = family.id;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this._publish('session');
    return session;
  }

  async switchFamily(familyId) {
    const db = this._db();
    const s = this.getSession();
    if (!s) throw new Error('未登录');
    if (!s.families.find((fm) => fm.familyId === familyId)) throw new Error('你不是该家庭的成员');
    if (!db.families.find((f) => f.id === familyId)) throw new Error('家庭不存在');
    const next = { ...s, currentFamilyId: familyId };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    this._publish('session');
    return next;
  }

  async leaveFamily(familyId) {
    const s = this.getSession();
    if (!s) return;
    const nextFamilies = s.families.filter((fm) => fm.familyId !== familyId);
    const next = { ...s, families: nextFamilies };
    if (next.currentFamilyId === familyId) {
      next.currentFamilyId = nextFamilies[0]?.familyId || null;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    this._publish('session');
  }

  async logout() { localStorage.removeItem(SESSION_KEY); }

  async updateProfile({ nickname, role }) {
    const s = this.getSession();
    if (!s) return null;
    const next = { ...s };
    if (nickname) next.nickname = nickname.trim().slice(0, 12);
    if (role !== undefined) {
      if (s.currentFamilyId) {
        const fm = next.families.find((x) => x.familyId === s.currentFamilyId);
        if (fm) fm.role = Number(role);
      }
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    this._publish('session');
    return next;
  }

  // ---- 菜品 ----
  async listDishes() {
    return clone(this._db().dishes);
  }
  async getDish(id) {
    return clone(this._db().dishes.find((d) => d.id === id) || null);
  }

  async saveDish(payload) {
    const db = this._db();
    if (payload.id) {
      const idx = db.dishes.findIndex((d) => d.id === payload.id);
      if (idx >= 0) {
        db.dishes[idx] = { ...db.dishes[idx], ...payload, updatedAt: nowIso() };
      }
    } else {
      db.dishes.push({
        ...payload,
        id: uid('d'),
        ingredients: payload.ingredients || [],
        seasonings: payload.seasonings || [],
        steps: payload.steps || [],
        images: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }
    save(db);
    this._publish('dishes');
    return payload.id || db.dishes[db.dishes.length - 1].id;
  }

  async saveRecipe(dishId, { ingredients, seasonings, steps }) {
    const db = this._db();
    const d = db.dishes.find((x) => x.id === dishId);
    if (!d) throw new Error('菜品不存在');
    d.ingredients = clone(ingredients);
    d.seasonings = clone(seasonings);
    d.steps = clone(steps);
    d.hasRecipe = ingredients.length > 0 && steps.length > 0;
    save(db);
    this._publish('dishes');
  }

  async deleteDish(dishId) {
    const db = this._db();
    db.dishes = db.dishes.filter((d) => d.id !== dishId);
    save(db);
    this._publish('dishes');
  }

  // ---- 订单 ----
  async listOrders() {
    const s = this.getSession();
    const db = this._db();
    let orders = clone(db.orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // 先按当前家庭过滤
    if (s?.currentFamilyId) {
      orders = orders.filter((o) => o.familyId === s.currentFamilyId);
    }
    // 厨师看全部，家人只看自己
    if (s) {
      const curFm = s.families.find((fm) => fm.familyId === s.currentFamilyId);
      const isChef = curFm?.role === 1;
      if (!isChef) orders = orders.filter((o) => o.userName === s.nickname);
    }
    return orders;
  }

  async createOrder(items, note) {
    const s = this.getSession();
    if (!s || !s.currentFamilyId) throw new Error('请先加入或选择家庭');
    const curFm = s.families.find((fm) => fm.familyId === s.currentFamilyId);
    if (!curFm) throw new Error('你不是当前家庭的成员');
    const db = this._db();

    const order = {
      id: uid('o'),
      familyId: s.currentFamilyId,
      userName: curFm.role === 1 ? (s.nickname || '主厨') : (s.nickname || '家人'),
      note: (note || '').slice(0, 120),
      status: 'pending',
      createdAt: nowIso(),
      items: items.map((it) => {
        const d = db.dishes.find((x) => x.id === it.dishId);
        return {
          id: uid('oi'),
          familyId: s.currentFamilyId,
          dishId: it.dishId,
          dishName: (d?.name || it.dishName || '未知菜品'),
          dishImage: (d?.mainImage || ''),
          servings: Math.max(1, Math.min(20, Number(it.servings) || 1)),
          note: (it.note || '').slice(0, 60),
          status: 'pending'
        };
      })
    };
    db.orders.unshift(order);
    save(db);
    this._publish('orders');
    return order.id;
  }

  // 家人撤回自己的订单：仅当整单还没被厨师接单（所有 item 都是 pending）
  async cancelOrder(orderId) {
    const s = this.getSession();
    if (!s) throw new Error('未登录');
    const db = this._db();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('订单不存在');
    if (order.userName !== s.nickname) throw new Error('只能撤回自己点的菜');
    if (order.status === 'cancelled') return;
    if (order.items.some((it) => it.status !== 'pending')) {
      throw new Error('厨师已经开始做了，撤不回啦');
    }
    order.status = 'cancelled';
    order.items.forEach((it) => { it.status = 'cancelled'; });
    save(db);
    this._publish('orders');
  }

  // 批量更新某道汇总菜的所有 item 状态（厨师看板一键操作）
  async bulkUpdateDish(dishId, status) {
    const s = this.getSession();
    if (!s?.currentFamilyId) return;
    const db = this._db();
    let touched = false;
    db.orders.forEach((o) => {
      if (o.familyId !== s.currentFamilyId) return;
      o.items.forEach((it) => {
        if (it.dishId === dishId && it.status !== 'done') {
          // pending -> cooking 合法；cooking -> done 合法；done 不可逆
          if (status === 'cooking' && it.status === 'pending') { it.status = 'cooking'; touched = true; }
          else if (status === 'done') { it.status = 'done'; touched = true; }
          else if (status === 'pending' && it.status === 'cooking') { it.status = 'pending'; touched = true; }
        }
      });
      // 自动汇总 order 头状态
      const actives = o.items.filter((it) => it.status !== 'done');
      if (actives.length === 0) o.status = 'done';
      else if (actives.some((it) => it.status === 'cooking')) o.status = 'cooking';
      else o.status = 'pending';
    });
    if (touched) { save(db); this._publish('orders'); }
  }

  // 更新单个 item 状态（做法弹层里按菜做）
  async updateItemStatus(itemId, status) {
    const db = this._db();
    let touched = false;
    db.orders.forEach((o) => {
      o.items.forEach((it) => {
        if (it.id === itemId) {
          it.status = status;
          touched = true;
        }
      });
      const actives = o.items.filter((it) => it.status !== 'done');
      if (actives.length === 0) o.status = 'done';
      else if (actives.some((it) => it.status === 'cooking')) o.status = 'cooking';
      else o.status = 'pending';
    });
    if (touched) { save(db); this._publish('orders'); }
  }

  async subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}

export const demoStore = new DemoStore();
