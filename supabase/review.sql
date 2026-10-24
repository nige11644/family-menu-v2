-- ============================================================================
-- 家宴 · 好评功能
--
-- 设计（对应《家宴点菜_好评功能设计方案》）：
--   1. 一天一顿：meal_session 按 family + 日期唯一（东八区）
--   2. 整单评价：1-5 星 + 标签 + 50 字夸夸 + 匿名开关（review）
--   3. 逐菜反馈：❤ 好评 / ☑ 下次还点（dish_feedback）
--   4. 开饭时间：厨师关席后开放；当天第一单满 2 小时自动兜底开放
--   5. 提交后展示：本桌 TOP3（session_ranking）+ 家庭历史榜（dish_ranking）
--   6. 厨师收到好评后：前端 Realtime 横幅 + 微信推送（Server 酱）
--
-- 用法：Supabase Dashboard → SQL Editor 执行本文件（可重复执行）。
-- 前置：已执行 schema.sql；微信推送需要 pg_net（本文件会尝试创建）。
-- ============================================================================

create extension if not exists pg_net;

-- ============================================================
-- 1. 饭局（一天一顿）
-- ============================================================
create table if not exists public.meal_session (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  session_date date not null default ((now() at time zone 'Asia/Shanghai')::date),
  -- open = 还在吃（未关席），closed = 已关席（开放好评）
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, session_date)
);

create index if not exists idx_ms_family_date on public.meal_session (family_id, session_date desc);

-- ============================================================
-- 2. 整单好评
-- ============================================================
create table if not exists public.review (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meal_session (id) on delete cascade,
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null default '',
  rating int not null check (rating between 1 and 5),
  tags text[] not null default '{}',
  comment text not null default '',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_review_session on public.review (session_id, created_at desc);
create index if not exists idx_review_family on public.review (family_id, created_at desc);

-- ============================================================
-- 3. 逐菜反馈
-- ============================================================
create table if not exists public.dish_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.meal_session (id) on delete cascade,
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dish_id uuid references public.dish (id) on delete set null,
  dish_name text not null,
  dish_image text not null default '',
  liked boolean not null default false,
  want_next boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, user_id, dish_name)
);

create index if not exists idx_df_session on public.dish_feedback (session_id);
create index if not exists idx_df_family_dish on public.dish_feedback (family_id, dish_name);

-- ============================================================
-- 4. 排行榜视图
-- ============================================================
-- 家庭累计榜：跨所有饭局，按「好评数 → 好评率」排序
create or replace view public.dish_ranking
with (security_invoker = true) as
select
  df.family_id,
  (array_agg(df.dish_id) filter (where df.dish_id is not null))[1] as dish_id,
  df.dish_name,
  (array_agg(df.dish_image) filter (where df.dish_image <> ''))[1] as dish_image,
  count(*) filter (where df.liked) as like_count,
  count(*) as feedback_count,
  round(count(*) filter (where df.liked)::numeric / greatest(count(*), 1), 3) as like_rate,
  count(*) filter (where df.want_next) as want_next_count,
  max(df.created_at) as last_at
from public.dish_feedback df
group by df.family_id, df.dish_name;

-- 本桌榜：当前饭局的好评数
create or replace view public.session_ranking
with (security_invoker = true) as
select
  df.session_id,
  df.family_id,
  df.dish_name,
  (array_agg(df.dish_id) filter (where df.dish_id is not null))[1] as dish_id,
  (array_agg(df.dish_image) filter (where df.dish_image <> ''))[1] as dish_image,
  count(*) filter (where df.liked) as like_count,
  count(*) filter (where df.want_next) as want_next_count
from public.dish_feedback df
group by df.session_id, df.family_id, df.dish_name;

