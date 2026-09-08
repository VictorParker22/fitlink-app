-- stripe-webhook inserts type 'cohort_over_capacity' (and wrote to `body` /
-- `data`, which do not exist: the columns are description / metadata). Admit
-- the type; the function is fixed alongside this.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'message', 'score', 'water', 'workout', 'nutrition', 'file',
    'coach_request', 'new_client', 'invite_accepted', 'client_left',
    'cohort_over_capacity', 'pass_purchased'
  ]::text[]));
select 'ok' as done;
