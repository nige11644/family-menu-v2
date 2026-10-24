-- 修复菜品分类：「番茄蛋汤」「紫菜蛋花汤」被错设在「热菜」下，归回「汤」
-- 执行位置：Supabase 控制台 → SQL Editor（用项目 owner 账号登录）

-- 1) 先看现状（只读）
select id, name, category, created_at
from public.dish
where name in ('番茄蛋汤', '紫菜蛋花汤')
order by name, created_at;

-- 2) 归回「汤」分类
update public.dish
set category = '汤'
where name in ('番茄蛋汤', '紫菜蛋花汤')
  and category <> '汤';

-- 3) 复核分类分布
select category, count(*) from public.dish group by category order by 1;
