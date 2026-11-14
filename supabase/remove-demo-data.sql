-- Removes the demo data added for the capstone presentation.
-- Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Real data is not touched: demo rows are recognized by their markers.

-- Demo sessions (ids from 900000000000000 up); private notes and
-- waitlist entries go with them
delete from public.appointments where id >= 900000000000000;

-- Demo anonymous concerns
delete from public.concerns where ref like 'GC-DEMO%';

-- Demo students (profiles only, no sign-in); their notifications go with them
delete from public.profiles where username like 'demo\_%' and auth_id is null;

-- The demo sign-in accounts (counselor1, student1) are kept. To remove them too,
-- delete them in Authentication -> Users.
