-- ============================================================================
-- 家宴 · 摇骰子定洗碗人
--
-- 公平性：点数由数据库 RPC 内的 random() 生成，客户端无法指定或提前读取；
-- 揭晓前 dice_roll 受 RLS 保护，谁都查不到点数，只能看到「谁已摇」。
-- 平局自动进入加时赛，只在平局者之间重摇。
-- 执行一次即可，可重复执行。
-- ============================================================================

create table if not exists public.dice_game (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  rule text not null default 'max_lose' check (rule in ('max_lose', 'min_lose')),
  status text not null default 'joining' check (status in ('joining', 'rolling', 'revealed', 'done')),
  round int not null default 1,
  participants uuid[] not null default '{}',
  rolled_users uuid[] not null default '{}',   -- 只记录「谁摇了」，不含点数
  loser_id uuid,
  loser_value int,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dice_roll (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.dice_game (id) on delete cascade,
  family_id uuid not null references public.family (id) on delete cascade,
  round int not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  value int not null check (value between 1 and 6),
  created_at timestamptz not null default now(),
  unique (game_id, round, user_id)
);

alter table public.dice_game add column if not exists rolled_users uuid[] not null default '{}';

create index if not exists idx_dice_game_family on public.dice_game (family_id, created_at desc);
create index if not exists idx_dice_roll_game on public.dice_roll (game_id, round);

-- ============================================================
-- RLS：成员可读局；点数只在揭晓后可读；写入全部走 RPC
-- ============================================================
alter table public.dice_game enable row level security;
alter table public.dice_roll enable row level security;

drop policy if exists dice_game_read on public.dice_game;
create policy dice_game_read on public.dice_game
  for select using (public.belongs_to_family(family_id));

drop policy if exists dice_roll_read on public.dice_roll;
create policy dice_roll_read on public.dice_roll
  for select using (
    public.belongs_to_family(family_id)
    and exists (
      select 1 from public.dice_game g
      where g.id = dice_roll.game_id and g.status in ('revealed', 'done')
    )
  );

-- ============================================================
-- 判定：全员摇完 / 平局加时 / 产生输家
-- ============================================================
create or replace function public.dice_judge(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.dice_game;
  alive int;
  rolled int;
  pick int;
  tied uuid[];
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;

  alive := coalesce(array_length(g.participants, 1), 0);
  select count(*) into rolled
  from public.dice_roll where game_id = g.id and round = g.round;

  if rolled < alive then
    return jsonb_build_object('ok', true, 'waiting', alive - rolled, 'round', g.round, 'status', 'rolling');
  end if;

  select case when g.rule = 'max_lose' then max(value) else min(value) end
    into pick
    from public.dice_roll where game_id = g.id and round = g.round;

  select array_agg(user_id) into tied
    from public.dice_roll
    where game_id = g.id and round = g.round and value = pick;

  if coalesce(array_length(tied, 1), 0) > 1 then
    update public.dice_game
      set round = g.round + 1, participants = tied, rolled_users = '{}',
          started_at = now(), updated_at = now()
      where id = g.id;
    return jsonb_build_object('ok', true, 'tie', true, 'round', g.round + 1, 'status', 'rolling');
  end if;

  update public.dice_game
    set status = 'revealed', loser_id = tied[1], loser_value = pick, updated_at = now()
    where id = g.id;
  return jsonb_build_object('ok', true, 'revealed', true, 'loserId', tied[1], 'loserValue', pick, 'round', g.round, 'status', 'revealed');
end;
$$;

-- ============================================================
-- 开局 / 加入 / 退出 / 开始 / 摇 / 强制揭晓
-- ============================================================
create or replace function public.create_dice_game(p_family_id uuid, p_rule text default 'max_lose')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  r text;
begin
  if not public.belongs_to_family(p_family_id) then raise exception '你不在这个家庭'; end if;
  r := case when p_rule = 'min_lose' then 'min_lose' else 'max_lose' end;
  if exists (
    select 1 from public.dice_game
    where family_id = p_family_id and status in ('joining', 'rolling')
  ) then
    raise exception '已经有一局在进行了，先等它出结果';
  end if;
  insert into public.dice_game (family_id, created_by, rule, status, participants)
  values (p_family_id, auth.uid(), r, 'joining', array[auth.uid()])
  returning id into gid;
  return gid;
end;
$$;

create or replace function public.join_dice_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare g public.dice_game;
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.status <> 'joining' then raise exception '已经开始摇了，等下一局吧'; end if;
  if not (auth.uid() = any(g.participants)) then
    update public.dice_game
      set participants = array_append(participants, auth.uid()), updated_at = now()
      where id = g.id;
  end if;
end;
$$;

create or replace function public.leave_dice_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare g public.dice_game;
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if g.status <> 'joining' then raise exception '已经开始了，不能退出'; end if;
  if g.created_by = auth.uid() then raise exception '开局者不能退出，可以直接开始或放着不管'; end if;
  update public.dice_game
    set participants = array_remove(participants, auth.uid()), updated_at = now()
    where id = g.id;
end;
$$;

create or replace function public.start_dice_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare g public.dice_game;
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.created_by <> auth.uid() then raise exception '只有开局者能开始'; end if;
  if g.status <> 'joining' then raise exception '这一局已经开始了'; end if;
  if coalesce(array_length(g.participants, 1), 0) < 2 then raise exception '至少 2 个人才能摇'; end if;
  update public.dice_game
    set status = 'rolling', round = 1, rolled_users = '{}', started_at = now(), updated_at = now()
    where id = g.id;
end;
$$;

create or replace function public.roll_dice(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.dice_game;
  existed int;
begin
  select * into g from public.dice_game where id = p_game_id;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.status <> 'rolling' then raise exception '现在不能摇'; end if;
  if not (auth.uid() = any(g.participants)) then raise exception '你不在这一局里'; end if;

  select value into existed
  from public.dice_roll
  where game_id = g.id and round = g.round and user_id = auth.uid();

  if existed is null then
    insert into public.dice_roll (game_id, family_id, round, user_id, value)
    values (g.id, g.family_id, g.round, auth.uid(), (1 + floor(random() * 6))::int)
    on conflict (game_id, round, user_id) do nothing;

    update public.dice_game
      set rolled_users = case
            when auth.uid() = any(rolled_users) then rolled_users
            else array_append(rolled_users, auth.uid())
          end,
          updated_at = now()
      where id = g.id;
  end if;

  return public.dice_judge(g.id);
end;
$$;

create or replace function public.force_reveal_dice(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.dice_game;
  ids uuid[];
begin
  select * into g from public.dice_game where id = p_game_id for update;
  if not found then raise exception '这一局不存在'; end if;
  if not public.belongs_to_family(g.family_id) then raise exception '你不在这个家庭'; end if;
  if g.created_by <> auth.uid() then raise exception '只有开局者能强制揭晓'; end if;
  if g.status <> 'rolling' then raise exception '现在不能揭晓'; end if;
  -- 未到 60 秒不允许提前踢人（全员摇完会自动揭晓，不需要这条路径）
  if g.started_at is not null and now() < g.started_at + interval '60 seconds' then
    raise exception '还没到 60 秒，等大家摇完再揭晓';
  end if;

  select array_agg(user_id) into ids
  from public.dice_roll where game_id = g.id and round = g.round;
  if ids is null then raise exception '还没有人摇，先等一等'; end if;

  -- 未摇的人视为弃权，从本轮参与者中移除
  update public.dice_game
    set participants = ids, rolled_users = ids, updated_at = now()
    where id = g.id;

  return public.dice_judge(g.id);
end;
$$;

-- ============================================================
-- 前端一次性读取：局信息 + 参与者（含头像）+ 已摇状态 + 揭晓点数
-- ============================================================
create or replace function public.dice_context(p_family_id uuid)
returns jsonb
language plpgsql
security definer
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

-- ============================================================
-- 权限与实时
-- ============================================================
revoke all on function public.dice_judge(uuid) from public;
grant execute on function public.create_dice_game(uuid, text) to anon, authenticated;
grant execute on function public.join_dice_game(uuid) to anon, authenticated;
grant execute on function public.leave_dice_game(uuid) to anon, authenticated;
grant execute on function public.start_dice_game(uuid) to anon, authenticated;
grant execute on function public.roll_dice(uuid) to anon, authenticated;
grant execute on function public.force_reveal_dice(uuid) to anon, authenticated;
grant execute on function public.dice_context(uuid) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.dice_game;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
