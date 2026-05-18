-- After you create a user via Supabase Auth (email + password),
-- run this in the SQL editor with your real values to make them a team member.
--
-- 1. Replace the email below with the user you just created.
-- 2. Replace the role if needed: 'admin' | 'coordinator' | 'photographer' | 'editor'.

insert into team_members (id, email, full_name, role)
select id, email, coalesce(raw_user_meta_data->>'full_name', email), 'admin'
from auth.users
where email = 'you@oceanoblue.net'
on conflict (id) do update
  set role = excluded.role,
      full_name = excluded.full_name;
