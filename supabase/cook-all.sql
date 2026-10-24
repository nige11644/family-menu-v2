-- ============================================================================
-- 家宴 · 全家人掌厨
--
-- 任何家庭成员都可以进入厨师端接单、改菜、关席开席；
-- 成员管理（改备注 / 缺席 / 归档 / 移除）仍然只有家庭创建时的厨师可用。
-- 可重复执行。
-- ============================================================================

create or replace function public.update_item_status(
  p_item_id uuid,
  p_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.order_item where id = p_item_id;

  if v_family_id is null then
    raise exception '找不到该菜品';
  end if;
  if not public.belongs_to_family(v_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;
  if p_status not in ('pending', 'cooking', 'done', 'cancelled') then
    raise exception '状态值无效';
  end if;

  update public.order_item set status = p_status where id = p_item_id;

  update public.order_main om
  set status = 'done', updated_at = now()
  from (
    select order_id from public.order_item
    where order_id = (select order_id from public.order_item where id = p_item_id)
    group by order_id
    having every(status = 'done')
  ) finished
  where om.id = finished.order_id;

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

create or replace function public.bulk_update_dish(
  p_family_id uuid,
  p_dish_id uuid,
  p_status text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
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

create or replace function public.close_meal_session(p_family_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid;
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;
  v_sid := public.ensure_meal_session(p_family_id);
  update public.meal_session
  set status = 'closed', closed_at = now()
  where id = v_sid;
end;
$$;

create or replace function public.reopen_meal_session(p_family_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid;
begin
  if not public.belongs_to_family(p_family_id) then
    raise exception '你不是这个家庭的成员';
  end if;
  v_sid := public.ensure_meal_session(p_family_id);
  update public.meal_session
  set status = 'open', closed_at = null
  where id = v_sid;
end;
$$;

-- 订单与明细的 RLS 不改：接单/改状态全部走上面的 security definer 函数，
-- 保留原有「本人撤单」的限制，避免普通成员直接改别人的单。
-- 权限保持不变：成员管理仍走 is_chef_of
grant execute on function public.update_item_status(uuid, text) to anon, authenticated;
grant execute on function public.bulk_update_dish(uuid, uuid, text) to anon, authenticated;
grant execute on function public.close_meal_session(uuid) to anon, authenticated;
grant execute on function public.reopen_meal_session(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
