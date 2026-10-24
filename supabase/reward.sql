-- ============================================================================
-- 家宴 · 家庭奖励机制（米粒）
--
-- 只奖励不惩罚；做饭权重最高；米粒必须能花（免洗金牌）。
-- 所有发币都在数据库内完成（RPC / 触发器），客户端无法自己加米粒。
-- 可重复执行。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 规则 / 流水 / 勋章 / 商城 / 非酋连续
-- ---------------------------------------------------------------------------
create table if not exists public.point_rules (
  reason text primary key,
  amount int not null,
  daily_cap int not null default 1,   -- 每天最多拿「amount * daily_cap」
  note text not null default ''
);

insert into public.point_rules (reason, amount, daily_cap, note) values
  ('cook',        30, 2,  '完成一餐 👨‍🍳'),
  ('wash',        20, 2,  '洗碗完成 🧼'),
  ('order',        2, 5,  '点了一道菜 🍽'),
  ('first_order',  5, 1,  '本餐开胃先锋 🥇'),
  ('review',       5, 1,  '提交了好评 🌸'),
  ('comment',      3, 1,  '写了夸夸 ✍'),
  ('dish_like',    1, 5,  '给菜点了 ❤'),
  ('dish_liked',   2, 10, '做的菜被点赞 🍳'),
  ('unlucky',      8, 1,  '非酋安慰奖 😭')
on conflict (reason) do update set
  amount = excluded.amount, daily_cap = excluded.daily_cap, note = excluded.note;

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null default '',
  amount int not null,                 -- 正=获得，负=消费
  reason text not null,                -- cook / wash / order / ... / shop
  ref_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_family on public.point_ledger (family_id, created_at desc);
create index if not exists idx_ledger_user on public.point_ledger (family_id, user_id, created_at desc);

