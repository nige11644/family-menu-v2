-- ============================================================
-- 删除家庭（仅该家庭的厨师可操作）
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴运行
-- 说明：
--   1) 家庭成员、订单、好评、米粒流水、骰子记录都通过外键 on delete cascade 一起清掉
--   2) 菜品属于「创建者个人」，不随家庭删除，会继续留在厨师自己的菜品库里
--   3) 其他成员的 user_profiles.current_family_id 会被外键自动置空（on delete set null）
-- ============================================================
create or replace function public.delete_family(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '登录状态已过期，请重新进入家宴';
  end if;

  -- 只有这个家庭的厨师（role = 1）才能删除，避免家人误删整桌数据
  if not exists (
    select 1 from public.family_member
     where family_id = p_family_id
       and user_id = v_uid
       and role = 1
  ) then
    raise exception '只有这个家庭的厨师才能删除';
  end if;

  delete from public.family where id = p_family_id;
end;
$$;

revoke all on function public.delete_family(uuid) from public;
grant execute on function public.delete_family(uuid) to authenticated;
