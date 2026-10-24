/** Supabase 云模式 v2：多家庭（私厨服务多家），多台手机实时同步 */
import { seedDishes } from './seed.js';

let createClientFn = null;
// 本地内置 supabase-js（UMD），不再依赖 jsDelivr：国内手机网络常把 CDN 重置，
// 一旦 CDN 加载失败就会静默降级成演示模式，表现为「厨师端进不去/看不到家人订单」
function loadLocalSupabase() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase.createClient);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/supabase.js', import.meta.url).href;
    s.onload = () => {
      if (window.supabase?.createClient) resolve(window.supabase.createClient);
      else reject(new Error('supabase 本地文件异常：没有找到 createClient'));
    };
    s.onerror = () => reject(new Error('本地 supabase.js 加载失败，请检查 assets/js/vendor/supabase.js'));
    document.head.appendChild(s);
  });
}

async function loadSupabase() {
  if (createClientFn) return createClientFn;
  createClientFn = await loadLocalSupabase();
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

/* 家庭码：6 位，去掉易混淆的 0/O/1/I，客户端本地生成，撞码时重试 */
function genJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function friendly(error) {
  const raw = String(error?.message || error || '未知错误');
  if (/anonymous.*disabled/i.test(raw)) {
    return new Error('Supabase 未开启匿名登录：请在 Authentication → Sign In / Providers 打开 Anonymous sign-ins');
  }
  if (/invalid.*api.?key/i.test(raw)) return new Error('Supabase URL 或 anon key 不正确');
  // 匿名会话过期/未带 token 时，服务端 auth.uid() 为空，写家庭成员会撞 not-null 约束
  if (/jwt expired|invalid jwt/i.test(raw)) return new Error('登录状态已过期，请刷新页面重新进入家宴');
  if (/null value in column .*user_id|23502/i.test(raw)) return new Error('登录状态失效，请刷新页面重新进入家宴');
  if (/家庭码/.test(raw)) return new Error('家庭码不正确，请核对家庭群里的 6 位码');
  if (/avatar/i.test(raw) && /(column|schema cache|PGRST204|42703)/i.test(raw)) {
    return new Error('数据库缺少头像字段：请先在 SQL Editor 执行 supabase/avatar.sql');
  }
  if (/row-level security|permission denied/i.test(raw)) return new Error('权限不足：请确认 SQL 脚本里的 RLS 已执行，或当前账号是厨师');
  if (/does not exist|relation .* not found/i.test(raw)) return new Error('数据库还没有建表：请先在 SQL Editor 执行 supabase/schema.sql');
  if (/could not find the function/i.test(raw)) return new Error('数据库缺少函数：请先在 SQL Editor 执行 supabase/schema.sql');
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
    this._reviewChannel = null;
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
    // 本地可能存着过期的匿名会话（匿名 JWT 1 小时就过期）。
    // 拿过期 token 调 RPC 会被 PostgREST 当成未登录，服务端 auth.uid() 为空，
    // join_family 就会报 user_id 不能为 null —— 手机端「进不去」多半是这一步
    const expMs = session?.expires_at ? session.expires_at * 1000 : 0;
    if (session && expMs && expMs - Date.now() < 60_000) {
      const { data: refreshed } = await this.client.auth.refreshSession();
      session = refreshed?.session || null;
    }
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

    // 注意：注册触发器会给每个匿名用户自动建 user_profiles 行，
    // 所以「有 profile」不代表已经进过家宴。只有真正属于某个家庭才算已登录，
    // 否则会被当成已登录直接进菜单页，永远回不到填家庭码的入口（厨师端也就进不去）
    if (families.length === 0) {
      this.session = null;
      return null;
    }

    // current_family_id 可能指向已删除/已退出的家庭，必须校验，否则角色会回落成家人进不去厨师端
    const savedFamilyId = profile?.current_family_id;
    const currentFamilyId = (savedFamilyId && families.some((f) => f.familyId === savedFamilyId))
      ? savedFamilyId
      : (families[0]?.familyId || null);
    const curFm = families.find((f) => f.familyId === currentFamilyId);

    this.session = {
      userId: uid,
      nickname: curFm?.nickname || profile?.nickname || '',
      role: curFm?.role ?? 0,
      families,
      currentFamilyId,
      pushKey: profile?.push_key || '',
      avatar: profile?.avatar || '',
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

  // 家庭成员头像（需先执行 supabase/avatar-share.sql；未执行时静默返回空）
  async listFamilyAvatars() {
    const fid = this.getCurrentFamilyId();
    if (!fid) return [];
    const { data, error } = await this.client.rpc('family_avatars', { p_family_id: fid });
    if (error) {
      if (/could not find the function|does not exist|PGRST202/i.test(error.message || '')) return [];
      throw friendly(error);
    }
    return (data || []).map((m) => ({
      userId: m.user_id,
      nickname: m.nickname || '',
      role: m.role ?? 0,
      avatar: m.avatar || ''
    }));
  }

  // 上传自定义头像：前端已裁成方形 JPEG，这里只负责存文件并回写 URL
  async uploadAvatar(blob) {
    if (!this.session) throw new Error('请先进入家宴');
    const path = `${this._userId}/avatar.jpg`;
    const { error } = await this.client.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' });
    if (error) {
      const msg = String(error.message || '');
      if (/bucket not found/i.test(msg)) {
        throw new Error('还没有 avatars 存储桶：请先执行 supabase/avatar-upload.sql');
      }
      if (/row-level security|not authorized|permission/i.test(msg)) {
        throw new Error('没有上传权限：请确认 avatar-upload.sql 里的 Storage 策略已执行');
      }
      throw new Error(msg || '头像上传失败');
    }
    const { data } = this.client.storage.from('avatars').getPublicUrl(path);
    await this.updateProfile({ avatar: `${data.publicUrl}?v=${Date.now()}` });
    return this.session?.avatar || '';
  }

  /* ---------- 家庭 ---------- */
  async createFamily({ name, nickname }) {
    const famName = (name || '我家').trim().slice(0, 16);
    const nick = (nickname || '主厨').trim().slice(0, 12);
    // 6 位家庭码本地生成；撞码（唯一约束冲突）时换码重试，最多 5 次
    let code = '';
    let familyId = null;
    let error = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = genJoinCode();
      // 注意：create_family 只有 p_name / p_join_code 两个参数，
      // 多传 p_nickname 会被 PostgREST 判为函数不存在（404）
      const res = await this.client.rpc('create_family', {
        p_name: famName,
        p_join_code: code
      });
      familyId = res.data;
      error = res.error;
      if (!error) break;
      if (!/duplicate|unique/i.test(error.message || '')) throw friendly(error);
    }
    if (error) throw friendly(error);
    // create_family 里昵称先写成家庭名，这里改成本人昵称
    if (familyId && nick) {
      await this.client
        .from('family_member')
        .update({ nickname: nick })
        .eq('user_id', this._userId)
        .eq('family_id', familyId);
    }
    await this._loadSession();
    this._emit('session');
    return { familyId, familyName: famName, joinCode: code };
  }

  async joinFamily({ code, nickname, role }) {
    const wanted = Number(role) === 1 ? 1 : 0;
    const { error } = await this.client.rpc('join_family', {
      p_code: (code || '').trim().toUpperCase(),
      p_nickname: (nickname || '').trim(),
      p_role: wanted
    });
    if (error) throw friendly(error);
    await this._loadSession();
    // 服务端 join_family 对已加入的家庭是 do nothing，角色不会更新，
    // 所以这里按本次选择强制同步角色（否则选「我掌勺」也会被当成家人，厨师端进不去）
    if (this.session?.currentFamilyId && this.session.role !== wanted) {
      const { error: rErr } = await this.client
        .from('family_member')
        .update({ role: wanted })
        .eq('user_id', this.session.userId)
        .eq('family_id', this.session.currentFamilyId);
      if (rErr) throw friendly(rErr);
      this.session.role = wanted;
      const curFm = this.session.families.find((f) => f.familyId === this.session.currentFamilyId);
      if (curFm) curFm.role = wanted;
    }
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

  async updateProfile({ nickname, role, avatar }) {
    const s = this.session;
    if (!s) return null;
    if (nickname) {
      const { error } = await this.client.from('user_profiles')
        .update({ nickname: nickname.trim().slice(0, 12), updated_at: new Date().toISOString() })
        .eq('user_id', s.userId);
      if (error) throw friendly(error);
      s.nickname = nickname.trim().slice(0, 12);
    }
    if (avatar !== undefined) {
      const next = String(avatar || '').slice(0, 512);
      const { error } = await this.client.from('user_profiles')
        .update({ avatar: next, updated_at: new Date().toISOString() })
        .eq('user_id', s.userId);
      if (error) throw friendly(error);
      s.avatar = next;
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
    // 直写 dish 表（线上未部署 save_dish RPC；dish_write 策略允许本人读写自己的菜）
    const row = {
      name: payload.name,
      category: payload.category,
      image_url: payload.mainImage || '',
      intro: payload.intro || '',
      prep_minutes: Number(payload.prepMinutes) || 0,
      cooking_minutes: Number(payload.cookMinutes) || 15,
      difficulty: payload.difficulty || '易',
      servings_per: Number(payload.servings) || 2,
      allergens: payload.allergens || '无',
      status: payload.status || 'on',
      sort_no: payload.sortNo ?? 99,
      has_recipe: payload.hasRecipe !== false,
      ingredients: payload.ingredients || [],
      seasonings: payload.seasonings || [],
      steps: payload.steps || [],
      updated_at: new Date().toISOString()
    };
    if (payload.id) {
      // 带 select 才能知道是否真的更新到行（不是创建者时 RLS 会静默更新 0 行）
      const { data, error } = await this.client.from('dish').update(row).eq('id', payload.id).select('id');
      if (error) throw friendly(error);
      if (!data || data.length === 0) throw new Error('没改成：这道菜不是你的账号创建的');
      this._emit('dishes');
      return payload.id;
    }
    row.created_by = this.session?.userId || this._userId;
    const { data, error } = await this.client.from('dish').insert(row).select('id').single();
    if (error) throw friendly(error);
    this._emit('dishes');
    return data.id;
  }

  // v2 菜谱就存在 dish 行内，缺省字段不动
  async saveRecipe(dishId, { ingredients, seasonings, steps }) {
    const { error } = await this.client.from('dish').update({
      ingredients: ingredients || [],
      seasonings: seasonings || [],
      steps: steps || [],
      has_recipe: (ingredients?.length || 0) > 0 && (steps?.length || 0) > 0,
      updated_at: new Date().toISOString()
    }).eq('id', dishId);
    if (error) throw friendly(error);
    this._emit('dishes');
  }

  async deleteDish(dishId) {
    // 带 select 才能知道是否真的删掉了（不是创建者时 RLS 会静默删 0 行）
    const { data, error } = await this.client.from('dish').delete().eq('id', dishId).select('id');
    if (error) throw friendly(error);
    if (!data || data.length === 0) throw new Error('没删掉：这道菜不是你的账号创建的');
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
    // 直写代替 cancel_order RPC（线上未部署）：明细有非 pending 的说明厨师已开工
    const { data: items, error: qErr } = await this.client
      .from('order_item').select('status').eq('order_id', orderId);
    if (qErr) throw friendly(qErr);
    if ((items || []).some((i) => i.status !== 'pending' && i.status !== 'cancelled')) {
      throw new Error('厨师已经开始做了，撤不回啦');
    }
    // RLS：只有本人且仍是 pending 的单能改（他人/已接单的单会更新 0 行）
    const { data: updated, error: mErr } = await this.client
      .from('order_main')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select('id');
    if (mErr) throw friendly(mErr);
    if (!updated || updated.length === 0) throw new Error('订单不存在或已被处理，刷新看看');
    const { error: iErr } = await this.client
      .from('order_item').update({ status: 'cancelled' }).eq('order_id', orderId);
    if (iErr) throw friendly(iErr);
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

  /* ---------- 好评 ---------- */
  async reviewContext() {
    const familyId = this.session?.currentFamilyId;
    if (!familyId) return null;
    const { data, error } = await this.client.rpc('review_context', { p_family_id: familyId });
    if (error) throw friendly(error);
    return data || null;
  }

  async submitReview({ rating, tags = [], comment = '', isAnonymous = false, feedback = [] }) {
    const familyId = this.session?.currentFamilyId;
    if (!familyId) throw new Error('请先加入或选择家庭');
    const { data, error } = await this.client.rpc('submit_review', {
      p_family_id: familyId,
      p_rating: Number(rating),
      p_tags: tags,
      p_comment: comment || '',
      p_is_anonymous: !!isAnonymous,
      p_feedback: feedback || []
    });
    if (error) throw friendly(error);
    this._emit('reviews');
    return data;
  }

  async closeMealSession() {
    const familyId = this.session?.currentFamilyId;
    if (!familyId) return;
    const { error } = await this.client.rpc('close_meal_session', { p_family_id: familyId });
    if (error) throw friendly(error);
    this._emit('reviews');
  }

  async reopenMealSession() {
    const familyId = this.session?.currentFamilyId;
    if (!familyId) return;
    const { error } = await this.client.rpc('reopen_meal_session', { p_family_id: familyId });
    if (error) throw friendly(error);
    this._emit('reviews');
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
    // 好评走独立频道：review.sql 还没执行时，也不影响订单的实时订阅
    if (this._reviewChannel) {
      try { this.client.removeChannel(this._reviewChannel); } catch (_) { /* ignore */ }
      this._reviewChannel = null;
    }
    const familyId = this.session?.currentFamilyId;
    if (!familyId || this._listeners.size === 0) return;
    this._channel = this.client
      .channel(`family-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_main', filter: `family_id=eq.${familyId}` }, () => this._emit('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter: `family_id=eq.${familyId}` }, () => this._emit('orders'))
      .subscribe();
    this._reviewChannel = this.client
      .channel(`review-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review', filter: `family_id=eq.${familyId}` }, () => this._emit('reviews'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_feedback', filter: `family_id=eq.${familyId}` }, () => this._emit('reviews'))
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