create or replace view public.point_balance
with (security_invoker = true) as
select
  family_id,
  user_id,
  sum(amount) as total,
  sum(amount) filter (where amount > 0
    and created_at >= date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai') as this_month,
  count(*) filter (where reason = 'cook') as cooks,
  count(*) filter (where reason = 'wash') as washes,
  count(*) filter (where reason = 'review') as reviews
from public.point_ledger
group by family_id, user_id;

create table if not exists public.badge_defs (
  code text primary key,
  name text not null,
  emoji text not null,
  description text not null default '',
  rarity text not null default 'common',
  sort_no int not null default 99
);

insert into public.badge_defs (code, name, emoji, description, rarity, sort_no) values
  ('starter',       '开胃先锋',   '🌱', '本餐第一个点菜 ×5 次', 'common', 1),
  ('big_order',     '点菜达人',   '🍽', '单餐点 8 道以上', 'common', 2),
  ('comment_angel', '好评天使',   '❤', '累计写 10 条夸夸', 'common', 3),
  ('cook_master',   '家庭大厨',   '👨‍🍳', '累计做饭 10 次', 'rare', 4),
  ('wash_master',   '洗碗劳模',   '🧼', '累计洗碗 10 次', 'rare', 5),
  ('unlucky_king',  '非酋本酋',   '😭', '连续两次抽到洗碗', 'rare', 6),
  ('rice_rich',     '米仓富翁',   '🍚', '累计获得 500 米粒', 'rare', 7)
on conflict (code) do update set
  name = excluded.name, emoji = excluded.emoji, description = excluded.description,
  rarity = excluded.rarity, sort_no = excluded.sort_no;

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null default '',
  badge_code text not null references public.badge_defs (code) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (family_id, user_id, badge_code)
);
create index if not exists idx_badges_family on public.user_badges (family_id, user_id);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_code text not null default 'immunity',
  cost int not null default 50,
  status text not null default 'held' check (status in ('held', 'used', 'expired')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_shop_hold on public.shop_orders (family_id, user_id, status);

create table if not exists public.unlucky_streak (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  streak int not null default 0,
  updated_at timestamptz not null default now(),
  unique (family_id, user_id)
);

-- 骰子局：抽中者 / 实际洗碗人 / 金牌 / 打卡
alter table public.dice_game add column if not exists actual_washer uuid;
alter table public.dice_game add column if not exists immunity_used boolean not null default false;
alter table public.dice_game add column if not exists washed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. RLS：全家可读榜单，写入只走函数
-- ---------------------------------------------------------------------------
alter table public.point_ledger enable row level security;
alter table public.user_badges enable row level security;
alter table public.shop_orders enable row level security;
alter table public.unlucky_streak enable row level security;

drop policy if exists ledger_read on public.point_ledger;
create policy ledger_read on public.point_ledger for select
  using (public.belongs_to_family(family_id));

drop policy if exists badges_read on public.user_badges;
create policy badges_read on public.user_badges for select
  using (public.belongs_to_family(family_id));

drop policy if exists shop_read on public.shop_orders;
create policy shop_read on public.shop_orders for select
  using (user_id = auth.uid() and public.belongs_to_family(family_id));

drop policy if exists streak_read on public.unlucky_streak;
create policy streak_read on public.unlucky_streak for select
  using (public.belongs_to_family(family_id));

-- ---------------------------------------------------------------------------
-- 3. 勋章检查
-- ---------------------------------------------------------------------------
create or replace function public.check_badges(p_family_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nick text;
  v_total int;
  v_first int;
  v_cook int;
  v_wash int;
  v_comment int;
  v_big int;
begin
  if not exists (
    select 1 from public.family_member where family_id = p_family_id and user_id = p_user_id
  ) then
    return;
  end if;

  select coalesce(nickname, '家人') into v_nick
  from public.family_member where family_id = p_family_id and user_id = p_user_id;

  select
    coalesce(sum(amount) filter (where amount > 0), 0),
    count(*) filter (where reason = 'first_order'),
    count(*) filter (where reason = 'cook'),
    count(*) filter (where reason = 'wash'),
    count(*) filter (where reason = 'comment')
  into v_total, v_first, v_cook, v_wash, v_comment
  from public.point_ledger
  where family_id = p_family_id and user_id = p_user_id;

  select count(*) into v_big from (
    select om.id
    from public.order_main om
    join public.order_item oi on oi.order_id = om.id
    where om.family_id = p_family_id and om.user_id = p_user_id
    group by om.id
    having count(*) >= 8
  ) t;

  if v_first >= 5 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'starter')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
  if v_big >= 1 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'big_order')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
  if v_comment >= 10 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'comment_angel')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
  if v_cook >= 10 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'cook_master')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
  if v_wash >= 10 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'wash_master')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
  if v_total >= 500 then
    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (p_family_id, p_user_id, v_nick, 'rice_rich')
    on conflict (family_id, user_id, badge_code) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 发米粒（带每日上限）
