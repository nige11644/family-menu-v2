/** Supabase 云模式 v2：多家庭（私厨服务多家），多台手机实时同步 */
import { seedDishes } from './seed.js';

let createClientFn = null;
async function loadSupabase() {
  if (createClientFn) return createClientFn;
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  createClientFn = mod.createClient;
  return createClientFn;
}

/* ---------- 行 → UI 对象 ---------- */
// jsonb 数组元素兼容两种形态：纯字符串（seed）或结构化对象（编辑器保存）
const normIngredient = (x) => typeof x === 'string'
  ? { name: x, amount: '', unit: '', role: 'main', note: '' }
  : { name: x.name || '', amount: x.amount ?? '', unit: x.unit || '', role: x.role || 'main', note: x.note || '' };
const normSeasoning = (x) => typeof x === 'string'
  ? { name: x, amountText: '', brandNote: '' }
  : { name: x.name || '', amountText: x.amountText || '', brandNote: x.brandNote || '' };
const normStep = (x, i) => typeof x === 'string'
  ? { seq: i + 1, description: x, durationMinutes: 0, needTimer: false, heatTip: '' }
  : {
      seq: x.seq ?? i + 1, description: x.description || '',
      durationMinutes: x.durationMinutes ?? 0, needTimer: !!x.needTimer, heatTip: x.heatTip || ''
    };

const mapDish = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category || '热菜',
  intro: r.intro || '',
  prepMinutes: r.prep_minutes ?? 10,
  cookMinutes: r.cooking_minutes ?? 15,
  difficulty: r.difficulty || '易',
  servings: r.servings_per ?? 2,
  allergens: r.allergens || '无',
  mainImage: r.image_url || '',
  status: r.status || 'on',
  hasRecipe: r.has_recipe !== false,
  sortNo: r.sort_no ?? 99,
  images: [],
  ingredients: (r.ingredients || []).map(normIngredient),
  seasonings: (r.seasonings || []).map(normSeasoning),
  steps: (r.steps || []).map(normStep)
});

