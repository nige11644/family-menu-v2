-- 预置数据：3 个家庭 + 1 个厨师（seed 时用固定 UUID 模拟，真实场景 auth.users 会自动建立）
-- 可以重复执行（幂等）

-- 0. 先在 auth.users 里放演示账号（family_member / dish / order 的外键都引用它）
--    真实使用中匿名登录会自动创建，这里只是为了让 seed 能直接跑
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000',
  uid,
  'authenticated',
  'authenticated',
  'demo-' || uid::text || '@example.com',
  crypt('demo123456', gen_salt('bf')),
  now(), now(), now()
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid),  -- 主厨小王
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid),  -- 张阿姨
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid),  -- 小明
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid),  -- 王叔叔
  ('aaaaaaaa-0000-0000-0000-000000000004'::uuid)   -- 小丽
) as t(uid)
on conflict (id) do nothing;

-- 假设一个厨师的 auth.users.id（演示用）
-- 真实 auth user 由 Supabase 匿名登录创建，demo 模式不读这张表
with chef as (
  select '00000000-0000-0000-0000-000000000001'::uuid as uid,
         '主厨小王' as nickname
),
-- 3 个家庭
families as (
  insert into public.family (id, name, join_code, created_by)
  values
    ('11111111-1111-1111-1111-111111111111', '张阿姨家', 'HOME77', '00000000-0000-0000-0000-000000000001'),
    ('22222222-2222-2222-2222-222222222222', '王叔叔家', 'HOME88', '00000000-0000-0000-0000-000000000001'),
    ('33333333-3333-3333-3333-333333333333', '小李家',   'HOME99', '00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing
  returning id
),
-- 厨师自动成为三个家庭的成员（role=1）
chef_members as (
  insert into public.family_member (user_id, family_id, nickname, role)
  select chef.uid, families.id, chef.nickname, 1 from chef cross join families
  on conflict do nothing
),
-- 家人（用假 user_id，演示用）
family_members as (
  insert into public.family_member (user_id, family_id, nickname, role)
  values
    ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '张阿姨', 0),
    ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '小明',   0),
    ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '王叔叔', 0),
    ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '小丽',   0)
  on conflict do nothing
),
-- 预置 8 道菜
dishes as (
  insert into public.dish (
    id, created_by, name, category, image_url,
    ingredients, seasonings, steps,
    cooking_minutes, servings_per
  ) values
    ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '宫保鸡丁',   '热菜', 'assets/img/dish-kungpao.jpg',
     to_jsonb(ARRAY['鸡腿肉','花生米','干辣椒','大葱','生姜']),
     to_jsonb(ARRAY['生抽','老抽','蚝油','白糖','醋','花椒','料酒']),
     to_jsonb(ARRAY['鸡腿肉切丁，用料酒、生抽、淀粉腌 15 分钟','干辣椒、花椒、大葱段切好','调汁：生抽+老抽+蚝油+白糖+醋+少量水','热油爆香花椒干辣椒','下鸡丁大火快炒至变色','倒入调味汁翻炒 30 秒','下花生米翻匀出锅']),
     15, 3),
    ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '番茄蛋汤',   '汤',   'assets/img/dish-tomato-soup.jpg',
     to_jsonb(ARRAY['番茄','鸡蛋','葱花']),
     to_jsonb(ARRAY['盐','白胡椒粉','白糖','香油']),
     to_jsonb(ARRAY['番茄去皮切块','鸡蛋打散','锅中加水烧开下番茄','番茄煮软后淋蛋液搅成蛋花','加盐、白糖、胡椒粉调味','撒葱花、淋香油出锅']),
     10, 2),
    ('dddddddd-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '红烧牛腩',   '热菜', 'assets/img/dish-beef.jpg',
     to_jsonb(ARRAY['牛腩','生姜','大葱','八角','桂皮']),
     to_jsonb(ARRAY['生抽','老抽','蚝油','冰糖','料酒']),
     to_jsonb(ARRAY['牛腩焯水切块','冰糖炒糖色','下牛腩翻炒上色','加葱姜八角桂皮','加生抽老抽蚝油','加开水没过牛腩','小火炖 60 分钟','大火收汁出锅']),
     75, 4),
    ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '蒜蓉西兰花', '素菜', 'assets/img/dish-broccoli.jpg',
     to_jsonb(ARRAY['西兰花','大蒜']),
     to_jsonb(ARRAY['盐','蚝油','生抽']),
     to_jsonb(ARRAY['西兰花掰小朵焯水 1 分钟','大蒜切蒜末','热油爆香蒜末','下西兰花翻炒','加蚝油生抽调味出锅']),
     8, 2),
    ('dddddddd-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '白米饭',     '主食', 'assets/img/dish-rice.jpg',
     to_jsonb(ARRAY['大米','水']),
     '[]'::jsonb,
     to_jsonb(ARRAY['大米淘洗','加水 1:1.2','电饭锅煮饭 20 分钟','焖 5 分钟开盖']),
     25, 1),
    ('dddddddd-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '可乐鸡翅',   '热菜', 'assets/img/dish-wings.jpg',
     to_jsonb(ARRAY['鸡翅中','生姜','大葱','可乐']),
     to_jsonb(ARRAY['生抽','老抽','料酒','盐']),
     to_jsonb(ARRAY['鸡翅两面划刀焯水','生姜大葱切段','热油爆香葱姜','下鸡翅煎至两面金黄','倒可乐没过鸡翅','加生抽老抽料酒盐','大火烧开转小火','收汁出锅']),
     30, 4)
  on conflict (id) do nothing
),
-- 订单与明细（张阿姨家 2 单，王叔叔家 1 单，小李家空）
orders as (
  insert into public.order_main (
    id, family_id, user_id, user_name, note, status, created_at
  ) values
    ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '张阿姨', '',          'pending',  now() - interval '20 minutes'),
    ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', '小明',   '今晚想吃点热乎的', 'cooking', now() - interval '5 minutes'),
    ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', '王叔叔', '',          'pending',  now() - interval '10 minutes')
  on conflict do nothing
),
items as (
  insert into public.order_item (
    order_id, family_id, dish_id, dish_name, dish_image, servings, note, status
  ) values
    -- 张阿姨家 / 张阿姨
    ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', '宫保鸡丁',   'assets/img/dish-kungpao.jpg',       1, '',              'pending'),
    ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000002', '番茄蛋汤',   'assets/img/dish-tomato-soup.jpg',   1, '',              'pending'),
    ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000005', '白米饭',     'assets/img/dish-rice.jpg',          2, '',              'pending'),
    -- 张阿姨家 / 小明
    ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', '宫保鸡丁',   'assets/img/dish-kungpao.jpg',       2, '少辣',           'cooking'),
    ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000005', '白米饭',     'assets/img/dish-rice.jpg',          3, '',              'pending'),
    -- 王叔叔家 / 王叔叔
    ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000003', '红烧牛腩',   'assets/img/dish-beef.jpg',          2, '多炖一会儿',     'pending'),
    ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000002', '番茄蛋汤',   'assets/img/dish-tomato-soup.jpg',   1, '',              'pending'),
    ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000006', '凉拌黄瓜',   'assets/img/dish-cucumber.jpg',      1, '',              'pending')
  on conflict do nothing
)
select 'seed ok' as result;

-- 完成：
-- 3 个家庭：HOME77（张阿姨家）/ HOME88（王叔叔家）/ HOME99（小李家）
-- 厨师（固定 user_id 00000000...000001）自动是三个家庭的厨师
-- 张阿姨家有 2 个订单（3 道菜），王叔叔家有 1 个订单（3 道菜），小李家空
-- 共 8 道菜
