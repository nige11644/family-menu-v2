-- ============================================================================
-- 家宴 · 头像字段
--
-- 只存预设头像的 key（如 chef / bowl / cat），空字符串表示用昵称首字。
-- 已经执行过 schema.sql 的库，单独执行本文件即可；脚本可重复执行。
-- ============================================================================

alter table public.user_profiles
  add column if not exists avatar text not null default '';

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_profiles'
  and column_name = 'avatar';
