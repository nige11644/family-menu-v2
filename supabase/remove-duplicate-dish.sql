-- 修复「热菜」分类下的重复菜品：验证红烧肉（保留最早创建的一条）
-- 执行位置：Supabase 控制台 → SQL Editor（用项目 owner 账号登录）

-- 1) 先看清楚有几条、分别什么时候建的（只读）
select id, name, category, created_at
from public.dish
where name = '验证红烧肉'
order by created_at;

-- 2) 删除较晚创建的重复项，保留最早那条
delete from public.dish
where id in (
  select id from (
    select id, row_number() over (
      partition by name, category
      order by created_at, id
    ) as rn
    from public.dish
    where name = '验证红烧肉' and category = '热菜'
  ) t
  where t.rn > 1
);

-- 3) 执行后复核：应该只剩 1 条
select name, category, count(*)
from public.dish
group by name, category
having count(*) > 1;
