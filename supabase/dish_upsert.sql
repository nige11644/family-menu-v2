-- =====================================================
-- 自动生成 dish 表 upsert（从 seed.js）
-- 共 20 道菜，幂等执行
-- 已移除「香糯米饭」
-- =====================================================

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '宫保鸡丁', '热菜',
    'assets/img/dish-kungpao.jpg', '鸡丁滑嫩、花生酥脆、酸甜微辣，经典川菜下饭首选',
    '[{"name":"鸡胸肉","amount":300,"unit":"g","role":"main","note":"切 1cm 见方的丁"},{"name":"花生米","amount":80,"unit":"g","role":"sub","note":"冷油下锅炸至微黄"},{"name":"干辣椒","amount":6,"unit":"个","role":"sub","note":"剪成 2cm 段"},{"name":"干花椒","amount":20,"unit":"粒","role":"sub","note":""},{"name":"大葱白","amount":1,"unit":"根","role":"sub","note":"切 2cm 段"},{"name":"生姜","amount":3,"unit":"片","role":"sub","note":"切末"},{"name":"大蒜","amount":3,"unit":"瓣","role":"sub","note":"切末"}]'::jsonb, '[{"name":"生抽","amountText":"15ml","brandNote":"腌制与碗汁各半，推荐李锦记"},{"name":"料酒","amountText":"10ml","brandNote":"腌制用，推荐花雕酒"},{"name":"香醋","amountText":"15ml","brandNote":"碗汁用，推荐恒顺香醋"},{"name":"白糖","amountText":"8g","brandNote":"碗汁用，是关键甜味"},{"name":"玉米淀粉","amountText":"5g","brandNote":"分两次用：腌肉 + 碗汁"},{"name":"白胡椒粉","amountText":"1g","brandNote":"碗汁用"},{"name":"熟白芝麻","amountText":"2g","brandNote":"出锅撒"}]'::jsonb, '[{"description":"鸡胸肉切 1cm 见方的丁，加料酒 5ml + 生抽 7ml + 淀粉 2g 抓匀至有黏性，封少量食用油，腌制十分钟让纤维松弛","durationMinutes":10,"needTimer":true,"heatTip":"全程室温","tip":"用手抓比筷子拌更入味，封油是为了下锅不粘"},{"description":"碗汁提前调好：香醋 15ml + 生抽 8ml + 白糖 8g + 淀粉 3g + 清水 30ml + 白胡椒粉 1g，搅匀备用，这是整道菜的灵魂比例","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"糖和醋必须一起下，这才是\"宫保味\""},{"description":"花生米冷油小火慢炸，边炸边用漏勺搅动，五分钟后颜色微金黄立即捞出沥油，放凉 1 分钟会自动变脆","durationMinutes":5,"needTimer":true,"heatTip":"小火 120-140°C","tip":"千万不能等变深黄再捞，余热会把它炸糊"},{"description":"锅中留底油，烧至 170°C（油面微烟），下鸡丁快速滑炒至表面变白（约 1 分钟），立即盛出，锅留底油","durationMinutes":1,"needTimer":false,"heatTip":"大火 170°C","tip":"滑炒时间不能超过 1 分钟，否则肉会老"},{"description":"转中火，用锅里的底油煸香干辣椒段、干花椒、姜末、蒜末、葱段，至干辣椒微微变色出香（约 30 秒）","durationMinutes":0.5,"needTimer":false,"heatTip":"中火","tip":"花椒爆香后要立刻下主料，否则会发苦"},{"description":"倒入鸡丁翻炒两下，淋入碗汁，转大火快速翻炒收汁，让每颗丁都裹上酱汁","durationMinutes":1,"needTimer":false,"heatTip":"大火","tip":"碗汁下锅后大约 15 秒就会浓稠，手要快"},{"description":"最后倒入炸好的花生米和白芝麻翻炒两下，立刻关火装盘。花生最后放才能保持酥脆","durationMinutes":0.5,"needTimer":false,"heatTip":"关火后翻炒","tip":"花生一定最后放！炒早了会被酱汁泡软"}]'::jsonb,
    15, 20, '中',
    3, '含花生', 'on',
    1, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '红烧牛腩', '热菜',
    'assets/img/dish-beef.jpg', '小火慢炖 90 分钟，牛腩软烂入味，白萝卜吸饱汤汁',
    '[{"name":"牛腩","amount":800,"unit":"g","role":"main","note":"切 3cm 方块，选带点筋的更嫩"},{"name":"白萝卜","amount":300,"unit":"g","role":"sub","note":"滚刀块"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"拍松"},{"name":"大葱","amount":1,"unit":"根","role":"sub","note":"切 3cm 段"},{"name":"去皮大蒜","amount":5,"unit":"瓣","role":"sub","note":"整瓣"},{"name":"胡萝卜","amount":150,"unit":"g","role":"sub","note":"滚刀块（可选）"}]'::jsonb, '[{"name":"生抽","amountText":"30ml","brandNote":"推荐李锦记旧庄"},{"name":"老抽","amountText":"10ml","brandNote":"纯上色用，推荐海天"},{"name":"花雕酒","amountText":"20ml","brandNote":"比料酒香"},{"name":"冰糖","amountText":"15g","brandNote":"炒糖色用，黄冰糖更好"},{"name":"八角","amountText":"2 个","brandNote":""},{"name":"香叶","amountText":"2 片","brandNote":""},{"name":"桂皮","amountText":"1 小段","brandNote":"约 3cm"},{"name":"盐","amountText":"2g","brandNote":"最后调"}]'::jsonb, '[{"description":"牛腩冷水下锅，加姜片 2 片 + 花雕酒 5ml，水开后保持微沸 5 分钟，期间不断撇去表面白色浮沫，捞出用温水冲净血沫备用","durationMinutes":5,"needTimer":true,"heatTip":"大火烧开转微沸","tip":"冷水下锅逼出血水，温水冲避免肉收缩"},{"description":"热锅冷油下冰糖，小火慢慢炒，冰糖融化→变黄色→变枣红色冒小泡，这时候立刻下牛腩翻炒上色","durationMinutes":4,"needTimer":true,"heatTip":"小火 100-120°C","tip":"炒糖色全程小火，看见枣红色立即停，再烧就发苦"},{"description":"牛腩翻炒 2 分钟至表面全部上色，加入大葱段、拍姜、整瓣蒜、八角、香叶、桂皮一起翻炒出香味","durationMinutes":3,"needTimer":false,"heatTip":"中火","tip":"香料可以用纱布包起来，方便最后挑出来"},{"description":"加花雕酒 15ml + 生抽 30ml + 老抽 10ml，翻炒 30 秒让香气挥发，然后加**热水**没过牛腩 2cm，大火烧开","durationMinutes":2,"needTimer":false,"heatTip":"大火","tip":"一定加热水！加冷水会让肉遇冷收缩，炖不烂"},{"description":"撇净残余浮沫，盖上锅盖转**最小火**炖 60 分钟。期间不要开盖，保持微微冒泡就行","durationMinutes":60,"needTimer":true,"heatTip":"小火 90-100°C 微沸","tip":"判断烂不烂：筷子能轻松扎透，没有阻力"},{"description":"打开锅盖，下白萝卜和胡萝卜块，加盐 2g 调味，继续小火炖 15 分钟","durationMinutes":15,"needTimer":true,"heatTip":"小火","tip":"萝卜不要早放，煮太烂会散"},{"description":"最后开盖转大火收汁 5-8 分钟，让汤汁变浓稠挂在肉上，撒葱花出锅","durationMinutes":5,"needTimer":true,"heatTip":"大火收汁","tip":"收汁时要不停翻动，避免糊底"}]'::jsonb,
    25, 90, '中',
    4, '无', 'on',
    2, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '可乐鸡翅', '热菜',
    'assets/img/dish-wings.jpg', '甜咸油亮，孩子最爱。零厨艺零失败',
    '[{"name":"鸡翅中","amount":8,"unit":"个","role":"main","note":"两面各划两刀方便入味"},{"name":"生姜","amount":3,"unit":"片","role":"sub","note":""},{"name":"大葱","amount":5,"unit":"段","role":"sub","note":""}]'::jsonb, '[{"name":"可乐","amountText":"330ml","brandNote":"普通含糖可口可乐，零度不行"},{"name":"生抽","amountText":"20ml","brandNote":"推荐海天味极鲜"},{"name":"花雕酒","amountText":"10ml","brandNote":"没有用料酒代替"},{"name":"老抽","amountText":"2ml","brandNote":"只提亮色，别多放"},{"name":"盐","amountText":"0.5g","brandNote":"最后调"},{"name":"白芝麻","amountText":"2g","brandNote":"出锅撒"}]'::jsonb, '[{"description":"鸡翅两面划两刀，冷水下锅 + 姜片 + 花雕酒，水开后焯 3 分钟捞出，用温水冲净擦干水分（擦干才能煎出金黄）","durationMinutes":5,"needTimer":true,"heatTip":"大火","tip":"擦干是关键，湿的鸡翅下锅会溅油也煎不脆"},{"description":"不粘锅倒少许油（5ml），小火把鸡翅两面各煎 3 分钟至均匀金黄色，边缘微焦","durationMinutes":6,"needTimer":true,"heatTip":"小火 140°C","tip":"用不粘锅+小火，基本不会糊"},{"description":"下葱段姜片翻炒两下出香，倒入整罐可乐 + 生抽 20ml + 老抽 2ml，水量刚没过鸡翅","durationMinutes":2,"needTimer":false,"heatTip":"大火烧开","tip":"可乐倒进去会冒泡，不要倒太满"},{"description":"大火烧开后转中小火盖盖焖 12 分钟，让可乐的甜味和生抽融合","durationMinutes":12,"needTimer":true,"heatTip":"中小火","tip":"中途开盖翻一次面，让另一面也入味"},{"description":"开盖大火收汁，同时不停翻动鸡翅，约 3-5 分钟汤汁变得浓稠油亮，加盐微调咸淡","durationMinutes":4,"needTimer":true,"heatTip":"大火","tip":"汁收得越干越亮越好吃，快糊时立刻关火"},{"description":"装盘撒白芝麻即可，简单又好看","durationMinutes":0,"needTimer":false,"heatTip":""}]'::jsonb,
    10, 25, '易',
    3, '无', 'on',
    3, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '鱼香肉丝', '热菜',
    'assets/img/dish-yu-xiang.jpg', '酸辣甜鲜咸，四川菜里最下饭的经典',
    '[{"name":"猪里脊","amount":300,"unit":"g","role":"main","note":"切丝，越细越好"},{"name":"泡红辣椒","amount":3,"unit":"根","role":"sub","note":"剁碎（没有用剁椒代替）"},{"name":"胡萝卜","amount":100,"unit":"g","role":"sub","note":"切细丝"},{"name":"水发木耳","amount":80,"unit":"g","role":"sub","note":"切细丝"},{"name":"冬笋","amount":100,"unit":"g","role":"sub","note":"切细丝（可选，用笋罐头也可）"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"切末"},{"name":"大蒜","amount":3,"unit":"瓣","role":"sub","note":"切末"},{"name":"小葱","amount":2,"unit":"根","role":"sub","note":"切葱花"}]'::jsonb, '[{"name":"花雕酒","amountText":"10ml","brandNote":"腌肉用"},{"name":"生抽","amountText":"15ml","brandNote":"腌肉 + 碗汁"},{"name":"香醋","amountText":"20ml","brandNote":"碗汁核心，推荐保宁醋"},{"name":"白糖","amountText":"12g","brandNote":"鱼香必须有糖"},{"name":"玉米淀粉","amountText":"8g","brandNote":"腌肉 3g + 碗汁 5g"},{"name":"郫县豆瓣酱","amountText":"15g","brandNote":"剁碎，推荐鹃城牌"}]'::jsonb, '[{"description":"猪里脊切丝，加花雕酒 5ml + 生抽 5ml + 淀粉 3g + 清水 5ml 抓匀，封油腌 10 分钟","durationMinutes":10,"needTimer":true,"heatTip":"","tip":"肉丝加清水抓是四川炒菜的秘诀，更嫩"},{"description":"调碗汁：香醋 20ml + 生抽 10ml + 白糖 12g + 淀粉 5g + 清水 40ml，搅匀备用","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"糖醋比例 5:3 是标准鱼香味"},{"description":"热锅冷油，下肉丝大火快速滑散，约 1 分钟肉丝变白立即盛出","durationMinutes":1,"needTimer":false,"heatTip":"大火 170°C","tip":"肉丝滑炒时间越短越嫩"},{"description":"锅里留底油，小火下郫县豆瓣酱 + 泡红辣椒碎 + 姜末蒜末，炒出红油和香气","durationMinutes":1.5,"needTimer":false,"heatTip":"小火","tip":"豆瓣酱一定要炒出红油才香，别省这步"},{"description":"下胡萝卜丝、木耳丝、冬笋丝大火翻炒 1 分钟至断生","durationMinutes":1,"needTimer":false,"heatTip":"大火","tip":"配菜要切得和肉丝差不多细，才好熟"},{"description":"倒回肉丝翻两下，立刻淋入碗汁，大火快速翻炒至汁浓稠裹住所有食材","durationMinutes":1,"needTimer":false,"heatTip":"大火","tip":"碗汁下锅 15 秒内就会浓稠，手要快"},{"description":"撒葱花翻两下出锅，红亮油润，酸辣开胃","durationMinutes":0.5,"needTimer":false,"heatTip":"关火"}]'::jsonb,
    12, 18, '中',
    3, '无', 'on',
    4, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '糖醋排骨', '热菜',
    'assets/img/dish-ribs.jpg', '外酥里嫩，酸甜开胃，宴客硬菜',
    '[{"name":"肋排","amount":600,"unit":"g","role":"main","note":"切 3cm 段"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"拍松"},{"name":"大葱","amount":1,"unit":"根","role":"sub","note":"切段"},{"name":"白芝麻","amount":"3g","unit":"","role":"sub","note":"熟的，出锅撒"}]'::jsonb, '[{"name":"花雕酒","amountText":"20ml","brandNote":"腌制 + 烧"},{"name":"生抽","amountText":"15ml","brandNote":"腌肉"},{"name":"香醋","amountText":"30ml","brandNote":"核心酸甜，推荐保宁"},{"name":"白糖","amountText":"25g","brandNote":"糖醋比例 6:5"},{"name":"玉米淀粉","amountText":"20g","brandNote":"裹干粉炸"},{"name":"盐","amountText":"2g","brandNote":"腌肉"},{"name":"白胡椒粉","amountText":"1g","brandNote":"腌肉"}]'::jsonb, '[{"description":"肋排冷水下锅 + 姜 + 葱 + 花雕酒 10ml，焯 5 分钟去血水，捞出用温水冲净沥干","durationMinutes":5,"needTimer":true,"heatTip":"大火","tip":"焯过的肉炸的时候不会爆油"},{"description":"沥干的排骨加花雕酒 10ml + 生抽 15ml + 盐 2g + 白胡椒粉 1g 抓匀腌 15 分钟","durationMinutes":15,"needTimer":true,"heatTip":"","tip":"腌好后沥掉多余汤汁，才能粘住淀粉"},{"description":"腌好的排骨逐条滚上干淀粉，让每根表面均匀裹上一层，静置 5 分钟让淀粉回潮","durationMinutes":5,"needTimer":true,"heatTip":"","tip":"回潮后炸出来的壳更硬挺"},{"description":"油温烧到 160°C（筷子插进去冒细密小泡），下排骨中小火炸 8 分钟至定型金黄，捞出","durationMinutes":8,"needTimer":true,"heatTip":"中小火 160°C","tip":"第一次炸是定型，不要图快开大火"},{"description":"油温升到 190°C（筷子插进去冒大泡），下排骨复炸 1.5 分钟至外壳酥脆，捞出沥油","durationMinutes":1.5,"needTimer":true,"heatTip":"大火 190°C","tip":"复炸是酥脆的关键，油温一定要够"},{"description":"锅留底油，小火下白糖 25g 炒至融化变金黄色，立即加香醋 30ml + 清水 50ml + 生抽 5ml，烧开","durationMinutes":3,"needTimer":true,"heatTip":"小火","tip":"糖变金黄色就停，不要等枣红色，这次不炒糖色是要脆壳"},{"description":"糖醋汁烧开后下炸好的排骨，快速翻炒让每根都裹上汁，收汁到浓稠撒白芝麻出锅","durationMinutes":2,"needTimer":false,"heatTip":"大火收汁","tip":"快速翻炒！炸好的排骨吸汁后很快变软，动作要快"}]'::jsonb,
    15, 35, '中',
    4, '无', 'on',
    5, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000001', '麻婆豆腐', '热菜',
    'assets/img/dish-mapo-tofu.jpg', '麻辣鲜香烫，豆腐嫩得能抿，一勺盖饭最过瘾',
    '[{"name":"嫩豆腐","amount":400,"unit":"g","role":"main","note":"切 2cm 方块，别用老豆腐"},{"name":"牛肉末","amount":80,"unit":"g","role":"main","note":"猪肉末也可以"},{"name":"蒜苗","amount":2,"unit":"根","role":"sub","note":"斜切 1cm 段，没有用小葱"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"切末"},{"name":"大蒜","amount":3,"unit":"瓣","role":"sub","note":"切末"}]'::jsonb, '[{"name":"郫县豆瓣酱","amountText":"20g","brandNote":"剁细，推荐鹃城牌"},{"name":"豆豉","amountText":"5g","brandNote":"剁碎，增香关键"},{"name":"辣椒面","amountText":"3g","brandNote":"增红亮"},{"name":"花椒粉","amountText":"2g","brandNote":"出锅撒，现磨最香"},{"name":"生抽","amountText":"10ml","brandNote":""},{"name":"花雕酒","amountText":"10ml","brandNote":"炒肉末用"},{"name":"玉米淀粉","amountText":"5g","brandNote":"加水调成水淀粉"}]'::jsonb, '[{"description":"豆腐切 2cm 方块，放入加 2g 盐的温水中浸 3 分钟，捞出沥干。盐水浸过的豆腐不易碎、也不会有豆腥味","durationMinutes":3,"needTimer":true,"heatTip":"温水","tip":"千万别用开水烫，嫩豆腐一烫就散"},{"description":"锅下 10ml 油，中火下牛肉末炒散炒干水分，加花雕酒 10ml 去腥，炒到肉末微微酥香盛出","durationMinutes":3,"needTimer":false,"heatTip":"中火","tip":"肉末要炒到粒粒分明，不能水汪汪"},{"description":"转小火，下郫县豆瓣酱 20g + 豆豉 + 姜末蒜末，慢慢炒 2 分钟炒出红油，加辣椒面 3g 炒香","durationMinutes":2,"needTimer":true,"heatTip":"小火 100°C","tip":"这一步叫\"炒香\"，红油出来了整道菜才红亮"},{"description":"加 300ml 清水烧开，倒回牛肉末，用铲子把豆腐沿着锅边轻轻推入，**不要用铲子翻**，轻推锅底晃开","durationMinutes":2,"needTimer":false,"heatTip":"中小火","tip":"全程用推不用翻，豆腐才完整"},{"description":"中小火煮 5 分钟让豆腐入味，分 2 次淋入水淀粉，每次等汤汁变稠再淋下一次，轻轻推匀","durationMinutes":5,"needTimer":true,"heatTip":"中小火","tip":"分两次勾芡，汁才能挂得住豆腐"},{"description":"撒蒜苗段推匀，关火装盘，最后撒花椒粉。麻婆豆腐讲究\"麻在最后\"，花椒粉一定要离火后再撒","durationMinutes":1,"needTimer":false,"heatTip":"关火","tip":"花椒粉下锅炒会发苦，只能出锅撒"}]'::jsonb,
    10, 12, '中',
    3, '含大豆', 'on',
    6, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '清蒸鲈鱼', '热菜',
    'assets/img/dish-steamed-fish.jpg', '肉嫩如豆腐，一勺豉油淋热油，宴客最有面子的一道',
    '[{"name":"鲈鱼","amount":1,"unit":"条","role":"main","note":"约 600g，现杀的最鲜"},{"name":"大葱","amount":1,"unit":"根","role":"sub","note":"葱白切细丝泡水会卷"},{"name":"小葱","amount":3,"unit":"根","role":"sub","note":"垫鱼身用"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"一半切片一半切细丝"},{"name":"红椒","amount":1,"unit":"个","role":"sub","note":"切细丝装饰（可选）"}]'::jsonb, '[{"name":"蒸鱼豉油","amountText":"30ml","brandNote":"推荐李锦记蒸鱼豉油"},{"name":"花雕酒","amountText":"10ml","brandNote":"去腥"},{"name":"盐","amountText":"3g","brandNote":"抹鱼身"},{"name":"食用油","amountText":"20ml","brandNote":"最后泼热油"}]'::jsonb, '[{"description":"鲈鱼洗净，用厨房纸把鱼身内外擦干，两面各划两刀（深至骨），抹盐 3g + 花雕酒 10ml，鱼肚里塞姜片和葱段，腌 10 分钟","durationMinutes":10,"needTimer":true,"heatTip":"","tip":"擦干是关键，带水下锅蒸出来腥"},{"description":"盘底铺小葱段和姜片把鱼架空，让蒸汽能从底下过。鱼身上再放两片姜","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"把鱼架空，受热才均匀，鱼底也不会泡在汤汁里"},{"description":"蒸锅水大开后放入鱼，**大火蒸 7 分钟**（600g 左右），关火不开盖再焖 2 分钟","durationMinutes":9,"needTimer":true,"heatTip":"大火沸水","tip":"一定水开后再放鱼，冷水上锅肉会老"},{"description":"取出鱼，倒掉盘中所有汤汁（这汁最腥），夹走葱姜","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"这一步别省，倒掉蒸出来的水腥味少一半"},{"description":"鱼身铺新的葱丝、姜丝、红椒丝，沿盘边淋蒸鱼豉油 30ml（不要直接淋鱼身上）","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"豉油沿盘边淋，鱼身颜色才干净"},{"description":"另起锅烧 20ml 油至冒青烟（约 200°C），均匀泼在葱姜丝上，\"刺啦\"一声香味就出来了","durationMinutes":1,"needTimer":false,"heatTip":"大火 200°C","tip":"油一定要烧到冒烟，泼下去才香"}]'::jsonb,
    12, 10, '中',
    3, '含鱼', 'on',
    7, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '凉拌黄瓜', '凉菜',
    'assets/img/dish-cucumber.jpg', '拍碎比切更入味，五分钟上桌',
    '[{"name":"黄瓜","amount":2,"unit":"根","role":"main","note":"选直挺硬实的，拍裂切段"},{"name":"大蒜","amount":3,"unit":"瓣","role":"sub","note":"拍碎切末"},{"name":"红小米椒","amount":1,"unit":"个","role":"sub","note":"切圈（可选，喜欢辣加）"},{"name":"香菜","amount":1,"unit":"小把","role":"sub","note":"切 2cm 段"}]'::jsonb, '[{"name":"生抽","amountText":"15ml","brandNote":"推荐海天"},{"name":"香醋","amountText":"10ml","brandNote":"推荐恒顺"},{"name":"香油","amountText":"5ml","brandNote":"增香"},{"name":"自制辣椒油","amountText":"5ml","brandNote":"按口味增减"},{"name":"白砂糖","amountText":"2g","brandNote":"提鲜，别多"},{"name":"盐","amountText":"1g","brandNote":"腌黄瓜用"},{"name":"熟白芝麻","amountText":"3g","brandNote":"最后撒"}]'::jsonb, '[{"description":"黄瓜洗净，用菜刀平面从中间拍碎（别用刀背），再切成 4cm 左右的段，放盆里","durationMinutes":3,"needTimer":false,"heatTip":"","tip":"拍碎的黄瓜表面有裂痕，比刀切的平面更能吸附调料"},{"description":"加 1g 盐抓匀腌 3 分钟，会渗出不少水，把水倒掉。这步是让黄瓜去涩出水","durationMinutes":3,"needTimer":true,"heatTip":"","tip":"腌出水一定要倒干净，不然拌完会水汪汪"},{"description":"加蒜末、小米椒圈（不辣不加）、生抽、香醋、香油、辣椒油、白糖，抓匀","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"拌的时候尝一下咸淡，不够再加"},{"description":"最后撒香菜段和白芝麻，装盘上桌。要更入味可冷藏 10 分钟","durationMinutes":0.5,"needTimer":false,"heatTip":""}]'::jsonb,
    7, 3, '易',
    2, '含芝麻', 'on',
    8, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '凉拌木耳', '凉菜',
    'assets/img/dish-wood-ear.jpg', '脆嫩爽口，酸辣解腻，配大鱼大肉最合适',
    '[{"name":"干木耳","amount":30,"unit":"g","role":"main","note":"冷水泡 1 小时，约出 200g"},{"name":"大蒜","amount":4,"unit":"瓣","role":"sub","note":"切末"},{"name":"小米椒","amount":2,"unit":"个","role":"sub","note":"切圈"},{"name":"香菜","amount":1,"unit":"小把","role":"sub","note":"切 3cm 段"},{"name":"小葱","amount":1,"unit":"根","role":"sub","note":"切葱花"}]'::jsonb, '[{"name":"生抽","amountText":"15ml","brandNote":""},{"name":"香醋","amountText":"15ml","brandNote":"推荐恒顺香醋"},{"name":"香油","amountText":"5ml","brandNote":""},{"name":"辣椒油","amountText":"8ml","brandNote":"自制的最香"},{"name":"白糖","amountText":"3g","brandNote":"提鲜"},{"name":"盐","amountText":"2g","brandNote":""},{"name":"熟白芝麻","amountText":"3g","brandNote":"最后撒"}]'::jsonb, '[{"description":"干木耳用冷水泡 1 小时至完全舒展（冷水泡才脆），撕成小朵，剪掉根部硬蒂，多淘洗两遍去泥沙","durationMinutes":60,"needTimer":true,"heatTip":"","tip":"千万别用热水泡，热水泡出来发软没口感"},{"description":"水烧开下木耳焯 2 分钟，捞出立刻过冷水（有条件加冰块），沥干水分","durationMinutes":3,"needTimer":true,"heatTip":"大火沸水","tip":"焯完过冰水，脆感翻倍"},{"description":"木耳放大盆，加蒜末、小米椒圈、生抽、香醋、香油、辣椒油、白糖、盐，用手抓匀（比筷子拌更均匀）","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"拌好后尝一下，酸了加糖、淡了加生抽"},{"description":"撒香菜段、葱花和白芝麻，装盘。冷藏 15 分钟更入味","durationMinutes":1,"needTimer":false,"heatTip":""}]'::jsonb,
    8, 5, '易',
    2, '含芝麻', 'on',
    9, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '番茄蛋汤', '汤',
    'assets/img/dish-tomato-soup.jpg', '酸甜开胃，十分钟搞定，最适合下饭的汤',
    '[{"name":"番茄","amount":2,"unit":"个","role":"main","note":"选红透的，越红越出沙"},{"name":"鸡蛋","amount":2,"unit":"个","role":"main","note":"充分打散"},{"name":"小葱","amount":1,"unit":"根","role":"sub","note":"切葱花"},{"name":"生姜","amount":1,"unit":"片","role":"sub","note":"拍碎"}]'::jsonb, '[{"name":"盐","amountText":"3g","brandNote":"分两次调味"},{"name":"白糖","amountText":"2g","brandNote":"中和番茄的酸，提鲜"},{"name":"香油","amountText":"3ml","brandNote":"出锅前淋"}]'::jsonb, '[{"description":"番茄顶部划十字，开水烫 30 秒后去皮，切成小块（越小越容易出沙）","durationMinutes":1,"needTimer":true,"heatTip":"开水","tip":"去皮是关键，不去皮的汤喝起来有渣"},{"description":"鸡蛋打散加 0.5g 盐，用筷子打 1 分钟充分打匀，越散蛋花越细","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"蛋液里可以加 5ml 清水，蛋花更嫩"},{"description":"锅中少油（5ml），小火放姜片爆香后取出姜片，下番茄块","durationMinutes":0.5,"needTimer":false,"heatTip":"小火","tip":"姜片只是增香，不喜欢可以不放"},{"description":"用铲子把番茄一边翻炒一边压碎，中火 3 分钟炒出红油出沙状态，看不到完整的番茄块","durationMinutes":3,"needTimer":true,"heatTip":"中火","tip":"这步是汤浓不浓的关键，必须炒到出沙"},{"description":"加 800ml 清水，大火烧开后转中小火煮 3 分钟，让味道融合","durationMinutes":3,"needTimer":true,"heatTip":"中小火","tip":"水可以用热水，加快速度"},{"description":"调小火（保持微沸不沸腾），用筷子贴着水面慢慢倒入蛋液，**不要搅拌**，静置 5 秒","durationMinutes":1,"needTimer":true,"heatTip":"小火 微沸","tip":"蛋花是否薄如云彩全看这步：水温不能沸腾，倒蛋速度要慢"},{"description":"加盐 2.5g + 白糖 2g 调味，轻轻从底部推动两下蛋花，关火淋香油撒葱花","durationMinutes":0.5,"needTimer":false,"heatTip":"关火"}]'::jsonb,
    5, 10, '易',
    3, '无', 'on',
    10, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '紫菜蛋花汤', '汤',
    'assets/img/dish-seaweed.jpg', '比番茄蛋汤更清爽，配重油重辣的菜刚刚好',
    '[{"name":"干紫菜","amount":1,"unit":"小坨","role":"main","note":"大概 5g，撕碎"},{"name":"鸡蛋","amount":1,"unit":"个","role":"main","note":"打散"},{"name":"虾皮","amount":5,"unit":"g","role":"sub","note":"提鲜"},{"name":"小葱","amount":1,"unit":"根","role":"sub","note":"切葱花"}]'::jsonb, '[{"name":"盐","amountText":"2g","brandNote":""},{"name":"香油","amountText":"3ml","brandNote":"出锅淋"}]'::jsonb, '[{"description":"干紫菜撕碎放碗底，加虾皮备用（如果虾皮有沙提前洗一下）","durationMinutes":0.5,"needTimer":false,"heatTip":""},{"description":"鸡蛋打散，锅烧 600ml 清水加姜片，大火烧开后捞出姜片","durationMinutes":2,"needTimer":true,"heatTip":"大火烧开"},{"description":"水保持微沸，沿锅边慢慢倒入蛋液形成蛋花，然后加盐调味","durationMinutes":0.5,"needTimer":false,"heatTip":"微沸","tip":"和番茄蛋汤一样，不要沸腾时倒蛋"},{"description":"关火，把热汤倒入装紫菜虾皮的碗里（冲的动作会让紫菜散开蛋花更均匀）","durationMinutes":0.5,"needTimer":false,"heatTip":"关火","tip":"热汤直接冲碗里的紫菜，不用回锅里煮"},{"description":"淋香油撒葱花，完成。简单快手清淡","durationMinutes":0.5,"needTimer":false,"heatTip":""}]'::jsonb,
    3, 6, '易',
    3, '无', 'on',
    11, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '冬瓜排骨汤', '汤',
    'assets/img/dish-wintermelon-soup.jpg', '汤清味鲜，冬瓜吸饱肉香，夏天喝最舒服',
    '[{"name":"肋排","amount":500,"unit":"g","role":"main","note":"切 4cm 段"},{"name":"冬瓜","amount":400,"unit":"g","role":"main","note":"去皮去囊，切 3cm 厚片"},{"name":"生姜","amount":1,"unit":"块","role":"sub","note":"切片"},{"name":"小葱","amount":2,"unit":"根","role":"sub","note":"一根打结，一根切葱花"},{"name":"枸杞","amount":10,"unit":"粒","role":"sub","note":"最后 5 分钟放"}]'::jsonb, '[{"name":"盐","amountText":"4g","brandNote":"最后调，分两次加"},{"name":"花雕酒","amountText":"10ml","brandNote":"焯水去腥"},{"name":"白胡椒粉","amountText":"2g","brandNote":"出锅撒，暖胃"}]'::jsonb, '[{"description":"排骨冷水下锅，加姜片 + 花雕酒 10ml，水开后微沸 5 分钟，撇净浮沫，捞出用温水冲洗干净","durationMinutes":5,"needTimer":true,"heatTip":"大火烧开转微沸","tip":"温水冲，冷水冲会让肉收缩发柴"},{"description":"排骨放入汤锅，加 1500ml 清水 + 姜片 + 葱结，大火烧开后转小火盖盖炖 40 分钟","durationMinutes":40,"needTimer":true,"heatTip":"小火 95°C 微沸","tip":"汤要清就不能大火滚，保持微沸"},{"description":"冬瓜去皮去囊切 3cm 厚片，下锅继续炖 15 分钟至冬瓜变透明","durationMinutes":15,"needTimer":true,"heatTip":"小火","tip":"冬瓜厚切，煮久了才不会烂成泥"},{"description":"加盐 4g 调味（先加 3g尝味再补），放枸杞再煮 5 分钟","durationMinutes":5,"needTimer":true,"heatTip":"小火","tip":"盐一定最后放，早放肉会紧"},{"description":"关火撒白胡椒粉和葱花，撇掉表面浮油，盛碗趁热喝","durationMinutes":1,"needTimer":false,"heatTip":"关火","tip":"撇油后汤更清爽，老人小孩都能喝"}]'::jsonb,
    10, 60, '易',
    4, '无', 'on',
    12, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', '黄金蛋炒饭', '主食',
    'assets/img/dish-fried-rice.jpg', '粒粒分开金黄诱人，用隔夜饭炒才香',
    '[{"name":"隔夜米饭","amount":400,"unit":"g","role":"main","note":"冷藏一晚水分更少，最好炒"},{"name":"鸡蛋","amount":2,"unit":"个","role":"main","note":"打散"},{"name":"小葱","amount":2,"unit":"根","role":"sub","note":"切葱花，葱白葱绿分开"},{"name":"火腿丁","amount":50,"unit":"g","role":"sub","note":"可选，没有就用腊肠"}]'::jsonb, '[{"name":"盐","amountText":"3g","brandNote":""},{"name":"生抽","amountText":"5ml","brandNote":"可选，增色"}]'::jsonb, '[{"description":"隔夜饭用手捏散成一粒粒，不要有硬块（如果结块多可以喷一点清水再捏）","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"冷饭比热饭好炒，因为水分少不会粘"},{"description":"鸡蛋打散加 1g 盐打匀，倒在饭碗里，把捏散的米饭放进去拌匀，让每粒米都裹上蛋液（黄金炒饭秘诀）","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"不是先炒蛋再放饭，而是饭裹蛋下锅一起炒！"},{"description":"热锅大火烧透，倒 10ml 油，油温够高时倒入裹蛋液的米饭，**大火快速翻炒**","durationMinutes":3,"needTimer":true,"heatTip":"大火 170°C","tip":"火要大！油要热！快速翻炒不停，才能金黄不粘锅"},{"description":"炒到米粒蓬松金黄（约 2 分钟），下葱白和火腿丁翻炒几下","durationMinutes":1,"needTimer":false,"heatTip":"大火"},{"description":"加盐 2g + 生抽 5ml 调味，炒匀","durationMinutes":0.5,"needTimer":false,"heatTip":""},{"description":"最后撒葱绿翻两下就关火装盘，颜色金黄粒粒分明","durationMinutes":0.5,"needTimer":false,"heatTip":"关火"}]'::jsonb,
    5, 10, '易',
    2, '无', 'on',
    13, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', '葱油拌面', '主食',
    'assets/img/dish-noodles.jpg', '一碗葱香四溢的老上海味道，东西不多但极香',
    '[{"name":"细挂面","amount":250,"unit":"g","role":"main","note":"细面更容易挂上葱油"},{"name":"小葱","amount":8,"unit":"根","role":"main","note":"葱白葱绿分开切段"},{"name":"开洋（虾米）","amount":10,"unit":"g","role":"sub","note":"温水泡 10 分钟（可选）"}]'::jsonb, '[{"name":"生抽","amountText":"30ml","brandNote":"推荐六月鲜"},{"name":"老抽","amountText":"10ml","brandNote":"上色，别多"},{"name":"白糖","amountText":"10g","brandNote":"提鲜，不能省"},{"name":"食用油","amountText":"60ml","brandNote":"熬葱油用，菜籽油最香"},{"name":"盐","amountText":"1g","brandNote":"煮面用"}]'::jsonb, '[{"description":"小葱洗净彻底晾干（一定不能带水，否则炸油会炸锅），葱白切 4cm 段，葱绿切长段分开放","durationMinutes":3,"needTimer":false,"heatTip":"","tip":"带水下锅会溅油，擦干再切"},{"description":"冷油下葱白，全程最小火慢炸 8 分钟，炸到葱白变浅褐色，再下葱绿炸 3 分钟至微焦，捞出葱段备用","durationMinutes":11,"needTimer":true,"heatTip":"最小火 110°C","tip":"葱油不能急，火大葱会苦，小火才甜香"},{"description":"葱油锅里关火稍晾，加生抽 30ml + 老抽 10ml + 白糖 10g，再开小火煮 1 分钟至糖化，倒出备用（这就是葱油汁）","durationMinutes":2,"needTimer":false,"heatTip":"小火","tip":"热油直接倒酱油会猛烈冒泡，稍晾一下更安全"},{"description":"另起锅烧水，水大开加 1g 盐下挂面，按包装时间煮（一般 3-4 分钟），捞出**不要过水**，直接沥干","durationMinutes":4,"needTimer":true,"heatTip":"大火沸水","tip":"面不要过冷水，热面才能吸住葱油"},{"description":"面条倒入碗中，淋 2-3 勺葱油汁，撒上炸好的葱段和泡软的虾米，拌匀开吃。拌的时候会\"哗啦\"响，就是对了","durationMinutes":1,"needTimer":false,"heatTip":"","tip":"面要趁热拌，凉了就拌不开"}]'::jsonb,
    5, 15, '易',
    2, '含小麦', 'on',
    14, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001', '蒜蓉西兰花', '素菜',
    'assets/img/dish-broccoli.jpg', '翠绿爽脆蒜香浓郁，10 分钟上桌的快手青菜',
    '[{"name":"西兰花","amount":400,"unit":"g","role":"main","note":"掰小朵，底部粗茎切薄片"},{"name":"大蒜","amount":6,"unit":"瓣","role":"sub","note":"5 瓣切末 + 1 瓣拍扁爆香"}]'::jsonb, '[{"name":"盐","amountText":"3g","brandNote":"分两次"},{"name":"蚝油","amountText":"10ml","brandNote":"推荐李锦记旧庄"},{"name":"食用油","amountText":"15ml","brandNote":""}]'::jsonb, '[{"description":"西兰花掰小朵（每朵大小一致才好同时熟），淡盐水泡 5 分钟逼虫子，冲净沥干","durationMinutes":5,"needTimer":true,"heatTip":"","tip":"底部粗茎切片一起炒，不浪费还口感好"},{"description":"水烧开加 1g 盐 + 5ml 油，下西兰花焯 1 分钟，**看到颜色变翠绿立刻捞出过凉水**","durationMinutes":1,"needTimer":true,"heatTip":"大火开水","tip":"过凉水是保持翠绿的关键，否则会黄"},{"description":"热锅小火下 10ml 油，加拍扁的 1 瓣蒜爆香后取出，再下蒜末，小火煸至微黄出香","durationMinutes":1,"needTimer":false,"heatTip":"小火","tip":"蒜末不能炒糊，糊了会发苦"},{"description":"开大火倒入沥干的西兰花翻炒两下，加 2g 盐 + 蚝油 10ml，快速翻匀出锅","durationMinutes":1,"needTimer":false,"heatTip":"大火快速炒","tip":"西兰花已经焯熟了，下锅只是裹上蒜香和蚝油"}]'::jsonb,
    5, 8, '易',
    2, '无', 'on',
    15, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000001', '蒜蓉娃娃菜', '素菜',
    'assets/img/dish-bok-choy.jpg', '清甜软嫩，蒜香浓郁，比炒的更多汁',
    '[{"name":"娃娃菜","amount":2,"unit":"棵","role":"main","note":"选包得紧的，叶子亮"},{"name":"大蒜","amount":6,"unit":"瓣","role":"sub","note":"切末，留 1 瓣切蒜片"},{"name":"小米椒","amount":1,"unit":"个","role":"sub","note":"切圈（可选装饰）"}]'::jsonb, '[{"name":"盐","amountText":"2g","brandNote":""},{"name":"蚝油","amountText":"10ml","brandNote":""},{"name":"生抽","amountText":"5ml","brandNote":""},{"name":"水淀粉","amountText":"10g","brandNote":"淀粉 5g + 清水 10ml"}]'::jsonb, '[{"description":"娃娃菜切掉根部，叶子一片片剥下，大叶子对半切，洗净沥干","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"根部要切干净，泥多"},{"description":"水开加 1g 盐 + 3ml 油，下娃娃菜焯 1 分钟，变软就捞出过凉水沥干","durationMinutes":1,"needTimer":true,"heatTip":"大火","tip":"焯到叶子软了就行，别煮烂"},{"description":"热锅 10ml 油，小火下蒜片爆香取出，蒜末煸至微黄","durationMinutes":0.5,"needTimer":false,"heatTip":"小火"},{"description":"倒蚝油 + 生抽 + 50ml 清水烧开，加盐调味","durationMinutes":0.5,"needTimer":false,"heatTip":""},{"description":"下焯好的娃娃菜翻炒 1 分钟入味，淋水淀粉勾薄芡出锅，撒小米椒圈装饰","durationMinutes":1,"needTimer":false,"heatTip":"大火","tip":"勾薄芡就好，厚了糊住菜叶不好吃"}]'::jsonb,
    5, 7, '易',
    2, '无', 'on',
    16, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', '手撕包菜', '素菜',
    'assets/img/dish-cabbage.jpg', '干香带锅气，包菜边焦边脆，饭店味在家做',
    '[{"name":"包菜","amount":400,"unit":"g","role":"main","note":"选松散的尖包菜，手撕成小片"},{"name":"大蒜","amount":4,"unit":"瓣","role":"sub","note":"切片"},{"name":"干辣椒","amount":4,"unit":"个","role":"sub","note":"剪段，怕辣可去籽"},{"name":"五花肉片","amount":30,"unit":"g","role":"sub","note":"可选，加点更香"}]'::jsonb, '[{"name":"生抽","amountText":"10ml","brandNote":""},{"name":"香醋","amountText":"5ml","brandNote":"沿锅边淋，增锅气"},{"name":"白糖","amountText":"2g","brandNote":"提鲜"},{"name":"盐","amountText":"2g","brandNote":""},{"name":"食用油","amountText":"15ml","brandNote":""}]'::jsonb, '[{"description":"包菜去掉硬芯，用手撕成 5cm 小片（手撕的断面不规则，比刀切更容易挂汁），洗净后**彻底沥干**","durationMinutes":4,"needTimer":false,"heatTip":"","tip":"带水下锅会变成水煮包菜，一点锅气都没有"},{"description":"锅烧到冒烟，下油滑锅倒出，再下 15ml 冷油，这样铁锅不粘","durationMinutes":1,"needTimer":false,"heatTip":"大火烧锅","tip":"热锅冷油是炒包菜不粘的关键"},{"description":"下五花肉片（可选）煸出油，再下蒜片和干辣椒段，小火煸 20 秒出香","durationMinutes":0.5,"needTimer":false,"heatTip":"小火","tip":"辣椒别炒黑，黑了整盘发苦"},{"description":"转**最大火**倒入包菜，快速翻炒 90 秒，看到边缘出现焦边、菜叶变软就对了","durationMinutes":1.5,"needTimer":true,"heatTip":"大火 200°C","tip":"全程大火快炒，慢炒出水就废了"},{"description":"沿锅边淋香醋 5ml（\"激\"一下出香），加盐 2g + 生抽 10ml + 白糖 2g，翻炒 20 秒就出锅","durationMinutes":0.5,"needTimer":false,"heatTip":"大火","tip":"醋沿锅边淋而不是倒菜上，锅气全在这一下"}]'::jsonb,
    6, 6, '易',
    2, '无', 'on',
    17, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    '1e42bcf3-1c53-4493-866e-1d7fb74767f5', '00000000-0000-0000-0000-000000000001', '银耳雪梨羹', '甜品',
    'assets/img/dish-tremella.jpg', '润燥清甜，凉了更好喝。润肺止咳好东西',
    '[{"name":"干银耳","amount":1,"unit":"朵","role":"main","note":"选金黄色的，不要白的（白的可能漂过）"},{"name":"雪梨","amount":1,"unit":"个","role":"main","note":"选鸭梨最甜，去皮去核切小块"},{"name":"枸杞","amount":15,"unit":"粒","role":"sub","note":"红色饱满，最后 10 分钟放"}]'::jsonb, '[{"name":"黄冰糖","amountText":"25g","brandNote":"黄冰糖比白冰糖香，可按口味增减"},{"name":"清水","amountText":"1200ml","brandNote":"分两次加"}]'::jsonb, '[{"description":"干银耳用冷水泡 15 分钟至完全舒展发软，剪去底部黄色硬根，用手撕成小朵（撕比刀切容易出胶）","durationMinutes":15,"needTimer":true,"heatTip":"冷水泡","tip":"底部黄根一定要去，不然发苦"},{"description":"银耳加清水 1000ml，大火烧开后转最小火**盖盖炖 30 分钟**，期间不要开盖，让它慢慢熬出胶","durationMinutes":30,"needTimer":true,"heatTip":"小火 90-100°C","tip":"中途可以开盖搅一下防糊底，但别加水别关火"},{"description":"30 分钟后银耳应该已经变浓稠，加入雪梨块 + 冰糖 25g + 清水 200ml，再炖 10 分钟","durationMinutes":10,"needTimer":true,"heatTip":"小火","tip":"雪梨不能早放，炖久了会烂"},{"description":"最后 5 分钟放枸杞，关火后焖 5 分钟再开盖","durationMinutes":5,"needTimer":true,"heatTip":"关火焖","tip":"枸杞久煮颜色发白，口感也差，最后 5 分钟就够"},{"description":"搅匀盛碗，热喝暖心、冷藏后冰凉解暑","durationMinutes":0,"needTimer":false,"heatTip":""}]'::jsonb,
    15, 45, '易',
    4, '无', 'on',
    18, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000001', '椰香芒果布丁', '甜品',
    'assets/img/dish-mango.jpg', '奶香浓郁口感细腻，冰箱冷藏 2 小时就好',
    '[{"name":"成熟芒果","amount":2,"unit":"个","role":"main","note":"选黄透的台农或小台农，果肉约 300g"},{"name":"吉利丁片","amount":10,"unit":"g","role":"sub","note":"约 2 片半，用冰水泡软"},{"name":"纯牛奶","amount":200,"unit":"ml","role":"sub","note":"常温"},{"name":"淡奶油","amount":150,"unit":"ml","role":"sub","note":"冷藏后口感好"}]'::jsonb, '[{"name":"细砂糖","amountText":"30g","brandNote":"按芒果甜度调整"},{"name":"椰浆","amountText":"50ml","brandNote":"可选，加了更香"}]'::jsonb, '[{"description":"吉利丁片用冰水泡软（约 5 分钟），不要用热水（会化）","durationMinutes":5,"needTimer":true,"heatTip":"冰水","tip":"吉利丁是凝固关键，泡软后捏干水分"},{"description":"芒果去皮去核切小块，用料理机打成细腻的芒果泥（越细口感越好）","durationMinutes":3,"needTimer":false,"heatTip":"","tip":"也可以压过筛更细，喜欢有颗粒感就不筛"},{"description":"牛奶 + 椰浆 + 细砂糖放小锅，小火加热到 60°C 左右（冒热气但不沸腾），搅拌让糖融化","durationMinutes":4,"needTimer":true,"heatTip":"小火","tip":"千万不要煮沸，沸腾会让吉利丁失活"},{"description":"关火，把泡软捏干的吉利丁片放进去，搅拌到完全融化","durationMinutes":1,"needTimer":false,"heatTip":"关火余温","tip":"关火后温度刚好，吉利丁一搅就化"},{"description":"加淡奶油 + 芒果泥，搅匀成均匀的芒果糊，过筛去掉未融化的颗粒","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"过筛后更细腻，不过筛也能吃"},{"description":"倒入碗或杯子，表面用保鲜膜封住（防冷凝水滴落），放冰箱冷藏 2 小时以上","durationMinutes":120,"needTimer":true,"heatTip":"冰箱 4°C","tip":"冷藏够 2 小时才会凝固成型，急着吃也别少于 1.5 小时"},{"description":"取出可以撒芒果丁、薄荷叶或椰蓉装饰","durationMinutes":0.5,"needTimer":false,"heatTip":""}]'::jsonb,
    15, 15, '易',
    4, '含乳制品', 'on',
    19, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();

