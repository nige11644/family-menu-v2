-- ============================================================================
-- 家宴 · 多家庭模型 Schema（私厨服务多家场景）
--
-- 核心变化（对比单家庭版）：
--   1. family_member 关联表取代 user_profile.family_id 单值字段
--   2. user_profiles.current_family_id 保存当前选中的家庭
--   3. dish 跨家庭共享（属于创建者厨师），不再绑定 family_id
--   4. my_current_family_id() / is_chef() / belongs_to_family() 全部按
--      current_family_id 上下文化
-- ============================================================================

-- 先关闭 RLS，后续在每张表建完后单独加
ALTER TABLE IF EXISTS public.family DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.family_member DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dish DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_main DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_item DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. 家庭 / 客户
-- ============================================================
create table if not exists public.family (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. 用户元信息（含当前选中家庭）
-- ============================================================
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  current_family_id uuid references public.family (id) on delete set null,
  push_key text not null default '',
  avatar text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. 家庭成员关联（核心！一个用户可属于多个家庭）
-- ============================================================
create table if not exists public.family_member (
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.family (id) on delete cascade,
  nickname text not null,
  role int not null default 0 check (role in (0, 1)),  -- 0 = 家人, 1 = 厨师
  joined_at timestamptz not null default now(),
  primary key (user_id, family_id)
);

create index if not exists idx_fm_family on public.family_member (family_id);
create index if not exists idx_fm_user on public.family_member (user_id);

-- ============================================================
-- 4. 菜品库（厨师维护，跨家庭共享）
-- ============================================================
create table if not exists public.dish (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null default '热菜',
  image_url text default '',
  intro text default '',
  -- 结构化菜谱：jsonb 数组（元素可为字符串或对象，前端兼容两种）
  ingredients jsonb not null default '[]'::jsonb,
  seasonings jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  prep_minutes int not null default 10 check (prep_minutes between 0 and 240),
  cooking_minutes int not null default 15 check (cooking_minutes between 1 and 120),
  difficulty text not null default '易',
  servings_per int not null default 2 check (servings_per between 1 and 10),
  allergens text not null default '无',
  status text not null default 'on' check (status in ('on', 'sold_out', 'off')),
  sort_no int not null default 99,
  has_recipe boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dish_creator on public.dish (created_by);
create index if not exists idx_dish_category on public.dish (category);

-- ============================================================
-- 5. 点菜单头
-- ============================================================
create table if not exists public.order_main (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_name text not null,
  note text default '',
  status text not null default 'pending' check (status in ('pending', 'cooking', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_om_family_status on public.order_main (family_id, status);
create index if not exists idx_om_family_created on public.order_main (family_id, created_at desc);

-- ============================================================
-- 6. 点菜单明细（菜名存快照，避免改菜谱时历史单错乱）
-- ============================================================
create table if not exists public.order_item (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_main (id) on delete cascade,
  family_id uuid not null references public.family (id) on delete cascade,
  dish_id uuid references public.dish (id) on delete set null,
  dish_name text not null,
  dish_image text default '',
  servings int not null default 1 check (servings between 1 and 20),
  note text default '',
  status text not null default 'pending' check (status in ('pending', 'cooking', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_oi_family_dish on public.order_item (family_id, dish_id);
create index if not exists idx_oi_order on public.order_item (order_id);

-- ============================================================
-- 视图：按菜汇总 + 按家庭
-- ============================================================
create or replace view public.dish_summary_v
with (security_invoker = true) as
select
  oi.family_id,
  oi.dish_id,
  oi.dish_name,
  oi.dish_image,
  sum(oi.servings) as servings,
  string_agg(distinct om.user_name, '、' order by om.user_name) as ordered_by,
  string_agg(
    case when oi.note is not null and oi.note <> ''
         then om.user_name || '：' || oi.note
    end,
    '；'
  ) as notes,
  array_remove(array_agg(oi.status), null) as statuses,
  min(oi.created_at) as first_at,
  max(oi.created_at) as last_at
from public.order_item oi
join public.order_main om on om.id = oi.order_id
where oi.status in ('pending', 'cooking')
group by oi.family_id, oi.dish_id, oi.dish_name, oi.dish_image;

-- ============================================================
-- 辅助函数
-- ============================================================

-- 当前登录用户
create or replace function public.current_user_id()
returns uuid language sql stable as $$
  select auth.uid();
$$;

-- 当前选中的家庭（读 user_profiles.current_family_id）
create or replace function public.my_current_family_id()
returns uuid language sql stable security definer as $$
  select p.current_family_id from public.user_profiles p where p.user_id = auth.uid();
$$;

-- 判断当前用户是否属于某个家庭
create or replace function public.belongs_to_family(p_family_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.family_member
    where user_id = auth.uid() and family_id = p_family_id
  );
$$;

-- 判断当前用户在某个家庭是否是厨师
create or replace function public.is_chef_of(p_family_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.family_member
    where user_id = auth.uid() and family_id = p_family_id and role = 1
  );
$$;

-- 判断当前用户在"当前选中家庭"是否是厨师
create or replace function public.is_chef()
returns boolean language sql stable as $$
  select public.is_chef_of(public.my_current_family_id());
$$;

-- 判断菜品是否对当前用户可见（厨师创建 or 菜品创建者的任何一个家庭成员）
create or replace function public.dish_visible_to(p_dish_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.dish d
    where d.id = p_dish_id and (
      d.created_by = auth.uid()
      or exists (
        select 1 from public.family_member fm
        where fm.user_id = auth.uid()
          and fm.family_id in (
            select fm2.family_id from public.family_member fm2
            where fm2.user_id = d.created_by
          )
      )
    )
  );
$$;

-- 自动维护 user_profiles 缺失行
create or replace function public.ensure_user_profile()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (user_id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.ensure_user_profile();

-- ============================================================
-- RLS：全部启用
-- ============================================================
alter table public.family enable row level security;
alter table public.user_profiles enable row level security;
alter table public.family_member enable row level security;
alter table public.dish enable row level security;
alter table public.order_main enable row level security;
alter table public.order_item enable row level security;

-- ---- family ----
-- 任何人可读（join_code 需要公开）
create policy family_read on public.family for select using (true);
-- 只有创建者可更新家庭信息
create policy family_update on public.family for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- user_profiles ----
-- 只有自己可读
create policy profile_read on public.user_profiles for select
  using (user_id = auth.uid());
-- 只有自己可写
create policy profile_write on public.user_profiles for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- family_member ----
-- 所有人可读（用于查询"我属于哪些家庭"）
create policy fm_read on public.family_member for select using (true);
-- 厨师可在自己家庭里加成员（或允许任何人通过 join_family RPC 加入）
create policy fm_insert on public.family_member for insert
  with check (user_id = auth.uid());
-- 本人可改自己在某家庭的昵称/角色
create policy fm_update on public.family_member for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- 只有厨师或本人可删
create policy fm_delete on public.family_member for delete
  using (user_id = auth.uid() or public.is_chef_of(family_id));

-- ---- dish ----
-- 厨师创建的菜品对"该厨师任何一个家庭的所有成员"可见
create policy dish_read on public.dish for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.family_member fm
      where fm.user_id = auth.uid()
        and fm.family_id in (
          select fm2.family_id from public.family_member fm2
          where fm2.user_id = public.dish.created_by
        )
    )
  );
-- 只有创建者可改
create policy dish_write on public.dish for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- order_main ----
-- 该家庭的所有成员可读
create policy om_read on public.order_main for select
  using (public.belongs_to_family(family_id));
-- 只有家人能为自己下；厨师能改状态
create policy om_insert on public.order_main for insert
  with check (
    public.belongs_to_family(family_id)
    and user_id = auth.uid()
  );
create policy om_update on public.order_main for update
  using (
    public.is_chef_of(family_id)
    or (user_id = auth.uid() and status = 'pending')
  )
  with check (public.belongs_to_family(family_id));

-- ---- order_item ----
create policy oi_read on public.order_item for select
  using (public.belongs_to_family(family_id));
create policy oi_write on public.order_item for all
  using (
    public.is_chef_of(family_id)
    or (exists (
      select 1 from public.order_main om
      where om.id = order_id and om.user_id = auth.uid()
    ))
  )
  with check (public.belongs_to_family(family_id));

-- ============================================================
-- RPC：全部 SECURITY DEFINER，绕过 RLS 由函数内部做鉴权
-- ============================================================

-- 创建家庭（厨师入口）
create or replace function public.create_family(
  p_name text,
  p_join_code text,
  p_nickname text default ''
) returns uuid
language plpgsql security definer as $$
declare
  v_family_id uuid;
begin
  insert into public.family (name, join_code, created_by)
  values (p_name, p_join_code, auth.uid())
  returning id into v_family_id;

  insert into public.family_member (user_id, family_id, nickname, role)
  values (auth.uid(), v_family_id, coalesce(nullif(p_nickname, ''), '主厨'), 1)
  on conflict (user_id, family_id) do nothing;

  insert into public.user_profiles (user_id, nickname, current_family_id)
  values (auth.uid(), coalesce(nullif(p_nickname, ''), '主厨'), v_family_id)
  on conflict (user_id) do update
    set current_family_id = v_family_id,
        nickname = coalesce(nullif(p_nickname, ''), public.user_profiles.nickname);

  return v_family_id;
end;
$$;

-- 加入家庭（任何角色，输入家庭码）
create or replace function public.join_family(
  p_code text,
  p_nickname text,
  p_role int default 0
) returns uuid
language plpgsql security definer as $$
declare
  v_family_id uuid;
begin
  select id into v_family_id from public.family where join_code = p_code;
  if v_family_id is null then
    raise exception '家庭码无效';
  end if;

  insert into public.family_member (user_id, family_id, nickname, role)
  values (auth.uid(), v_family_id, p_nickname, p_role)
  on conflict (user_id, family_id) do nothing;

  insert into public.user_profiles (user_id, nickname, current_family_id)
  values (auth.uid(), p_nickname, v_family_id)
  on conflict (user_id) do update
    set current_family_id = v_family_id,
        nickname = p_nickname;

  return v_family_id;
end;
$$;

-- 切换当前家庭
create or replace function public.switch_family(p_family_id uuid)
returns void
language plpgsql security definer as $$
begin
  if not exists (
    select 1 from public.family_member
    where user_id = auth.uid() and family_id = p_family_id
  ) then
    raise exception '你不是该家庭的成员';
  end if;

  update public.user_profiles set
    current_family_id = p_family_id,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

-- 离开家庭
create or replace function public.leave_family(p_family_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_next uuid;
begin
  delete from public.family_member
  where user_id = auth.uid() and family_id = p_family_id;

  -- 如果离开的是当前家庭，切换到另一个（如果有的话）
  update public.user_profiles
  set current_family_id = (
    select family_id from public.family_member
    where user_id = auth.uid()
    order by joined_at desc limit 1
  ),
  updated_at = now()
  where user_id = auth.uid();
end;
$$;

-- 提交点菜单
create or replace function public.create_order(
  p_items jsonb,
  p_note text default ''
) returns uuid
language plpgsql security definer as $$
declare
  v_family_id uuid := public.my_current_family_id();
  v_nickname text;
  v_order_id uuid;
begin
  if v_family_id is null then
    raise exception '请先加入或选择家庭';
  end if;

  select nickname into v_nickname from public.family_member
  where user_id = auth.uid() and family_id = v_family_id;
  v_nickname := coalesce(v_nickname, '家人');

  insert into public.order_main (family_id, user_id, user_name, note)
  values (v_family_id, auth.uid(), v_nickname, p_note)
  returning id into v_order_id;

  insert into public.order_item (
    order_id, family_id, dish_id, dish_name, dish_image, servings, note
  )
  select
    v_order_id,
    v_family_id,
    (i->>'dishId')::uuid,
    i->>'dishName',
    i->>'dishImage',
    coalesce((i->>'servings')::int, 1),
    i->>'note'
  from jsonb_array_elements(p_items) as t(i);

  return v_order_id;
end;
$$;

-- 更新菜品状态（厨师用，按单个 item）
create or replace function public.update_item_status(
  p_item_id uuid,
  p_status text
) returns void
language plpgsql security definer as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.order_item where id = p_item_id;

  if v_family_id is null then
    raise exception '找不到该菜品';
  end if;
  if not public.is_chef_of(v_family_id) then
    raise exception '只有厨师可以改状态';
  end if;
  if p_status not in ('pending', 'cooking', 'done', 'cancelled') then
    raise exception '状态值无效';
  end if;

  update public.order_item set status = p_status where id = p_item_id;

  -- 如果该订单所有 item 都 done，把 order_main 也置 done
  update public.order_main om
  set status = 'done', updated_at = now()
  from (
    select order_id from public.order_item
    where order_id = (select order_id from public.order_item where id = p_item_id)
    group by order_id
    having every(status = 'done')
  ) finished
  where om.id = finished.order_id;

  -- 如果订单还有未完成 item 但有 cooking，把 order_main 置 cooking
  update public.order_main om
  set status = 'cooking', updated_at = now()
  from (
    select order_id from public.order_item
    where order_id = (select order_id from public.order_item where id = p_item_id)
      and status in ('pending', 'cooking')
    group by order_id
    having count(*) > 0 and count(*) filter (where status = 'pending') < count(*)
  ) midcook
  where om.id = midcook.order_id and om.status <> 'done';
end;
$$;

-- 批量更新某道汇总菜的所有 item 状态（厨师看板一键操作）
create or replace function public.bulk_update_dish(
  p_family_id uuid,
  p_dish_id uuid,
  p_status text
) returns void
language plpgsql security definer as $$
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师可以改状态';
  end if;

  update public.order_item
  set status = p_status
  where family_id = p_family_id
    and (dish_id = p_dish_id or (p_dish_id is null and dish_name in (
      select dish_name from public.order_item
      where family_id = p_family_id and id = any(
        select id from public.order_item
        where family_id = p_family_id and dish_id is null
      )
    )))
    and status <> 'done';
end;
$$;

-- 撤回点菜单（家人用：仅本人 + 整单未被接单才可撤）
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_order public.order_main%rowtype;
begin
  select * into v_order from public.order_main where id = p_order_id;
  if v_order.id is null then
    raise exception '订单不存在';
  end if;
  if v_order.user_id <> auth.uid() then
    raise exception '只能撤回自己点的菜';
  end if;
  if v_order.status = 'cancelled' then
    return;
  end if;
  if exists (
    select 1 from public.order_item
    where order_id = p_order_id and status <> 'pending' and status <> 'cancelled'
  ) then
    raise exception '厨师已经开始做了，撤不回啦';
  end if;
  update public.order_main set status = 'cancelled', updated_at = now() where id = p_order_id;
  update public.order_item set status = 'cancelled' where order_id = p_order_id;
end;
$$;

-- 保存/更新菜品（jsonb 载荷，字段缺省时保留原值/用默认值）
create or replace function public.save_dish(
  p_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_dish_id uuid := p_id;
begin
  if v_dish_id is null then
    insert into public.dish (
      created_by, name, category, image_url, intro,
      prep_minutes, cooking_minutes, difficulty, servings_per, allergens,
      status, sort_no, has_recipe, ingredients, seasonings, steps
    ) values (
      auth.uid(),
      p_payload ->> 'name',
      coalesce(p_payload ->> 'category', '热菜'),
      coalesce(p_payload ->> 'imageUrl', ''),
      coalesce(p_payload ->> 'intro', ''),
      coalesce((p_payload ->> 'prepMinutes')::int, 10),
      coalesce((p_payload ->> 'cookingMinutes')::int, 15),
      coalesce(p_payload ->> 'difficulty', '易'),
      coalesce((p_payload ->> 'servingsPer')::int, 2),
      coalesce(p_payload ->> 'allergens', '无'),
      coalesce(p_payload ->> 'status', 'on'),
      coalesce((p_payload ->> 'sortNo')::int, 99),
      coalesce((p_payload ->> 'hasRecipe')::boolean, true),
      coalesce(p_payload -> 'ingredients', '[]'::jsonb),
      coalesce(p_payload -> 'seasonings', '[]'::jsonb),
      coalesce(p_payload -> 'steps', '[]'::jsonb)
    )
    returning id into v_dish_id;
  else
    if (select created_by from public.dish where id = v_dish_id) <> auth.uid() then
      raise exception '只能修改自己创建的菜品';
    end if;
    update public.dish set
      name = coalesce(p_payload ->> 'name', name),
      category = coalesce(p_payload ->> 'category', category),
      image_url = coalesce(p_payload ->> 'imageUrl', image_url),
      intro = coalesce(p_payload ->> 'intro', intro),
      prep_minutes = coalesce((p_payload ->> 'prepMinutes')::int, prep_minutes),
      cooking_minutes = coalesce((p_payload ->> 'cookingMinutes')::int, cooking_minutes),
      difficulty = coalesce(p_payload ->> 'difficulty', difficulty),
      servings_per = coalesce((p_payload ->> 'servingsPer')::int, servings_per),
      allergens = coalesce(p_payload ->> 'allergens', allergens),
      status = coalesce(p_payload ->> 'status', status),
      sort_no = coalesce((p_payload ->> 'sortNo')::int, sort_no),
      has_recipe = coalesce((p_payload ->> 'hasRecipe')::boolean, has_recipe),
      ingredients = coalesce(p_payload -> 'ingredients', ingredients),
      seasonings = coalesce(p_payload -> 'seasonings', seasonings),
      steps = coalesce(p_payload -> 'steps', steps),
      updated_at = now()
    where id = v_dish_id;
  end if;
  return v_dish_id;
end;
$$;

-- 生成家庭码（8 位大写字母+数字，避免 O/0/I/1）
create or replace function public.generate_join_code()
returns text language plpgsql security definer as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i int;
begin
  for i in 1..6 loop
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- Realtime：订阅 order_main / order_item / family_member
-- ============================================================
alter publication supabase_realtime add table public.order_main;
alter publication supabase_realtime add table public.order_item;
alter publication supabase_realtime add table public.family_member;

-- ============================================================
-- 授权
-- ============================================================
grant usage on schema public to anon, authenticated;
grant execute on function public.create_family(text, text, text) to anon, authenticated;
grant execute on function public.join_family(text, text, int) to anon, authenticated;
grant execute on function public.switch_family(uuid) to anon, authenticated;
grant execute on function public.leave_family(uuid) to anon, authenticated;
grant execute on function public.create_order(jsonb, text) to anon, authenticated;
grant execute on function public.cancel_order(uuid) to anon, authenticated;
grant execute on function public.update_item_status(uuid, text) to anon, authenticated;
grant execute on function public.bulk_update_dish(uuid, uuid, text) to anon, authenticated;
grant execute on function public.save_dish(uuid, jsonb) to anon, authenticated;
grant execute on function public.generate_join_code() to anon, authenticated;

-- ============================================================
-- Storage：dish-images 桶（可选，用来存菜品图）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do nothing;

create policy "images read" on storage.objects for select
  using (bucket_id = 'dish-images');

create policy "images write" on storage.objects for insert
  with check (
    bucket_id = 'dish-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "images update" on storage.objects for update
  using (
    bucket_id = 'dish-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "images delete" on storage.objects for delete
  using (
    bucket_id = 'dish-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
