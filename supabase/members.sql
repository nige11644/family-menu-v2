-- ============================================================================
-- 家宴 · 厨师端「房间成员」
--
-- 数据底座：直接复用现有 family_member（一人一家庭一行），不另建成员表，
-- 避免和点菜/好评/摇骰子各维护一份名单。
--
-- 本文件做的事：
--   1) 给 family_member 补备注、缺席、归档、最后活跃时间四个字段
--   2) room_members()：一次返回成员 + 头像 + 本餐点菜数所需的原始数据
--   3) touch_member()：进入家宴时更新最后活跃时间（低频，不写心跳）
--   4) 厨师操作：改备注 / 标记缺席 / 归档 / 恢复
--
-- 在线状态不落库，走 Supabase Realtime Presence（关页面/断网自动离线）。
-- 可重复执行。
-- ============================================================================

alter table public.family_member add column if not exists alias text;
alter table public.family_member add column if not exists is_absent boolean not null default false;
alter table public.family_member add column if not exists status text not null default 'active';
alter table public.family_member add column if not exists last_seen_at timestamptz not null default now();

create index if not exists idx_fm_family_seen
  on public.family_member (family_id, status, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- 成员列表（同家庭成员都能看；含 30 天未活跃自动归档）
-- ---------------------------------------------------------------------------
create or replace function public.room_members(p_family_id uuid)
returns table (
  user_id uuid,
  nickname text,
  role int,
  avatar text,
  alias text,
  is_absent boolean,
  status text,
  joined_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不在这个家庭';
  end if;

  -- 30 天没进过家宴的家人自动进「历史成员」，厨师不自动归档。
  -- 对方下次打开会自动 touch_member 回到在场，数据不丢。
  update public.family_member fm
     set status = 'archived'
   where fm.family_id = p_family_id
     and fm.status = 'active'
     and fm.role <> 1
     and fm.last_seen_at < now() - interval '30 days';

  return query
    select fm.user_id,
           fm.nickname,
           fm.role,
           coalesce(p.avatar, '') as avatar,
           fm.alias,
           fm.is_absent,
           fm.status,
           fm.joined_at,
           fm.last_seen_at
    from public.family_member fm
    left join public.user_profiles p on p.user_id = fm.user_id
    where fm.family_id = p_family_id
    order by (fm.status = 'archived'), fm.last_seen_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 进入家宴 / 切回前台：更新最后活跃时间（由前端 60 秒节流调用）
-- ---------------------------------------------------------------------------
create or replace function public.touch_member(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不在这个家庭';
  end if;

  update public.family_member fm
     set last_seen_at = now(),
         status = 'active',
         nickname = coalesce(
           nullif((select p.nickname from public.user_profiles p where p.user_id = auth.uid()), ''),
           fm.nickname
         )
   where fm.family_id = p_family_id
     and fm.user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 厨师操作
-- ---------------------------------------------------------------------------
create or replace function public.member_set_alias(
  p_family_id uuid,
  p_user_id uuid,
  p_alias text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师能改成员备注';
  end if;

  update public.family_member
     set alias = nullif(left(btrim(coalesce(p_alias, '')), 12), '')
   where family_id = p_family_id and user_id = p_user_id;

  if not found then
    raise exception '成员不存在';
  end if;
end;
$$;

create or replace function public.member_set_absent(
  p_family_id uuid,
  p_user_id uuid,
  p_absent boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师能标记缺席';
  end if;

  update public.family_member
     set is_absent = coalesce(p_absent, false)
   where family_id = p_family_id and user_id = p_user_id;

  if not found then
    raise exception '成员不存在';
  end if;
end;
$$;

create or replace function public.member_set_status(
  p_family_id uuid,
  p_user_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师能归档成员';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception '状态只能是 active 或 archived';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能归档自己';
  end if;

  update public.family_member
     set status = p_status,
         last_seen_at = case when p_status = 'active' then now() else last_seen_at end
   where family_id = p_family_id and user_id = p_user_id;

  if not found then
    raise exception '成员不存在';
  end if;
end;
$$;

create or replace function public.member_remove(
  p_family_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师能移除成员';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能移除自己';
  end if;
  if exists (
    select 1 from public.family_member
    where family_id = p_family_id and user_id = p_user_id and role = 1
  ) then
    raise exception '不能移除厨师，请先把对方改为家人';
  end if;

  delete from public.family_member
   where family_id = p_family_id and user_id = p_user_id;

  if not found then
    raise exception '成员不存在';
  end if;

  -- 对方当前正在这个家庭的话，切到他剩下的另一个家庭（没有就置空），
  -- 免得下次打开还在一个已经没有权限的家庭里。
  update public.user_profiles p
     set current_family_id = (
       select fm.family_id from public.family_member fm
       where fm.user_id = p_user_id
       order by fm.joined_at desc
       limit 1
     ),
     updated_at = now()
   where p.user_id = p_user_id
     and p.current_family_id = p_family_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 权限与实时
-- ---------------------------------------------------------------------------
revoke all on function public.room_members(uuid) from public;
revoke all on function public.touch_member(uuid) from public;
revoke all on function public.member_set_alias(uuid, uuid, text) from public;
revoke all on function public.member_set_absent(uuid, uuid, boolean) from public;
revoke all on function public.member_set_status(uuid, uuid, text) from public;
revoke all on function public.member_remove(uuid, uuid) from public;

grant execute on function public.room_members(uuid) to anon, authenticated;
grant execute on function public.touch_member(uuid) to anon, authenticated;
grant execute on function public.member_set_alias(uuid, uuid, text) to anon, authenticated;
grant execute on function public.member_set_absent(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.member_set_status(uuid, uuid, text) to anon, authenticated;
grant execute on function public.member_remove(uuid, uuid) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.family_member;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