insert into public.dish (
    id, created_by, name, category, image_url, intro,
    ingredients, seasonings, steps,
    prep_minutes, cooking_minutes, difficulty,
    servings_per, allergens, status, sort_no, has_recipe
  ) values (
    'dddddddd-1000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', '桂花红豆沙', '甜品',
    'assets/img/dish-red-bean-soup.jpg', '绵密沙糯，热乎一碗最熨帖，还能当汤圆底',
    '[{"name":"红豆","amount":200,"unit":"g","role":"main","note":"选细长的赤小豆更易出沙"},{"name":"陈皮","amount":1,"unit":"小块","role":"sub","note":"约 2g，没有可省略"}]'::jsonb, '[{"name":"冰糖","amountText":"60g","brandNote":"黄冰糖更润，按口味增减"},{"name":"清水","amountText":"1200ml","brandNote":"分两次加"},{"name":"干桂花","amountText":"2g","brandNote":"关火后撒，香气最足"}]'::jsonb, '[{"description":"红豆淘洗干净，用清水泡 2 小时（赶时间可省略，但要多煮 20 分钟）。**不要提前加糖**","durationMinutes":120,"needTimer":true,"heatTip":"","tip":"糖会让红豆表皮变硬，煮再久也不出沙"},{"description":"红豆连泡水倒入锅中，加清水 1000ml + 陈皮，大火烧开后转最小火盖盖煮 40 分钟","durationMinutes":40,"needTimer":true,"heatTip":"小火 95°C","tip":"陈皮能去豆腥还解腻，老广做法"},{"description":"开盖检查：豆子一捏就烂就对了，用勺子背把豆子压碎一部分，留一部分完整的有口感","durationMinutes":2,"needTimer":false,"heatTip":"","tip":"压碎一部分是\"沙\"的关键，全压成泥就变成豆泥了"},{"description":"加冰糖 60g + 清水 200ml，边搅边煮 10 分钟至糖化、汤汁浓稠挂勺","durationMinutes":10,"needTimer":true,"heatTip":"小火","tip":"中途多搅，红豆沙很容易糊底"},{"description":"关火撒干桂花 2g，盖盖焖 3 分钟让香气融进去，盛碗。冷藏后加椰浆也很好吃","durationMinutes":3,"needTimer":true,"heatTip":"关火焖","tip":"桂花遇高温香气会跑，一定关火后放"}]'::jsonb,
    10, 70, '易',
    4, '无', 'on',
    20, true
  )
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    image_url = excluded.image_url,
    intro = excluded.intro,
    ingredients = excluded.ingredients,
    seasonings = excluded.seasonings,
    steps = excluded.steps,
    prep_minutes = excluded.prep_minutes,
    cooking_minutes = excluded.cooking_minutes,
    difficulty = excluded.difficulty,
    servings_per = excluded.servings_per,
    allergens = excluded.allergens,
    status = excluded.status,
    sort_no = excluded.sort_no,
    has_recipe = excluded.has_recipe,
    updated_at = now();