-- ---------------------------------------------------------------------------
create or replace function public.award_points(
  p_family_id uuid,
  p_user_id uuid,
  p_reason text,
  p_ref_id uuid default null,
  p_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.point_rules;
  v_earned int;
  v_nick text;
  v_day timestamptz;
begin
  select * into r from public.point_rules where reason = p_reason;
  if not found or p_user_id is null then return 0; end if;

  v_day := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  select coalesce(sum(amount), 0) into v_earned
  from public.point_ledger
  where family_id = p_family_id and user_id = p_user_id
    and reason = p_reason and created_at >= v_day;

  if v_earned + r.amount > r.amount * r.daily_cap then return 0; end if;

  select coalesce(nickname, '家人') into v_nick
  from public.family_member where family_id = p_family_id and user_id = p_user_id;

  insert into public.point_ledger (family_id, user_id, nickname, amount, reason, ref_id, note)
  values (p_family_id, p_user_id, coalesce(v_nick, '家人'), r.amount, p_reason, p_ref_id,
          coalesce(p_note, r.note));

  perform public.check_badges(p_family_id, p_user_id);
  return r.amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 埋点：点菜 / 好评 / 做饭 / 骰子
-- ---------------------------------------------------------------------------
-- 5.1 下第一单 + 每道菜
create or replace function public.reward_on_order_main()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_today int;
begin
  select count(*) into v_today
  from public.order_main
  where family_id = new.family_id
    and id <> new.id
    and (created_at at time zone 'Asia/Shanghai')::date = (now() at time zone 'Asia/Shanghai')::date;

  if v_today = 0 then
    perform public.award_points(new.family_id, new.user_id, 'first_order', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reward_order_main on public.order_main;
create trigger trg_reward_order_main
  after insert on public.order_main
  for each row execute function public.reward_on_order_main();

create or replace function public.reward_on_order_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
begin
  select user_id into v_uid from public.order_main where id = new.order_id;
  if v_uid is not null then
    perform public.award_points(new.family_id, v_uid, 'order', new.order_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reward_order_item on public.order_item;
create trigger trg_reward_order_item
  after insert on public.order_item
  for each row execute function public.reward_on_order_item();

-- 5.2 好评 + 夸夸 + 逐菜点赞
create or replace function public.reward_on_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_points(new.family_id, new.user_id, 'review', new.id);
  if char_length(trim(coalesce(new.comment, ''))) > 5 then
    perform public.award_points(new.family_id, new.user_id, 'comment', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reward_review on public.review;
create trigger trg_reward_review
  after insert on public.review
  for each row execute function public.reward_on_review();

create or replace function public.reward_on_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_chef uuid;
begin
  if not coalesce(new.liked, false) then return new; end if;
  perform public.award_points(new.family_id, new.user_id, 'dish_like', new.id);

  if new.dish_id is not null then
    select created_by into v_chef from public.dish where id = new.dish_id;
    -- 菜品是跨家庭共享的，只给「本家庭成员」计分，避免把别家厨师算进本家榜单
    if v_chef is not null and v_chef <> new.user_id
       and exists (
         select 1 from public.family_member
         where family_id = new.family_id and user_id = v_chef
       ) then
      perform public.award_points(new.family_id, v_chef, 'dish_liked', new.id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reward_feedback on public.dish_feedback;
create trigger trg_reward_feedback
  after insert on public.dish_feedback
  for each row execute function public.reward_on_feedback();

-- 5.3 关席：+30（做饭的人拿最多）
create or replace function public.reward_on_meal_close()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- 当天没有点单就不算做了一餐，避免空关席刷米粒
  if not exists (
    select 1 from public.order_main
    where family_id = new.family_id
      and (created_at at time zone 'Asia/Shanghai')::date = (now() at time zone 'Asia/Shanghai')::date
  ) then
    return new;
  end if;

  if not exists (
    select 1 from public.family_member where family_id = new.family_id and user_id = v_uid
  ) then
    select created_by into v_uid from public.family where id = new.family_id;
  end if;
  perform public.award_points(new.family_id, v_uid, 'cook', new.id);
  return new;
end;
$$;
drop trigger if exists trg_reward_meal_close on public.meal_session;
create trigger trg_reward_meal_close
  after update on public.meal_session
  for each row
  when (old.status = 'open' and new.status = 'closed')
  execute function public.reward_on_meal_close();

-- 5.4 骰子揭晓：补实际洗碗人 + 非酋连续判定
create or replace function public.dice_fill_washer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'revealed' and old.status <> 'revealed' and new.actual_washer is null then
    new.actual_washer := new.loser_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dice_fill_washer on public.dice_game;
create trigger trg_dice_fill_washer
  before update on public.dice_game
  for each row execute function public.dice_fill_washer();

create or replace function public.reward_on_dice_reveal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_streak int;
  v_nick text;
begin
  if new.status <> 'revealed' or old.status = 'revealed' or new.loser_id is null then
    return new;
  end if;

  -- 没抽中的人，连续断了
  update public.unlucky_streak
  set streak = 0, updated_at = now()
  where family_id = new.family_id
    and user_id = any(new.participants)
    and user_id <> new.loser_id;

  insert into public.unlucky_streak (family_id, user_id, streak, updated_at)
  values (new.family_id, new.loser_id, 1, now())
  on conflict (family_id, user_id) do update
    set streak = public.unlucky_streak.streak + 1, updated_at = now()
  returning streak into v_streak;

  if v_streak >= 2 then
    select coalesce(nickname, '家人') into v_nick
    from public.family_member where family_id = new.family_id and user_id = new.loser_id;

    insert into public.user_badges (family_id, user_id, nickname, badge_code)
    values (new.family_id, new.loser_id, coalesce(v_nick, '家人'), 'unlucky_king')
    on conflict (family_id, user_id, badge_code) do nothing;

    perform public.award_points(new.family_id, new.loser_id, 'unlucky', new.id);

    update public.unlucky_streak
    set streak = 0, updated_at = now()
    where family_id = new.family_id and user_id = new.loser_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reward_dice_reveal on public.dice_game;
create trigger trg_reward_dice_reveal
  after update on public.dice_game
  for each row execute function public.reward_on_dice_reveal();

-- ---------------------------------------------------------------------------
-- 6. 洗碗打卡 / 免洗金牌
-- ---------------------------------------------------------------------------
create or replace function public.wash_checkin(p_game_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  g public.dice_game;
  v_washer uuid;
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.status <> 'revealed' then raise exception '还没揭晓，不能打卡'; end if;
  if g.washed_at is not null then raise exception '今晚已经打过卡了'; end if;

  v_washer := coalesce(g.actual_washer, g.loser_id);
  if auth.uid() <> v_washer then
    raise exception '只有今晚洗碗的人可以打卡';
  end if;

  update public.dice_game
  set washed_at = now(), updated_at = now()
  where id = g.id;

  return public.award_points(g.family_id, v_washer, 'wash', g.id);
end;
$$;

create or replace function public.buy_immunity(p_family_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_nick text;
  v_id uuid;
begin
  if not public.belongs_to_family(p_family_id) then raise exception '你不在这个家庭'; end if;

  select coalesce(sum(amount), 0) into v_total
  from public.point_ledger where family_id = p_family_id and user_id = v_uid;
  if v_total < 50 then
    raise exception '米粒不够，还差 % 🍚', 50 - v_total;
  end if;

  select coalesce(nickname, '家人') into v_nick
  from public.family_member where family_id = p_family_id and user_id = v_uid;

  insert into public.point_ledger (family_id, user_id, nickname, amount, reason, note)
  values (p_family_id, v_uid, coalesce(v_nick, '家人'), -50, 'shop', '买 免洗金牌 🎲');

  insert into public.shop_orders (family_id, user_id, item_code, cost, status)
  values (p_family_id, v_uid, 'immunity', 50, 'held')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.use_immunity(p_game_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g public.dice_game;
  v_uid uuid := auth.uid();
  v_second uuid;
  v_card uuid;
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.status <> 'revealed' then raise exception '揭晓后才能用金牌'; end if;
  if g.loser_id <> v_uid then raise exception '只有抽中洗碗的人能用金牌'; end if;
  if g.immunity_used then raise exception '这一局已经用过金牌了'; end if;
  if g.washed_at is not null then raise exception '已经洗完了，金牌用不上'; end if;
  if now() > g.updated_at + interval '60 seconds' then
    raise exception '金牌要在揭晓后 60 秒内使用，这一局超时了';
  end if;

  select id into v_card from public.shop_orders
  where family_id = g.family_id and user_id = v_uid
    and item_code = 'immunity' and status = 'held'
  order by created_at limit 1;
  if v_card is null then raise exception '你还没有免洗金牌，先去米粒商城买一张'; end if;

  -- 第二名接手：最大洗碗取第二高，最小洗碗取第二小
  select r.user_id into v_second
  from public.dice_roll r
  where r.game_id = g.id
    and r.round = g.round
    and r.user_id <> g.loser_id
    and r.value = (
      select case when g.rule = 'max_lose' then max(value) else min(value) end
      from public.dice_roll
      where game_id = g.id and round = g.round and user_id <> g.loser_id
    )
  limit 1;

  if v_second is null then raise exception '没有第二名可以接手，金牌用不了'; end if;

  update public.dice_game
  set actual_washer = v_second, immunity_used = true, updated_at = now()
  where id = g.id;

  update public.shop_orders set status = 'used', used_at = now() where id = v_card;

  return v_second;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 米粒页数据（余额 + 勋章 + 商城 + 榜单 + 流水）
-- ---------------------------------------------------------------------------
create or replace function public.rewards_home(p_family_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nick text;
  v_total int := 0;
  v_month int := 0;
  v_cooks int := 0;
  v_washes int := 0;
  v_reviews int := 0;
  v_cards int := 0;
  v_badges jsonb;
  v_board jsonb;
  v_improve jsonb;
  v_hall jsonb;
  v_ledger jsonb;
begin
  if not public.belongs_to_family(p_family_id) then raise exception '你不在这个家庭'; end if;

  select nickname into v_nick
  from public.family_member where family_id = p_family_id and user_id = v_uid;

  select coalesce(max(total), 0), coalesce(max(this_month), 0), coalesce(max(cooks), 0),
         coalesce(max(washes), 0), coalesce(max(reviews), 0)
  into v_total, v_month, v_cooks, v_washes, v_reviews
  from public.point_balance
  where family_id = p_family_id and user_id = v_uid;

  select count(*) into v_cards
  from public.shop_orders
  where family_id = p_family_id and user_id = v_uid
    and item_code = 'immunity' and status = 'held';

  select jsonb_agg(jsonb_build_object(
      'code', d.code, 'name', d.name, 'emoji', d.emoji,
      'description', d.description, 'rarity', d.rarity,
      'earned', ub.badge_code is not null
    ) order by d.sort_no)
  into v_badges
  from public.badge_defs d
  left join public.user_badges ub
    on ub.badge_code = d.code and ub.family_id = p_family_id and ub.user_id = v_uid;

  with ranked as (
    select
      b.user_id,
      coalesce(fm.nickname, '家人') as nickname,
      coalesce(up.avatar, '') as avatar,
      b.total, b.this_month, b.cooks, b.washes, b.reviews
    from public.point_balance b
    join public.family_member fm
      on fm.family_id = b.family_id and fm.user_id = b.user_id
    left join public.user_profiles up on up.user_id = b.user_id
    where b.family_id = p_family_id
    order by b.this_month desc, b.total desc
    limit 10
  )
  select jsonb_agg(jsonb_build_object(
      'userId', r.user_id, 'nickname', r.nickname, 'avatar', r.avatar,
      'total', r.total, 'thisMonth', r.this_month,
      'cooks', r.cooks, 'washes', r.washes, 'reviews', r.reviews
    ) order by r.this_month desc, r.total desc)
  into v_board
  from ranked r;

  with wk as (
    select
      user_id,
      coalesce(sum(amount) filter (
        where created_at >= date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
      ), 0) as this_wk,
      coalesce(sum(amount) filter (
        where created_at >= date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai' - interval '7 days'
          and created_at < date_trunc('week', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
      ), 0) as last_wk
    from public.point_ledger
    where family_id = p_family_id
    group by user_id
  )
  select jsonb_build_object(
      'nickname', coalesce(fm.nickname, '家人'),
      'delta', wk.this_wk - wk.last_wk,
      'thisWeek', wk.this_wk
    )
  into v_improve
  from wk
  left join public.family_member fm
    on fm.family_id = p_family_id and fm.user_id = wk.user_id
  order by (wk.this_wk - wk.last_wk) desc
  limit 1;

  select jsonb_agg(jsonb_build_object(
      'userId', s.user_id,
      'nickname', coalesce(fm.nickname, '家人'),
      'streak', s.streak
    ))
  into v_hall
  from public.unlucky_streak s
  left join public.family_member fm
    on fm.family_id = s.family_id and fm.user_id = s.user_id
  where s.family_id = p_family_id and s.streak > 0;

  select jsonb_agg(jsonb_build_object(
      'amount', l.amount, 'reason', l.reason, 'note', l.note, 'createdAt', l.created_at
    ) order by l.created_at desc)
  into v_ledger
  from (
    select amount, reason, note, created_at
    from public.point_ledger
    where family_id = p_family_id and user_id = v_uid
    order by created_at desc
    limit 20
  ) l;

  return jsonb_build_object(
    'me', jsonb_build_object(
      'userId', v_uid,
      'nickname', coalesce(v_nick, '家人'),
      'total', v_total,
      'thisMonth', v_month,
      'cooks', v_cooks,
      'washes', v_washes,
      'reviews', v_reviews,
      'cards', v_cards
    ),
    'badges', coalesce(v_badges, '[]'::jsonb),
    'leaderboard', coalesce(v_board, '[]'::jsonb),
    'improve', v_improve,
    'unluckyHall', coalesce(v_hall, '[]'::jsonb),
    'ledger', coalesce(v_ledger, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 骰子上下文补充：实际洗碗人 / 金牌 / 打卡
-- ---------------------------------------------------------------------------
create or replace function public.dice_context(p_family_id uuid)
returns jsonb
language plpgsql security definer
stable
set search_path = public
as $$
declare
  g public.dice_game;
  parts jsonb;
  rolls jsonb;
begin
  if not public.belongs_to_family(p_family_id) then raise exception '你不在这个家庭'; end if;

  select * into g
  from public.dice_game
  where family_id = p_family_id and status in ('joining', 'rolling', 'revealed')
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('game', null);
  end if;

  select jsonb_agg(jsonb_build_object(
      'userId', p.user_id,
      'nickname', fm.nickname,
      'avatar', coalesce(up.avatar, ''),
      'isMe', p.user_id = auth.uid(),
      'rolled', p.user_id = any(g.rolled_users)
    ) order by fm.joined_at)
    into parts
  from unnest(g.participants) as p(user_id)
  join public.family_member fm on fm.user_id = p.user_id and fm.family_id = g.family_id
  left join public.user_profiles up on up.user_id = p.user_id;

  if g.status = 'revealed' then
    select jsonb_agg(jsonb_build_object(
        'userId', r.user_id,
        'nickname', fm.nickname,
        'avatar', coalesce(up.avatar, ''),
        'value', r.value
      ) order by r.value desc, r.created_at)
      into rolls
    from public.dice_roll r
    join public.family_member fm on fm.user_id = r.user_id and fm.family_id = g.family_id
    left join public.user_profiles up on up.user_id = r.user_id
    where r.game_id = g.id and r.round = g.round;
  end if;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id,
      'rule', g.rule,
      'status', g.status,
      'round', g.round,
      'createdBy', g.created_by,
      'isCreator', g.created_by = auth.uid(),
      'loserId', g.loser_id,
      'loserValue', g.loser_value,
      'actualWasherId', coalesce(g.actual_washer, case when g.status = 'revealed' then g.loser_id end),
      'immunityUsed', g.immunity_used,
      'washedAt', g.washed_at,
      'revealedAt', g.updated_at,
      'myImmunity', (
        select count(*) from public.shop_orders
        where family_id = g.family_id and user_id = auth.uid()
          and item_code = 'immunity' and status = 'held'
      ),
      'myStreak', coalesce((
        select streak from public.unlucky_streak
        where family_id = g.family_id and user_id = auth.uid()
      ), 0),
      'startedAt', g.started_at,
      'createdAt', g.created_at,
      'myParticipant', auth.uid() = any(g.participants),
      'myRolled', auth.uid() = any(g.rolled_users)
    ),
    'participants', coalesce(parts, '[]'::jsonb),
    'participantCount', coalesce(array_length(g.participants, 1), 0),
    'rolledCount', coalesce(array_length(g.rolled_users, 1), 0),
    'rolls', coalesce(rolls, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. 权限 / 实时
-- ---------------------------------------------------------------------------
revoke all on function public.rewards_home(uuid) from public;
revoke all on function public.wash_checkin(uuid) from public;
revoke all on function public.buy_immunity(uuid) from public;
revoke all on function public.use_immunity(uuid) from public;
-- 发币与勋章检查只能被触发器和上面的 RPC 调用，客户端不能直接调
revoke all on function public.award_points(uuid, uuid, text, uuid, text) from public;
revoke all on function public.check_badges(uuid, uuid) from public;
revoke all on function public.award_points(uuid, uuid, text, uuid, text) from anon, authenticated;
revoke all on function public.check_badges(uuid, uuid) from anon, authenticated;

grant execute on function public.rewards_home(uuid) to anon, authenticated;
grant execute on function public.wash_checkin(uuid) to anon, authenticated;
grant execute on function public.buy_immunity(uuid) to anon, authenticated;
grant execute on function public.use_immunity(uuid) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.point_ledger;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.user_badges;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
