-- ============================================================================
-- 家宴 · 好评打赏
--
-- 吃完饭后除了送好评，还能把米粒打赏给掌勺的人（从自己的米粒里扣）。
-- 规则：
--   1. 只能打赏 5 / 10 / 20 / 50 米粒，米粒不够则失败
--   2. 不能打赏自己，只能打赏同家庭成员
--   3. 每人每天最多打赏 3 次，累计不超过 60 米粒
--   4. 双向流水：打赏人记 -N（tip_out），收赏人记 +N（tip_in）
--
-- 前置：已执行 schema.sql、reward.sql；可重复执行。
-- 用法：Supabase Dashboard → SQL Editor 执行本文件。
-- ============================================================================

-- ============================================================
-- 1. 打赏面板数据（谁可以打赏 / 我的余额 / 今天用掉多少）
-- ============================================================
create or replace function public.tip_overview(p_family_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_balance int;
  v_out int;
  v_times int;
  v_chefs jsonb;
begin
  if v_uid is null then
    raise exception '登录状态已过期，请刷新页面';
  end if;
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.point_ledger
  where family_id = p_family_id and user_id = v_uid;

  select coalesce(sum(-amount), 0), count(*) into v_out, v_times
  from public.point_ledger
  where family_id = p_family_id and user_id = v_uid
    and reason = 'tip_out' and created_at >= v_day;

  -- 优先「家庭里的厨师」；全员掌厨、家里没有 role=1 时退回其他成员
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', m.user_id,
      'nickname', m.nickname,
      'role', m.role
    ) order by m.role desc, m.joined_at), '[]'::jsonb) into v_chefs
  from public.family_member m
  where m.family_id = p_family_id
    and m.user_id <> v_uid
    and (
      m.role = 1
      or not exists (
        select 1 from public.family_member c
        where c.family_id = p_family_id and c.role = 1
      )
    );

  return jsonb_build_object(
    'myBalance', v_balance,
    'todayOut', v_out,
    'todayTimes', v_times,
    'dailyCap', 60,
    'maxTimes', 3,
    'chefs', v_chefs
  );
end;
$$;

-- ============================================================
-- 2. 打赏（扣自己的米粒，加到对方账上）
-- ============================================================
create or replace function public.tip_chef(
  p_family_id uuid,
  p_to_user_id uuid,
  p_amount int,
  p_ref_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_balance int;
  v_out int;
  v_times int;
  v_from_nick text;
  v_to_nick text;
begin
  if v_uid is null then
    raise exception '登录状态已过期，请刷新页面';
  end if;
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;
  if p_to_user_id is null or p_to_user_id = v_uid then
    raise exception '不能给自己打赏';
  end if;
  if p_amount is null or p_amount not in (5, 10, 20, 50) then
    raise exception '打赏米粒只能选 5 / 10 / 20 / 50';
  end if;

  select coalesce(nickname, '家人') into v_to_nick
  from public.family_member
  where family_id = p_family_id and user_id = p_to_user_id;
  if v_to_nick is null then
    raise exception '对方不是这个家庭的成员';
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.point_ledger
  where family_id = p_family_id and user_id = v_uid;
  if v_balance < p_amount then
    raise exception '米粒不够啦，先去做饭或洗碗攒一点';
  end if;

  select coalesce(sum(-amount), 0), count(*) into v_out, v_times
  from public.point_ledger
  where family_id = p_family_id and user_id = v_uid
    and reason = 'tip_out' and created_at >= v_day;
  if v_times >= 3 then
    raise exception '今天已经打赏 3 次啦，明天再来';
  end if;
  if v_out + p_amount > 60 then
    raise exception '今天最多打赏 60 米粒，明天再来吧';
  end if;

  select coalesce(nickname, '家人') into v_from_nick
  from public.family_member
  where family_id = p_family_id and user_id = v_uid;

  -- 打赏人扣米粒
  insert into public.point_ledger (family_id, user_id, nickname, amount, reason, ref_id, note)
  values (p_family_id, v_uid, coalesce(v_from_nick, '家人'), -p_amount, 'tip_out', p_ref_id,
          format('打赏 %s · %s 米粒', v_to_nick, p_amount));

  -- 掌勺的人收米粒
  insert into public.point_ledger (family_id, user_id, nickname, amount, reason, ref_id, note)
  values (p_family_id, p_to_user_id, v_to_nick, p_amount, 'tip_in', p_ref_id,
          format('%s 打赏了好评', coalesce(v_from_nick, '家人')));

  perform public.check_badges(p_family_id, p_to_user_id);

  select coalesce(sum(amount), 0) into v_balance
  from public.point_ledger
  where family_id = p_family_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'balance', v_balance,
    'toNickname', v_to_nick,
    'amount', p_amount
  );
end;
$$;

grant execute on function public.tip_overview(uuid) to anon, authenticated;
grant execute on function public.tip_chef(uuid, uuid, int, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
