-- 删除「凉菜」「甜品」两个品类，以及这两个品类下的所有菜品
-- 执行位置：Supabase 控制台 → SQL Editor（用项目 owner 账号登录）
-- 说明：order_item.dish_id 是 on delete set null，
--      历史订单明细里的菜名/图片会保留（只是不再关联菜品），不会丢单。

begin;

delete from public.dish where category in ('凉菜', '甜品');

commit;

-- 执行后可以跑这个看看剩下的分类分布：
-- select category, count(*) from public.dish group by category order by 1;
