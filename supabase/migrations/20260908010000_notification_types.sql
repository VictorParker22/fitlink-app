-- request_coach() and create_client_and_notify() insert notifications of type
-- 'coach_request' and 'new_client'; the check constraint never allowed them,
-- so every one of those inserts failed inside the functions' exception
-- blocks and coaches were never told. Found while adding the invitation
-- types on 2026-09-08. Widen the constraint to every type a function or the
-- app writes.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'message', 'score', 'water', 'workout', 'nutrition', 'file',
    'coach_request', 'new_client', 'invite_accepted', 'client_left'
  ]::text[]));

select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'notifications_type_check';