const mapOrder = (r) => ({
  id: r.id,
  familyId: r.family_id,
  userId: r.user_id,
  userName: r.user_name || '家人',
  note: r.note || '',
  status: r.status || 'pending',
  createdAt: r.created_at,
  items: (r.order_item || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((x) => ({
    id: x.id,
    dishId: x.dish_id,
    dishName: x.dish_name,
    dishImage: x.dish_image || '',
    servings: x.servings,
    note: x.note || '',
    status: x.status || 'pending'
  }))
});

function friendly(error) {
  const raw = String(error?.message || error || '未知错误');
  if (/anonymous.*disabled/i.test(raw)) {
    return new Error('Supabase 未开启匿名登录：请在 Authentication → Sign In / Providers 打开 Anonymous sign-ins');
  }
  if (/invalid.*api.?key|jwt/i.test(raw)) return new Error('Supabase URL 或 anon key 不正确');
  if (/家庭码/.test(raw)) return new Error('家庭码不正确，请核对家庭群里的 8 位码');
  if (/row-level security|permission denied/i.test(raw)) return new Error('权限不足：请确认 SQL 脚本里的 RLS 已执行，或当前账号是厨师');
  if (/does not exist|relation .* not found/i.test(raw)) return new Error('数据库还没有建表：请先在 SQL Editor 执行 supabase/schema.sql');
  if (/Failed to fetch|NetworkError/i.test(raw)) return new Error('连不上 Supabase：请检查网络或项目 URL');
  return new Error(raw);
}

export class CloudStore {
  constructor(url, key) {
    this.mode = 'cloud';
    this.url = url;
    this.key = key;
    this.client = null;
    this.session = null;
    this._listeners = new Set();
    this._channel = null;
  }

  getSetupState() {
    return { configured: !!this.url && !!this.key, mode: 'cloud' };
  }

  /* ---------- 会话 ---------- */
  async init() {
    const createClient = await loadSupabase();
    this.client = createClient(this.url, this.key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    let { data: { session } } = await this.client.auth.getSession();
    if (!session) {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) throw friendly(error);
      session = data.session;
    }
    if (!session) throw new Error('无法建立登录状态');
    this._userId = session.user.id;
    await this._loadSession();
    return this.session;
  }

  // 从 user_profiles + family_member + family 重建本地会话
  async _loadSession() {
    const uid = this._userId;
    const { data: profile, error: pErr } = await this.client
      .from('user_profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (pErr) throw friendly(pErr);

    const { data: members, error: mErr } = await this.client
      .from('family_member')
      .select('family_id, nickname, role, family:family_id(id, name, join_code)')
      .eq('user_id', uid);
    if (mErr) throw friendly(mErr);

    const families = (members || [])
      .filter((m) => m.family)
      .map((m) => ({
        familyId: m.family_id,
        familyName: m.family.name,
        joinCode: m.family.join_code,
        role: m.role,
        nickname: m.nickname,
        family: { id: m.family_id, name: m.family.name, joinCode: m.family.join_code }
      }));

    if (!profile && families.length === 0) {
      this.session = null;
      return null;
    }

    const currentFamilyId = profile?.current_family_id
      || families[0]?.familyId
      || null;
    const curFm = families.find((f) => f.familyId === currentFamilyId);

    this.session = {
      userId: uid,
      nickname: curFm?.nickname || profile?.nickname || '',
      role: curFm?.role ?? 0,
      families,
      currentFamilyId,
      pushKey: profile?.push_key || '',
      mode: 'cloud'
    };
    return this.session;
  }

  getSession() {
    return this.session;
  }

  getCurrentFamilyId() {
    return this.session?.currentFamilyId || null;
  }

  getCurrentFamily() {
    const s = this.session;
    if (!s?.currentFamilyId) return null;
    return s.families.find((f) => f.familyId === s.currentFamilyId)?.family || null;
  }

  async listFamilies() {
    if (!this.session) return [];
    return this.session.families;
  }

  /* ---------- 家庭 ---------- */
  async createFamily({ name, nickname }) {
    const { data: code, error: cErr } = await this.client.rpc('generate_join_code');
    if (cErr) throw friendly(cErr);
    const famName = (name || '我家').trim().slice(0, 16);
    const { data: familyId, error } = await this.client.rpc('create_family', {
      p_name: famName,
      p_join_code: code,
      p_nickname: (nickname || '主厨').trim()
    });
    if (error) throw friendly(error);
    await this._loadSession();
    this._emit('session');
    return { familyId, familyName: famName, joinCode: code };
  }

  async joinFamily({ code, nickname, role }) {
    const { error } = await this.client.rpc('join_family', {
      p_code: (code || '').trim().toUpperCase(),
      p_nickname: (nickname || '').trim(),
      p_role: Number(role) === 1 ? 1 : 0
    });
    if (error) throw friendly(error);
    await this._loadSession();
    this._resubscribe();
    this._emit('session');
    return this.session;
  }

  async switchFamily(familyId) {
    const { error } = await this.client.rpc('switch_family', { p_family_id: familyId });
    if (error) throw friendly(error);
    if (this.session) {
      this.session.currentFamilyId = familyId;
      const curFm = this.session.families.find((f) => f.familyId === familyId);
      if (curFm) { this.session.role = curFm.role; this.session.nickname = curFm.nickname || this.session.nickname; }
    }
    this._resubscribe();
    this._emit('session');
    return this.session;
  }

  async leaveFamily(familyId) {
    const { error } = await this.client.rpc('leave_family', { p_family_id: familyId });
    if (error) throw friendly(error);
    await this._loadSession();
    this._resubscribe();
    this._emit('session');
  }

  async logout() {
    try { await this.client?.auth.signOut(); } catch (_) { /* ignore */ }
    this.session = null;
  }

  async updateProfile({ nickname, role }) {
    const s = this.session;
    if (!s) return null;
    if (nickname) {
      const { error } = await this.client.from('user_profiles')
        .update({ nickname: nickname.trim().slice(0, 12), updated_at: new Date().toISOString() })
        .eq('user_id', s.userId);
      if (error) throw friendly(error);
      s.nickname = nickname.trim().slice(0, 12);
    }
    // 昵称/角色按家庭存在 family_member 上
    if ((nickname || role !== undefined) && s.currentFamilyId) {
      const patch = {};
      if (nickname) patch.nickname = nickname.trim().slice(0, 12);
      if (role !== undefined) patch.role = Number(role);
      const { error } = await this.client.from('family_member')
        .update(patch)
        .eq('user_id', s.userId)
        .eq('family_id', s.currentFamilyId);
      if (error) throw friendly(error);
      const curFm = s.families.find((f) => f.familyId === s.currentFamilyId);
      if (curFm) Object.assign(curFm, patch);
      if (role !== undefined) s.role = Number(role);
    }
    this._emit('session');
    return s;
  }

  async setPushKey(key) {
    if (!this.session) return;
    const { error } = await this.client.from('user_profiles')
      .update({ push_key: key })
      .eq('user_id', this.session.userId);
    if (error) throw friendly(error);
    this.session.pushKey = key;
  }

  /* ---------- 菜品 ---------- */
  async listDishes() {
    const { data, error } = await this.client
      .from('dish')
      .select('*')
      .order('sort_no', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw friendly(error);
    return (data || []).map(mapDish);
  }

  async getDish(id) {
    const { data, error } = await this.client
      .from('dish')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw friendly(error);
    return mapDish(data);
  }

  async saveDish(payload) {
    const { data, error } = await this.client.rpc('save_dish', {
      p_id: payload.id || null,
      p_payload: {
        name: payload.name,
        category: payload.category,
        imageUrl: payload.mainImage || '',
        intro: payload.intro || '',
        prepMinutes: Number(payload.prepMinutes) || 0,
        cookingMinutes: Number(payload.cookMinutes) || 15,
        difficulty: payload.difficulty || '易',
        servingsPer: Number(payload.servings) || 2,
        allergens: payload.allergens || '无',
        status: payload.status || 'on',
        sortNo: payload.sortNo ?? 99,
        hasRecipe: payload.hasRecipe !== false,
        ingredients: payload.ingredients || [],
        seasonings: payload.seasonings || [],
        steps: payload.steps || []
      }
    });
    if (error) throw friendly(error);
    this._emit('dishes');
    return data;
  }

  // v2 菜谱就存在 dish 行内，保存时带上已有字段即可（save_dish 缺省保留原值）
  async saveRecipe(dishId, { ingredients, seasonings, steps }) {
    const { error } = await this.client.rpc('save_dish', {
      p_id: dishId,
      p_payload: {
        ingredients: ingredients || [],
        seasonings: seasonings || [],
        steps: steps || [],
        hasRecipe: (ingredients?.length || 0) > 0 && (steps?.length || 0) > 0
      }
    });
    if (error) throw friendly(error);
    this._emit('dishes');
  }

  async deleteDish(dishId) {
    const { error } = await this.client.from('dish').delete().eq('id', dishId);
    if (error) throw friendly(error);
    this._emit('dishes');
  }

  async uploadDishImage(file) {
    const uid = this.session?.userId || this._userId;
    const path = `${uid}/${Date.now()}-${(file.name || 'photo.jpg').replace(/[^\w.\-]/g, '')}`;
    const { error } = await this.client.storage.from('dish-images').upload(path, file, { upsert: true });
    if (error) throw friendly(error);
    const { data } = this.client.storage.from('dish-images').getPublicUrl(path);
    return data.publicUrl;
  }

  /* ---------- 订单 ---------- */
  async listOrders() {
    const s = this.session;
    if (!s?.currentFamilyId) return [];
    const { data, error } = await this.client
      .from('order_main')
      .select('*, order_item(*)')
      .eq('family_id', s.currentFamilyId)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw friendly(error);
    let orders = (data || []).map(mapOrder);
    // 与演示模式一致：厨师看全家庭，家人只看自己
    if (s.role !== 1) orders = orders.filter((o) => o.userId === s.userId);
    return orders;
  }

  async createOrder(items, note) {
    const { data, error } = await this.client.rpc('create_order', {
      p_items: items.map((i) => ({
        dishId: i.dishId,
        dishName: i.name || i.dishName || '',
        dishImage: i.image || i.dishImage || '',
        servings: i.servings,
        note: i.note || ''
      })),
      p_note: note || ''
    });
    if (error) throw friendly(error);
    this._emit('orders');
    return data;
  }

  async cancelOrder(orderId) {
    const { error } = await this.client.rpc('cancel_order', { p_order_id: orderId });
    if (error) throw friendly(error);
    this._emit('orders');
  }

  async updateItemStatus(itemId, status) {
    const { error } = await this.client.rpc('update_item_status', { p_item_id: itemId, p_status: status });
    if (error) throw friendly(error);
    this._emit('orders');
  }

  async bulkUpdateDish(dishId, status) {
    const familyId = this.session?.currentFamilyId;
    if (!familyId) return;
    const { error } = await this.client.rpc('bulk_update_dish', {
      p_family_id: familyId,
      p_dish_id: dishId,
      p_status: status
    });
    if (error) throw friendly(error);
    this._emit('orders');
  }

  // 兼容旧接口名
  async updateDishStatus(dishId, status) {
    return this.bulkUpdateDish(dishId, status);
  }

  /* ---------- 实时 ---------- */
  _emit(type, extra = {}) {
    this._listeners.forEach((fn) => { try { fn({ type, ...extra }); } catch (_) { /* ignore */ } });
  }

  _resubscribe() {
    if (this._channel) {
      try { this.client.removeChannel(this._channel); } catch (_) { /* ignore */ }
      this._channel = null;
    }
    const familyId = this.session?.currentFamilyId;
    if (!familyId || this._listeners.size === 0) return;
    this._channel = this.client
      .channel(`family-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_main', filter: `family_id=eq.${familyId}` }, () => this._emit('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter: `family_id=eq.${familyId}` }, () => this._emit('orders'))
      .subscribe();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    if (!this._channel) this._resubscribe();
    return () => this._listeners.delete(fn);
  }
}

/** 从配置或本机缓存里读 Supabase 连接信息 */
export function readSupabaseConfig() {
  const cfg = window.APP_CONFIG || {};
  let local = {};
  try { local = JSON.parse(localStorage.getItem('fm_sb_config') || '{}'); } catch (_) { /* ignore */ }
  const url = local.url || cfg.SUPABASE_URL || '';
  const key = local.key || cfg.SUPABASE_ANON_KEY || '';
  return { url: url.trim(), key: key.trim() };
}

export function saveSupabaseConfig(url, key) {
  localStorage.setItem('fm_sb_config', JSON.stringify({ url: url.trim(), key: key.trim() }));
}

export async function testConnection(url, key) {
  const createClient = await loadSupabase();
  const client = createClient(url, key);
  const { error } = await client.from('family').select('id').limit(1);
  if (error) throw friendly(error);
  return true;
}

export function seedForSql() {
  return seedDishes;
}