-- ============================================================
-- 5. 辅助函数
-- ============================================================
-- 今天的饭局（不存在则创建）
create or replace function public.ensure_meal_session(p_family_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_id uuid;
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;

  insert into public.meal_session (family_id, session_date)
  values (p_family_id, v_today)
  on conflict (family_id, session_date) do nothing;

  select id into v_id from public.meal_session
  where family_id = p_family_id and session_date = v_today;

  return v_id;
end;
$$;

-- 是否已开放好评：厨师关席，或当天第一单已满 2 小时（兜底）
create or replace function public.review_open(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.meal_session
      where family_id = p_family_id
        and session_date = (now() at time zone 'Asia/Shanghai')::date
        and status = 'closed'
    )
    or exists (
      select 1 from public.order_main
      where family_id = p_family_id
        and status <> 'cancelled'
        and (created_at at time zone 'Asia/Shanghai')::date = (now() at time zone 'Asia/Shanghai')::date
      having min(created_at) <= now() - interval '2 hours'
    );
$$;

-- 厨师关席
create or replace function public.close_meal_session(p_family_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid;
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师可以关席';
  end if;
  v_sid := public.ensure_meal_session(p_family_id);
  update public.meal_session
  set status = 'closed', closed_at = now()
  where id = v_sid;
end;
$$;

-- 厨师重新开席（撤销关席）
create or replace function public.reopen_meal_session(p_family_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid;
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师可以开席';
  end if;
  v_sid := public.ensure_meal_session(p_family_id);
  update public.meal_session
  set status = 'open', closed_at = null
  where id = v_sid;
end;
$$;

-- ============================================================
-- 6. 提交好评
-- ============================================================
create or replace function public.submit_review(
  p_family_id uuid,
  p_rating int,
  p_tags text[] default '{}'::text[],
  p_comment text default '',
  p_is_anonymous boolean default false,
  p_feedback jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_nick text;
  v_item jsonb;
  v_name text;
begin
  if v_uid is null then
    raise exception '登录状态已过期，请刷新页面';
  end if;
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception '先给这顿饭打个分吧';
  end if;
  if not public.review_open(p_family_id) then
    raise exception '厨师还在忙，关席后再来评价吧';
  end if;

  select nickname into v_nick from public.family_member
  where user_id = v_uid and family_id = p_family_id;

  v_sid := public.ensure_meal_session(p_family_id);

  insert into public.review (session_id, family_id, user_id, nickname, rating, tags, comment, is_anonymous)
  values (
    v_sid, p_family_id, v_uid,
    -- 匿名时不落库真实昵称：RLS 只能限到家庭，成员仍可直接查表
    case when coalesce(p_is_anonymous, false) then ''
         else coalesce(nullif(v_nick, ''), '家人') end,
    p_rating,
    coalesce(
      (select array_agg(x.t) from (
        select distinct t from unnest(coalesce(p_tags, '{}'::text[])) as t
        where t <> '' limit 6
      ) x),
      '{}'::text[]
    ),
    left(coalesce(p_comment, ''), 50),
    coalesce(p_is_anonymous, false)
  )
  on conflict (session_id, user_id) do update set
    nickname = excluded.nickname,
    rating = excluded.rating,
    tags = excluded.tags,
    comment = excluded.comment,
    is_anonymous = excluded.is_anonymous,
    created_at = now();

  -- 逐菜反馈整组替换（用户可反复修改）
  delete from public.dish_feedback where session_id = v_sid and user_id = v_uid;

  for v_item in select * from jsonb_array_elements(coalesce(p_feedback, '[]'::jsonb)) loop
    v_name := left(trim(coalesce(v_item ->> 'dishName', '')), 60);
    continue when v_name = '';

    insert into public.dish_feedback (
      session_id, family_id, user_id, dish_id, dish_name, dish_image, liked, want_next
    ) values (
      v_sid,
      p_family_id,
      v_uid,
      case when coalesce(v_item ->> 'dishId', '') ~ '^[0-9a-fA-F-]{36}$'
           then (v_item ->> 'dishId')::uuid else null end,
      v_name,
      left(coalesce(v_item ->> 'dishImage', ''), 500),
      coalesce((v_item ->> 'liked')::boolean, false),
      coalesce((v_item ->> 'wantNext')::boolean, false)
    )
    on conflict (session_id, user_id, dish_name) do update set
      dish_id = excluded.dish_id,
      dish_image = excluded.dish_image,
      liked = excluded.liked,
      want_next = excluded.want_next;
  end loop;

  return v_sid;
end;
$$;

-- ============================================================
-- 7. 好评页上下文（一次请求拿全部数据）
-- ============================================================
create or replace function public.review_context(p_family_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_sid uuid;
  v_status text;
  v_closed_at timestamptz;
  v_open boolean;
  v_my_review jsonb;
  v_my_feedback jsonb;
  v_reviews jsonb;
  v_session_top jsonb;
  v_family_top jsonb;
  v_today_dishes jsonb;
  v_avg numeric;
  v_count int;
begin
  if v_uid is null then
    raise exception '登录状态已过期，请刷新页面';
  end if;
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;

  select id, status, closed_at into v_sid, v_status, v_closed_at
  from public.meal_session
  where family_id = p_family_id and session_date = v_today;

  v_open := public.review_open(p_family_id);

  if v_sid is not null then
    select jsonb_build_object(
      'id', r.id,
      'userId', r.user_id,
      'nickname', case when r.is_anonymous then '匿名家人' else r.nickname end,
      'rating', r.rating,
      'tags', r.tags,
      'comment', r.comment,
      'isAnonymous', r.is_anonymous,
      'mine', true,
      'createdAt', r.created_at
    ) into v_my_review
    from public.review r
    where r.session_id = v_sid and r.user_id = v_uid;

    select coalesce(jsonb_agg(jsonb_build_object(
      'dishName', f.dish_name,
      'liked', f.liked,
      'wantNext', f.want_next
    )), '[]'::jsonb) into v_my_feedback
    from public.dish_feedback f
    where f.session_id = v_sid and f.user_id = v_uid;

    select coalesce(jsonb_agg(t.r order by t.created_at), '[]'::jsonb) into v_reviews
    from (
      select jsonb_build_object(
        'id', rv.id,
        'userId', rv.user_id,
        'nickname', case when rv.is_anonymous then '匿名家人' else rv.nickname end,
        'rating', rv.rating,
        'tags', rv.tags,
        'comment', rv.comment,
        'isAnonymous', rv.is_anonymous,
        'mine', rv.user_id = v_uid,
        'createdAt', rv.created_at
      ) as r, rv.created_at
      from public.review rv
      where rv.session_id = v_sid
    ) t;

    select coalesce(jsonb_agg(t order by t.like_count desc, t.dish_name), '[]'::jsonb) into v_session_top
    from (
      select sr.dish_name, sr.dish_image, sr.like_count, sr.want_next_count
      from public.session_ranking sr
      where sr.session_id = v_sid and sr.like_count > 0
      order by sr.like_count desc, sr.want_next_count desc
      limit 3
    ) t;
  else
    v_my_review := null;
    v_my_feedback := '[]'::jsonb;
    v_reviews := '[]'::jsonb;
    v_session_top := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t order by t.like_count desc, t.like_rate desc), '[]'::jsonb) into v_family_top
  from (
    select dr.dish_name, dr.dish_image, dr.like_count, dr.like_rate, dr.want_next_count
    from public.dish_ranking dr
    where dr.family_id = p_family_id and dr.like_count > 0
    order by dr.like_count desc, dr.like_rate desc
    limit 5
  ) t;

  -- 今天点过的菜（带本人反馈），用于逐菜评价
  select coalesce(jsonb_agg(jsonb_build_object(
    'dishId', t.dish_id,
    'dishName', t.dish_name,
    'dishImage', t.dish_image,
    'servings', t.servings,
    'liked', t.liked,
    'wantNext', t.want_next
  ) order by t.servings desc, t.dish_name), '[]'::jsonb) into v_today_dishes
  from (
    select
      oi.dish_name,
      (array_agg(oi.dish_id) filter (where oi.dish_id is not null))[1] as dish_id,
      coalesce(max(oi.dish_image), '') as dish_image,
      sum(oi.servings) as servings,
      coalesce(bool_or(df.liked), false) as liked,
      coalesce(bool_or(df.want_next), false) as want_next
    from public.order_item oi
    join public.order_main om on om.id = oi.order_id
    left join public.dish_feedback df
      on df.session_id = v_sid and df.user_id = v_uid and df.dish_name = oi.dish_name
    where oi.family_id = p_family_id
      and om.status <> 'cancelled'
      and oi.status <> 'cancelled'
      and (om.created_at at time zone 'Asia/Shanghai')::date = v_today
    group by oi.dish_name
  ) t;

  select count(*), round(avg(rating), 1) into v_count, v_avg
  from public.review
  where session_id = v_sid;

  return jsonb_build_object(
    'familyId', p_family_id,
    'sessionId', v_sid,
    'sessionDate', v_today,
    'sessionStatus', coalesce(v_status, 'open'),
    'closedAt', v_closed_at,
    'isOpen', v_open,
    'myReview', v_my_review,
    'myFeedback', v_my_feedback,
    'todayReviews', v_reviews,
    'todayReviewCount', coalesce(v_count, 0),
    'todayRatingAvg', coalesce(v_avg, 0),
    'sessionTop', v_session_top,
    'familyTop', v_family_top,
    'todayDishes', v_today_dishes
  );
end;
$$;

-- ============================================================
-- 8. RLS（写入全部走 RPC，读按家庭隔离）
-- ============================================================
alter table public.meal_session enable row level security;
alter table public.review enable row level security;
alter table public.dish_feedback enable row level security;

drop policy if exists ms_read on public.meal_session;
create policy ms_read on public.meal_session for select
  using (public.belongs_to_family(family_id));

drop policy if exists review_read on public.review;
create policy review_read on public.review for select
  using (public.belongs_to_family(family_id));

drop policy if exists df_read on public.dish_feedback;
create policy df_read on public.dish_feedback for select
  using (public.belongs_to_family(family_id));

-- ============================================================
-- 9. Realtime：厨师端收到好评即时提示
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.review;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.dish_feedback;
exception when duplicate_object then null; end $$;

-- ============================================================
-- 10. 微信推送【家宴好评】
-- ============================================================
create or replace function public.notify_chef_review()
returns trigger
language plpgsql security definer
set search_path = public, net
as $$
declare
  v_family_name text;
  v_chef record;
  v_key text;
  v_url text;
  v_title text;
  v_desp text;
  v_who text;
begin
  select name into v_family_name from public.family where id = new.family_id;
  v_who := case when new.is_anonymous then '匿名家人' else coalesce(nullif(new.nickname, ''), '家人') end;

  v_title := format('🌸 家宴好评 · %s', coalesce(v_family_name, '家宴'));
  v_desp := format(
    '**%s** 给了 %s %s\n\n%s%s\n\n%s',
    v_who,
    new.rating,
    repeat('★', new.rating) || repeat('☆', 5 - new.rating),
    case when coalesce(array_length(new.tags, 1), 0) > 0
         then '标签：' || array_to_string(new.tags, '、') else '标签：（未选）' end,
    case when coalesce(new.comment, '') <> ''
         then E'\n\n“' || new.comment || '”' else '' end,
    to_char(now() at time zone 'Asia/Shanghai', 'MM-DD HH24:MI')
  );

  for v_chef in
    select trim(p.push_key) as push_key
    from public.family_member fm
    join public.user_profiles p on p.user_id = fm.user_id
    where fm.family_id = new.family_id
      and fm.role = 1
      and coalesce(trim(p.push_key), '') <> ''
  loop
    v_key := v_chef.push_key;

    if lower(v_key) like 'sctp%' then
      v_url := format(
        'https://%s.push.ft07.com/send/%s.send',
        substring(lower(v_key) from '^sctp(\d+)t'),
        v_key
      );
    else
      v_url := format('https://sctapi.ftqq.com/%s.send', v_key);
    end if;

    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('title', v_title, 'desp', v_desp),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end loop;

  return null;
exception when others then
  raise warning 'notify_chef_review 失败: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_notify_chef_review on public.review;
create trigger trg_notify_chef_review
  after insert on public.review
  for each row execute function public.notify_chef_review();

-- ============================================================
-- 11. 授权
-- ============================================================
grant select on public.meal_session, public.review, public.dish_feedback to anon, authenticated;
grant select on public.dish_ranking, public.session_ranking to anon, authenticated;

grant execute on function public.ensure_meal_session(uuid) to anon, authenticated;
grant execute on function public.review_open(uuid) to anon, authenticated;
grant execute on function public.close_meal_session(uuid) to anon, authenticated;
grant execute on function public.reopen_meal_session(uuid) to anon, authenticated;
grant execute on function public.submit_review(uuid, int, text[], text, boolean, jsonb) to anon, authenticated;
grant execute on function public.review_context(uuid) to anon, authenticated;

-- 让 PostgREST 立刻认识新函数/表
notify pgrst, 'reload schema';
