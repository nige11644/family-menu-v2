-- ============================================================================
-- 家宴 · 成员权限加固
--
-- 修复的问题：
--   1. fm_update 策略允许本人更新自己整行，普通成员可把 role 改成 1 自提权
--   2. 提权后可通过 fm_delete 直接删掉厨师，绕过 member_remove 的保护
--   3. fm_insert 允许任何人给自己插一行任意家庭的成员记录（可直接写成 role=1）
--   4. join_family 的 p_role 完全信任客户端，只有前端隐藏了入口
--
-- 原则：成员关系的写入只走 security definer 函数（create_family / join_family /
--       member_remove / leave_family），客户端只保留「改自己昵称」这一列权限。
-- 可重复执行。
-- ============================================================================

-- 1. 收回整表写权限，仅保留改自己的昵称（成员备注走 member_set_alias）
revoke insert, update, delete on public.family_member from anon, authenticated;
grant update (nickname) on public.family_member to anon, authenticated;

-- 2. 行策略：删除只允许删自己；插入不再开放（走 RPC）
drop policy if exists fm_delete on public.family_member;
create policy fm_delete on public.family_member for delete
  using (user_id = auth.uid());

drop policy if exists fm_insert on public.family_member;

-- 3. 加入家庭：只有「本来就是某家庭厨师」的人才能以厨师身份加入
create or replace function public.join_family(
  p_code text,
  p_nickname text,
  p_role int default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_role int := 0;
begin
  select id into v_family_id from public.family where join_code = p_code;
  if v_family_id is null then
    raise exception '家庭码无效';
  end if;

  if coalesce(p_role, 0) = 1 and exists (
    select 1 from public.family_member
    where user_id = auth.uid() and role = 1
  ) then
    v_role := 1;
  end if;

  insert into public.family_member (user_id, family_id, nickname, role)
  values (auth.uid(), v_family_id, p_nickname, v_role)
  on conflict (user_id, family_id) do nothing;

  insert into public.user_profiles (user_id, nickname, current_family_id)
  values (auth.uid(), p_nickname, v_family_id)
  on conflict (user_id) do update
    set current_family_id = v_family_id,
        nickname = p_nickname;

  return v_family_id;
end;
$$;

grant execute on function public.join_family(text, text, int) to anon, authenticated;

-- 4. 厨师身份调整：解决「两位厨师互相移除不了」的死锁
--    规则：只有现任厨师能调整；不能改自己；建家者不可降级；家里至少留一位厨师
create or replace function public.member_set_role(
  p_family_id uuid,
  p_user_id uuid,
  p_role int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chefs int;
begin
  if not public.is_chef_of(p_family_id) then
    raise exception '只有厨师能调整厨师身份';
  end if;
  if coalesce(p_role, -1) not in (0, 1) then
    raise exception '身份只能是家人或厨师';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能修改自己的身份';
  end if;

  if p_role = 0 then
    if exists (
      select 1 from public.family
      where id = p_family_id and created_by = p_user_id
    ) then
      raise exception '建家者不能被降为家人';
    end if;

    select count(*) into v_chefs
      from public.family_member
     where family_id = p_family_id and role = 1;
    if v_chefs <= 1 then
      raise exception '家里至少要留一位厨师';
    end if;
  end if;

  update public.family_member
     set role = p_role
   where family_id = p_family_id and user_id = p_user_id;

  if not found then
    raise exception '成员不存在';
  end if;
end;
$$;

revoke all on function public.member_set_role(uuid, uuid, int) from public;
grant execute on function public.member_set_role(uuid, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';
