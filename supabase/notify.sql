-- ============================================================
-- 厨师微信推送（Server 酱）
-- 用法：Supabase Dashboard → SQL Editor 执行本文件。
-- 前置：Database → Extensions 里启用 pg_net（没有启用时本文件第一行也会尝试创建）。
-- 推送逻辑：家人提交点菜单后，找出该家庭里填了 SendKey 的厨师，逐个推送到微信。
-- ============================================================

create extension if not exists pg_net;

create or replace function public.notify_chef_push()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_family_name text;
  v_items text;
  v_chef record;
  v_key text;
  v_url text;
  v_title text;
  v_desp text;
begin
  select name into v_family_name from public.family where id = new.family_id;

  -- 明细在 create_order 的同一个事务里写入，所以这里用延迟触发器能读到完整菜单
  select string_agg(format('%s × %s', oi.dish_name, oi.servings), '、' order by oi.created_at)
    into v_items
  from public.order_item oi
  where oi.order_id = new.id;

  v_title := format('🍚 新点菜 · %s', coalesce(v_family_name, '家宴'));
  v_desp := format(
    '**%s** 点了：%s%s\n\n%s',
    new.user_name,
    coalesce(v_items, '（未选菜）'),
    case when coalesce(new.note, '') <> '' then E'\n\n备注：' || new.note else '' end,
    to_char(now() at time zone 'Asia/Shanghai', 'MM-DD HH24:MI')
  );

  -- 一个家庭可能有多个厨师，谁填了 SendKey 就推给谁
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
      -- Server 酱³：https://{uid}.push.ft07.com/send/{SendKey}.send
      v_url := format(
        'https://%s.push.ft07.com/send/%s.send',
        substring(lower(v_key) from '^sctp(\d+)t'),
        v_key
      );
    else
      -- Server 酱 Turbo：https://sctapi.ftqq.com/{SendKey}.send
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
  -- 推送失败不能影响下单
  raise warning 'notify_chef_push 失败: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_notify_chef_push on public.order_main;
create constraint trigger trg_notify_chef_push
  after insert on public.order_main
  deferrable initially deferred
  for each row
  execute function public.notify_chef_push();
