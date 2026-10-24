-- ============================================================================
-- 家宴 · 家庭成员头像共享
--
-- 让同一家庭的成员互相看到头像：只返回昵称、角色、头像三个公开字段，
-- 不暴露 push_key 等 user_profiles 私有字段。执行一次即可，可重复执行。
-- ============================================================================

create or replace function public.family_avatars(p_family_id uuid)
returns table (user_id uuid, nickname text, role int, avatar text)
language sql
stable
security definer
set search_path = public
as $$
  select fm.user_id,
         fm.nickname,
         fm.role,
         coalesce(p.avatar, '') as avatar
  from public.family_member fm
  join public.user_profiles p on p.user_id = fm.user_id
  where fm.family_id = p_family_id
    and public.belongs_to_family(p_family_id);
$$;

grant execute on function public.family_avatars(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
